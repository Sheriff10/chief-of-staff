# Chief of Staff — AI Productivity Agent

An autonomous AI agent that manages your calendar, drafts emails, retrieves context from Notion, and helps you stay on top of tasks. Everything happens with your approval before any real-world action is taken.

---
## What it does

You type (or speak) a request like:

> "Summarize my week and draft a reply to the client email about the project delay."

The agent checks your Google Calendar, finds the relevant Gmail thread, pulls context from Notion, drafts a reply in your writing style, and shows it to you before sending.

Key capabilities:

- **Gmail** — triage inbox, draft replies, apply labels
- **Google Calendar** — summarise your week, flag conflicts
- **Notion** — retrieve context from your notes
- **Tasks** — create and track tasks with agent assignment (kanban board)
- **Voice** — speak your request via Groq Whisper STT
- **Background jobs** — scheduled recurring agent runs
- **Notifications** — in-app inbox for agent activity

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), Tailwind CSS, React Query |
| Backend | FastAPI, Python 3.11, SQLAlchemy (async) |
| Agent orchestration | LangGraph multi-agent graph |
| Tool integration | MCP (Model Context Protocol) |
| LLM | Claude / OpenRouter (configurable) |
| Embeddings | VoyageAI |
| Database | PostgreSQL (pgvector) |
| Cache | Redis |
| Voice | Groq Whisper STT + Edge TTS |
| Infrastructure | AWS ECS Fargate, RDS, ElastiCache, CloudFront, Terraform |

---

## Project structure

```
chief-of-staff/
├── frontend/          # Next.js app
│   ├── app/           # Pages: /, /tasks, /notifications, /background-jobs, /calendar
│   ├── components/    # UI components
│   ├── hooks/         # React Query hooks for every API resource
│   └── lib/           # Shared utilities
│
├── backend/           # FastAPI server
│   ├── routers/       # HTTP endpoints (chat, tasks, notifications, background-jobs, …)
│   ├── agents/        # LangGraph agent graph
│   ├── models/        # SQLAlchemy ORM models
│   ├── schemas/       # Pydantic request/response schemas
│   ├── services/      # Business logic
│   ├── jobs/          # APScheduler background jobs
│   └── db/            # Session, migrations, constants
│
├── infra/             # Terraform — AWS ECS Fargate + CloudFront deployment
│
└── scripts/           # Helper scripts
    └── deploy-ecs-images.sh   # One-command build → push → ECS rollout
```

---

## Local development

### Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL 15+ with `pgvector` extension
- Redis

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .

cp .env.example .env
# Fill in DATABASE_URL, JWT_SECRET, OPENROUTER_API_KEY, etc.

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

cp .env.example .env
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

npm run dev
```

The app runs at `http://localhost:3000`.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `JWT_SECRET` | Yes | Random 32+ char string for session signing |
| `OPENROUTER_API_KEY` | Yes | LLM access via OpenRouter |
| `REDIS_URL` | Yes | Redis URL (`redis://localhost:6379/0`) |
| `GOOGLE_CLIENT_ID` | For Gmail/Calendar | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Gmail/Calendar | Google OAuth client secret |
| `NOTION_CLIENT_ID` | For Notion | Notion OAuth client ID |
| `NOTION_CLIENT_SECRET` | For Notion | Notion OAuth client secret |
| `VOYAGEAI_API_KEY` | For memory/RAG | VoyageAI embeddings |
| `GROQ_API_KEY` | For voice | Groq Whisper STT |
| `INIT_DB_SCHEMA_ON_STARTUP` | Optional | Set `true` to auto-create tables on startup |
| `CORS_ALLOWED_ORIGINS` | Optional | Comma-separated allowed origins |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend URL (`http://localhost:8000`) |

---

## Deploy to AWS

Infrastructure is managed with Terraform in `infra/`. It provisions:

- **VPC** — public + private subnets across 2 AZs, NAT gateway
- **ECS Fargate** — backend and frontend containerised services behind ALBs
- **CloudFront** — HTTPS edge distribution in front of each ALB
- **ECR** — container registry for both images
- **RDS PostgreSQL 16** — private subnet, encrypted, 7-day backups
- **ElastiCache Redis 7** — private subnet

### First-time setup

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# Fill in all secrets in terraform.tfvars

terraform init

# Create ECR repos first so you can push images before the full apply
terraform apply -target=aws_ecr_repository.backend -target=aws_ecr_repository.frontend
```

### Build, push, and deploy — one command

The `scripts/deploy-ecs-images.sh` script handles the full deploy cycle: ECR login, Docker builds (injecting the correct `NEXT_PUBLIC_API_BASE_URL` at build time from Terraform state), image push, and ECS rolling deployment.

```bash
# Full deploy — build both images, push, and roll out new ECS tasks
./scripts/deploy-ecs-images.sh

# Build + push only, skip the ECS rollout
./scripts/deploy-ecs-images.sh --skip-ecs

# Push a versioned tag instead of latest
./scripts/deploy-ecs-images.sh --tag v1.2.3

# Override AWS region (default: read from terraform.tfvars → us-east-1)
AWS_REGION=eu-west-1 ./scripts/deploy-ecs-images.sh
```

**Requirements:** `docker`, `aws` CLI (authenticated), and `terraform` initialised with applied state in `infra/`.

After the first `terraform apply`, Terraform prints the live URLs:

```
frontend_url = "https://<cloudfront-domain>"   ← your app URL
backend_url  = "https://<cloudfront-domain>"   ← API URL
```

### Apply infrastructure changes only

```bash
cd infra
terraform apply -var-file=terraform.tfvars
```

### Manual ECS rollout (without the script)

```bash
aws ecs update-service \
  --cluster chief-of-staff-prod-cluster \
  --service chief-of-staff-prod-frontend \
  --force-new-deployment

aws ecs update-service \
  --cluster chief-of-staff-prod-cluster \
  --service chief-of-staff-prod-backend \
  --force-new-deployment
```

> `terraform.tfvars` is git-ignored. Never commit secrets.

---

## Running tests

```bash
cd backend
pytest tests/
```

---

## License

MIT
