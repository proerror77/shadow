import pytest
from tools import TOOLS, handle_tool_call

def test_tools_registered():
    tool_names = [t["name"] for t in TOOLS]
    assert "trigger_video_node" in tool_names
    assert "get_story_progress" in tool_names

def test_trigger_video_node_schema():
    tool = next(t for t in TOOLS if t["name"] == "trigger_video_node")
    props = tool["input_schema"]["properties"]
    assert "node_id" in props
    assert "scene_description" in props
    assert "session_id" in props

def test_get_story_progress_schema():
    tool = next(t for t in TOOLS if t["name"] == "get_story_progress")
    props = tool["input_schema"]["properties"]
    assert "session_id" in props

def test_handle_trigger_video_node(monkeypatch):
    import httpx
    calls = []
    def mock_post(url, json, timeout):
        calls.append(json)
        class R:
            def raise_for_status(self): pass
            def json(self): return {"job_id": "job-123"}
        return R()
    monkeypatch.setattr(httpx, "post", mock_post)
    result = handle_tool_call("trigger_video_node", {
        "node_id": "n1",
        "scene_description": "A dark forest",
        "session_id": "sess-abc"
    })
    assert result["job_id"] == "job-123"
    assert calls[0]["node_id"] == "n1"

def test_handle_get_story_progress(monkeypatch):
    import httpx
    def mock_get(url, timeout):
        class R:
            def raise_for_status(self): pass
            def json(self): return {"current_node": 3, "total_nodes": 10}
        return R()
    monkeypatch.setattr(httpx, "get", mock_get)
    result = handle_tool_call("get_story_progress", {"session_id": "sess-abc"})
    assert result["current_node"] == 3
