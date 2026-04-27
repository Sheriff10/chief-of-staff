"""Tests for Notion agent parameter handling."""

from agents.notion_agent_node import _coerce_notion_tool_params, _filter_tool_kwargs
from agents.tools.notion_agent_tools import tool_search_workspace


def test_coerce_search_workspace_filter_alias() -> None:
    raw = {"query": "tasks", "filter": {"property": "object", "value": "database"}}
    coerced = _coerce_notion_tool_params("search_workspace", raw)
    assert "filter" not in coerced
    assert coerced["filter_obj"] == {"property": "object", "value": "database"}


def test_coerce_normalizes_database_id() -> None:
    compact = "a1b2c3d4e5f6789012345678901234ab"
    coerced = _coerce_notion_tool_params(
        "query_database",
        {"database_id": compact, "page_size": 10},
    )
    assert coerced["database_id"] == "a1b2c3d4-e5f6-7890-1234-5678901234ab"


def test_filter_tool_kwargs_drops_unknown_keys() -> None:
    bloated = {
        "query": "x",
        "filter_obj": None,
        "explanation": "should be dropped",
    }
    filtered = _filter_tool_kwargs(tool_search_workspace, bloated)
    assert "explanation" not in filtered
    assert filtered["query"] == "x"
