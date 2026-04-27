"""LangGraph agent graph — parallel orchestrator.

Graph shape:

    orchestrate
        │
        └── [Send fan-out — all agents run in parallel]
             ├── email_agent    ─┐
             ├── calendar_agent ─┤── agent_results (operator.add reducer)
             ├── notion_agent   ─┤
             └── direct_reply   ─┘
                                 │
                            merge_results
                                 │
                                END

Memory extraction runs after the HTTP response (post_chat_memory_extraction)
so it does not add latency to the reply path.
"""

from functools import partial

from langchain_openai import ChatOpenAI
from langgraph.constants import Send
from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from agents.calendar_agent_node import calendar_agent_node
from agents.email_agent_node import email_agent_node
from agents.notion_agent_node import notion_agent_node
from agents.orchestrator_node import (
    ROUTE_CALENDAR,
    ROUTE_DIRECT,
    ROUTE_EMAIL,
    ROUTE_NOTION,
    direct_reply_node,
    merge_results_node,
    orchestrate_node,
)
from agents.state import AgentState

NODE_ORCHESTRATE = "orchestrate"
NODE_EMAIL = "email_agent"
NODE_CALENDAR = "calendar_agent"
NODE_NOTION = "notion_agent"
NODE_DIRECT = "direct_reply"
NODE_MERGE = "merge_results"

_ROUTE_TO_NODE = {
    ROUTE_EMAIL: NODE_EMAIL,
    ROUTE_CALENDAR: NODE_CALENDAR,
    ROUTE_NOTION: NODE_NOTION,
    ROUTE_DIRECT: NODE_DIRECT,
}


def _fan_out(state: AgentState) -> list[Send]:
    """Fan out to one agent per task; all run in parallel."""
    tasks = state.get("tasks") or []
    sends = [
        Send(
            _ROUTE_TO_NODE.get(task.get("route", ROUTE_DIRECT), NODE_DIRECT),
            {**state, "current_task": task},
        )
        for task in tasks
    ]
    if not sends:
        sends = [Send(NODE_DIRECT, {**state, "current_task": {"intent": "", "route": ROUTE_DIRECT}})]
    return sends


def build_graph(llm: ChatOpenAI) -> CompiledStateGraph:
    """Construct and compile the parallel orchestrator graph."""
    graph = StateGraph(AgentState)

    graph.add_node(NODE_ORCHESTRATE, partial(orchestrate_node, llm=llm))
    graph.add_node(NODE_EMAIL, partial(email_agent_node, llm=llm))
    graph.add_node(NODE_CALENDAR, partial(calendar_agent_node, llm=llm))
    graph.add_node(NODE_NOTION, partial(notion_agent_node, llm=llm))
    graph.add_node(NODE_DIRECT, partial(direct_reply_node, llm=llm))
    graph.add_node(NODE_MERGE, partial(merge_results_node, llm=llm))

    graph.set_entry_point(NODE_ORCHESTRATE)
    graph.add_conditional_edges(
        NODE_ORCHESTRATE,
        _fan_out,
        [NODE_EMAIL, NODE_CALENDAR, NODE_NOTION, NODE_DIRECT],
    )
    for node in [NODE_EMAIL, NODE_CALENDAR, NODE_NOTION, NODE_DIRECT]:
        graph.add_edge(node, NODE_MERGE)
    graph.add_edge(NODE_MERGE, END)

    return graph.compile()
