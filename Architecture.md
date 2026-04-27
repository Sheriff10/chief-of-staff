# Architecture — Personal Chief of Staff

This document explains the system design, data flow, agent orchestration, and infrastructure decisions behind the Personal Chief of Staff project.

---

## System Overview

The system is a multi-agent AI pipeline with a human-in-the-loop approval gate. It connects to external tools (Gmail, Google Calendar, Notion) via MCP servers, retrieves relevant context via RAG, generates outputs with a fine-tuned model, and presents results to the user before taking any action.

```
User (voice/text)
      │
      ▼
 Next.js Frontend
      │  WebSocket (streaming)
      ▼
 FastAPI Backend
      │
      ▼
 Intent Classifier  ──────────────────────────────────┐
      │                                                │
      ▼                                                ▼
 LangGraph Orchestrator                        Simple Q&A Handler
      │
      ├──► Calendar Agent  ──► Google Calendar MCP
      ├──► Email Agent     ──► Gmail MCP
      └──► Memory Agent    ──► Notion MCP + Vector DB (RAG)
                │
                ▼
         Synthesis Node
                │
                ▼
         Draft Node  ──► Fine-tuned Model (QLoRA adapter)
                │         or Ollama fallback (privacy mode)
                ▼
       Approval Gate  ──► User confirms / edits / rejects
                │
                ▼
         Action Node  ──► Sends email / creates event / updates Notion
```

---

## Component Breakdown

### 1. Frontend — `frontend/`

Built with Next.js 14 (App Router).

- **Chat interface** streams responses token-by-token via WebSocket connection to FastAPI.
- **Voice input** uses the browser's MediaRecorder API to capture audio, sends it to a Whisper endpoint, and injects the transcription as a text message.
- **Approval modal** renders the agent's draft and presents three options: Approve, Edit, Reject. No action fires until the user makes a choice.
- **State management** is handled with React context — conversation history, approval state, and agent status are kept client-side.

### 2. Backend — `backend/`

Built with FastAPI.

- **`/chat` (WebSocket)** — Accepts a user message, routes it to the agent graph, and streams the response back as Server-Sent Events.
- **`/approve` (POST)** — Receives the user's decision on a pending action and triggers the action node.
- **`/ingest` (POST)** — Triggers the RAG ingestion pipeline for new documents.
- **`services/llm.py`** — Unified LLM interface. Routes to Claude/GPT-4o by default, falls back to Ollama for privacy-flagged requests (e.g. personal health data).
- **`services/streaming.py`** — Wraps LangGraph's async generator into a FastAPI StreamingResponse.

### 3. Agent Orchestration — `agents/`

Built with LangGraph.

#### Intent Classifier — `classifier.py`

The first node every message hits. It uses a lightweight LLM call with structured output to classify the request into one of:

- `calendar` — anything about schedule, meetings, availability
- `email` — drafting, summarising, replying to messages
- `memory` — retrieving past context, notes, meeting summaries
- `compound` — multiple of the above (most common)
- `simple` — a direct question that doesn't need tool use

Classification result determines which agents get activated.

#### LangGraph State Machine — `graph.py`

Uses a shared `AgentState` TypedDict as a blackboard. All agents read from and write to this shared state. Nodes run in parallel where possible (calendar + email + memory can all gather context simultaneously).

```python
class AgentState(TypedDict):
    messages: list[BaseMessage]
    intent: str
    calendar_context: str
    email_context: str
    memory_context: str
    draft: str
    approved: bool
    action_result: str
```

#### Agent Nodes

| Node             | Responsibility                                         |
| ---------------- | ------------------------------------------------------ |
| `research_node`  | Fans out to calendar, email, memory agents in parallel |
| `synthesis_node` | Merges all context into a single prompt                |
| `draft_node`     | Generates the output using the fine-tuned model        |
| `approval_node`  | Pauses execution, waits for user confirmation          |
| `action_node`    | Executes the approved action via MCP                   |

#### MCP Tool Integration — `tools/`

Each tool wraps an MCP server connection:

- `calendar_tool.py` — Reads/writes Google Calendar events
- `email_tool.py` — Reads Gmail threads, sends emails
- `notion_tool.py` — Reads Notion pages, creates/updates entries

MCP provides a standardised protocol for tool calls, making it easy to swap providers (e.g. replace Notion with Confluence) without touching agent logic.

### 4. RAG Pipeline — `rag/`

**Ingestion (`ingest.py`)**

- Pulls pages from Notion via the Notion API
- Chunks documents using a recursive text splitter (chunk size: 512, overlap: 64)
- Generates embeddings with `text-embedding-3-small`
- Upserts into Pinecone with metadata (source, date, page title)

