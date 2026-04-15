"""
每个 user_id 维护一个 AIAgent 实例。
AIAgent 内部管理对话历史和记忆，实现用户隔离。
"""
import os
from threading import Lock
from run_agent import AIAgent

_pool: dict[str, AIAgent] = {}
_lock = Lock()

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.environ.get("HERMES_MODEL", "nousresearch/hermes-3-llama-3.1-70b")

SYSTEM_PROMPT = """你是影境（Shadow）的叙事 AI，一个沉浸式 AI 陪伴游戏的核心角色。

你陪伴用户经历一段互动故事。对话要有代入感、有情绪张力。

当叙事积累到足够的情感高潮或关键转折点时（通常在 5-10 轮对话后，或用户做出重要选择后），
使用 trigger_video_node 工具触发视频生成，将这一刻定格成影像。

使用 get_story_progress 了解当前故事进度，避免过早或过晚触发视频。

规则：
- 每局游戏最多触发 12 个视频节点
- 节点 10 之后引导故事走向结局
- 保持回复简洁有力，推动故事前进"""


def get_agent(user_id: str) -> AIAgent:
    """获取或创建用户的 AIAgent 实例。"""
    with _lock:
        if user_id not in _pool:
            _pool[user_id] = AIAgent(
                api_key=OPENROUTER_API_KEY,
                base_url=OPENROUTER_BASE_URL,
                model=MODEL,
                user_id=user_id,
                ephemeral_system_prompt=SYSTEM_PROMPT,
                enabled_toolsets=["shadow"],
                skip_context_files=True,
                quiet_mode=True,
            )
        return _pool[user_id]


def remove_agent(user_id: str) -> None:
    """游戏结束时清理 agent 实例。"""
    with _lock:
        _pool.pop(user_id, None)
