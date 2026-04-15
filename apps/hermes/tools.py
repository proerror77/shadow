import os
import httpx

GO_API_BASE = os.environ.get("GO_API_BASE", "http://localhost:8080")

TOOLS = [
    {
        "name": "trigger_video_node",
        "description": (
            "Queue a video generation job for a story node. "
            "Call this when the narrative reaches a point that requires a video scene. "
            "Returns a job_id that can be used to track generation status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "Unique identifier for the story node (e.g. 'node-5')"
                },
                "scene_description": {
                    "type": "string",
                    "description": "Detailed visual description of the scene to generate"
                },
                "session_id": {
                    "type": "string",
                    "description": "The active story session ID"
                }
            },
            "required": ["node_id", "scene_description", "session_id"]
        }
    },
    {
        "name": "get_story_progress",
        "description": (
            "Retrieve the current progress of a story session: "
            "which node is active, how many nodes have been completed, "
            "and which video jobs are pending or done."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "The active story session ID"
                }
            },
            "required": ["session_id"]
        }
    }
]


def handle_tool_call(tool_name: str, tool_input: dict) -> dict:
    if tool_name == "trigger_video_node":
        resp = httpx.post(
            f"{GO_API_BASE}/internal/video/queue",
            json=tool_input,
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()

    if tool_name == "get_story_progress":
        session_id = tool_input["session_id"]
        resp = httpx.get(
            f"{GO_API_BASE}/internal/sessions/{session_id}/progress",
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()

    raise ValueError(f"Unknown tool: {tool_name}")
