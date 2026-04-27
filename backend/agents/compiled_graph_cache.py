"""Cache compiled LangGraph instances — graph structure is static per chat model.

Compiling on every request adds tens of milliseconds; the graph only differs by which
ChatOpenAI instance is bound to nodes.
"""

from functools import lru_cache

from langgraph.graph.state import CompiledStateGraph

from agents.graph import build_graph
from config import chat_llm, get_settings


@lru_cache(maxsize=64)
def get_compiled_agent_graph(chat_model: str) -> CompiledStateGraph:
    """Return a compiled graph for the given OpenRouter model id."""
    settings = get_settings()
    llm = chat_llm(settings, model=chat_model)
    return build_graph(llm)
