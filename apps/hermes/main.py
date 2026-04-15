"""
影境 Hermes Agent — FastAPI HTTP 服务
"""
import shadow_tools  # noqa: F401 — 注册自定义工具到 registry
from fastapi import FastAPI
from pydantic import BaseModel
from agent_pool import get_agent, remove_agent

app = FastAPI(title="影境 Hermes Agent")


class MessageRequest(BaseModel):
    user_id: str
    session_id: str
    text: str


class MessageResponse(BaseModel):
    text: str
    completed: bool


@app.post("/chat", response_model=MessageResponse)
def chat(req: MessageRequest):
    agent = get_agent(req.user_id)
    result = agent.run_conversation(
        user_message=req.text,
        task_id=req.session_id,
    )
    return MessageResponse(
        text=result["final_response"] or "",
        completed=result["completed"],
    )


@app.delete("/users/{user_id}")
def end_session(user_id: str):
    """游戏结束，清理 agent 实例。"""
    remove_agent(user_id)
    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok"}