**Retrieval (`retriever.py`)**

- Takes the user query + current context as input
- Runs a semantic similarity search against Pinecone
- Returns the top-k chunks (default k=5) with reranking via cosine similarity
- Injected into the `memory_agent` context before synthesis

**Vector Store (`vectorstore.py`)**

- Pinecone for production (fast, managed, scalable)
- ChromaDB for local development (zero setup, runs in-process)
- Switched via `VECTOR_STORE` environment variable

### 5. Fine-Tuning — `fine_tuning/`

**Goal:** Make email drafts sound like the user, not like a generic LLM.

**Dataset preparation (`prepare_data.py`)**

- Exports the user's sent emails via Gmail API
- Formats them as instruction-following pairs:
  ```json
  {
    "instruction": "Reply to this email about a project delay",
    "input": "[original email thread]",
    "output": "[user's actual sent reply]"
  }
  ```

**Training (`train.py`)**

- Base model: `mistralai/Mistral-7B-v0.1`
- Method: QLoRA (4-bit quantisation + LoRA adapters)
- Library: Hugging Face `peft` + `trl`
- Target modules: `q_proj`, `v_proj`
- LoRA rank: 16, alpha: 32
- Training takes ~2 hours on a single A100 (Google Colab Pro)

**Inference**

- Adapter weights are loaded on top of the base model at runtime
- Falls back to standard prompted Claude/GPT-4o if adapter is not present

### 6. Infrastructure — `infra/`

**Containerisation**

- Backend runs in a Docker container
- `docker-compose.yml` orchestrates backend + ChromaDB for local development

**AWS Deployment**

- FastAPI backend deployed as a container on AWS Lambda (via Lambda Web Adapter)
- Static Next.js frontend deployed to S3 + CloudFront
- Pinecone handles vector storage (external managed service)
- Terraform manages all AWS resources as code

**CI/CD (`deploy.yml`)**

```
Push to main
    │
    ├── Run tests (pytest)
    ├── Build Docker image
    ├── Push to AWS ECR
    └── Deploy to Lambda
```

---

## Model Routing Strategy

The system selects models based on task type and privacy requirements:

| Scenario                  | Model Used                                              |
| ------------------------- | ------------------------------------------------------- |
| Default drafting          | Claude Sonnet (via Anthropic API)                       |
| High-volume simple tasks  | GPT-4o-mini (cost optimisation)                         |
| Privacy-sensitive content | Ollama Mistral 7B (runs locally, no data leaves device) |
| Email style generation    | Fine-tuned Mistral 7B adapter                           |

The routing logic lives in `backend/services/llm.py` and is configurable via environment variables.

---

## Human-in-the-Loop Design

Every write action (send email, create calendar event, update Notion) is gated behind explicit user approval. The approval flow:

1. Agent generates a draft and pauses the LangGraph execution
2. Draft is streamed to the frontend and displayed in the approval modal
3. User selects: **Approve** → action fires | **Edit** → user modifies draft, then approves | **Reject** → action is discarded, agent asks what to do instead
4. LangGraph resumes from the approval node with the user's decision

This design ensures the system is useful without being dangerous.

---

## Privacy Considerations

- All OAuth tokens are stored server-side and never exposed to the frontend
- Privacy mode routes sensitive queries to Ollama (local inference, no external API calls)
- Notion content is embedded and stored in a user-scoped Pinecone namespace
- No conversation history is stored beyond the active session unless explicitly enabled

---

## Scalability Notes

- LangGraph's async execution allows parallel agent runs — calendar, email, and memory context are fetched concurrently, not sequentially
- Pinecone scales horizontally without any changes to application code
- AWS Lambda scales to zero when idle — no cost when not in use
- The fine-tuned adapter is loaded once at cold start and cached in memory

---

## Key Design Decisions

**Why LangGraph over CrewAI?**
LangGraph gives fine-grained control over the state machine and supports human-in-the-loop interrupts natively. CrewAI is higher-level but makes it harder to pause execution for user approval — which is a core requirement of this system.

**Why MCP for tool integration?**
MCP provides a standardised protocol for connecting agents to external tools. It decouples tool implementation from agent logic, making it straightforward to add new integrations (Slack, Linear, etc.) without modifying the agent graph.

**Why QLoRA over full fine-tuning?**
Full fine-tuning a 7B parameter model requires significant GPU memory and time. QLoRA achieves comparable results with 4-bit quantisation and LoRA adapters, making it feasible to train on a single consumer GPU or a free Colab session.

**Why FastAPI over Django/Express?**
FastAPI's native async support and WebSocket handling make it ideal for streaming LLM responses. Its Pydantic integration also aligns well with LangGraph's typed state management.
