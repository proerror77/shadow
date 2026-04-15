"""
影境自定义工具 — 注册到 Hermes Agent tool registry。
在 main.py 启动时 import 此模块即可完成注册。
"""
import json
import os
import redis
import uuid
from tools.registry import registry

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
_rdb = redis.from_url(REDIS_URL)

# ── trigger_video_node ────────────────────────────────────────────────────────

TRIGGER_VIDEO_SCHEMA = {
    "name": "trigger_video_node",
    "description": (
        "当叙事到达情感高潮或关键转折点时调用此工具，触发视频生成。"
        "返回 job_id 用于追踪生成状态。"
        "每局游戏最多调用 12 次。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "node_id": {
                "type": "string",
                "description": "故事节点标识符，如 'node-3'"
            },
            "scene_description": {
                "type": "string",
                "description": "这一幕的详细视觉描述，用于视频生成"
            },
            "session_id": {
                "type": "string",
                "description": "当前故事会话 ID"
            }
        },
        "required": ["node_id", "scene_description", "session_id"]
    }
}


def _handle_trigger_video(node_id: str, scene_description: str, session_id: str) -> str:
    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id,
        "node_id": node_id,
        "scene_description": scene_description,
        "session_id": session_id,
    }
    _rdb.lpush("video:queue", json.dumps(job))
    return json.dumps({"job_id": job_id, "status": "queued"})


registry.register(
    name="trigger_video_node",
    toolset="shadow",
    schema=TRIGGER_VIDEO_SCHEMA,
    handler=_handle_trigger_video,
    emoji="🎬",
)

# ── get_story_progress ────────────────────────────────────────────────────────

PROGRESS_SCHEMA = {
    "name": "get_story_progress",
    "description": "查询当前故事进度：已触发节点数、剩余节点数。",
    "parameters": {
        "type": "object",
        "properties": {
            "session_id": {
                "type": "string",
                "description": "当前故事会话 ID"
            }
        },
        "required": ["session_id"]
    }
}


def _handle_get_progress(session_id: str) -> str:
    key = f"story:progress:{session_id}"
    node_count = int(_rdb.get(key) or 0)
    return json.dumps({
        "session_id": session_id,
        "nodes_triggered": node_count,
        "nodes_remaining": max(0, 12 - node_count),
        "total_nodes": 12,
    })


registry.register(
    name="get_story_progress",
    toolset="shadow",
    schema=PROGRESS_SCHEMA,
    handler=_handle_get_progress,
    emoji="📊",
)
