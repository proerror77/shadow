"""
WebSocket hub — 管理 session_id → websocket connections。
Worker 调用 broadcast() 推送 video_ready 事件。
"""
import asyncio
import json
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# session_id → set of websocket connections
_clients: dict[str, set] = defaultdict(set)


def register(session_id: str, ws) -> None:
    _clients[session_id].add(ws)
    logger.info("[ws] registered session=%s total=%d", session_id, len(_clients[session_id]))


def unregister(session_id: str, ws) -> None:
    _clients[session_id].discard(ws)
    if not _clients[session_id]:
        del _clients[session_id]
    logger.info("[ws] unregistered session=%s", session_id)


async def broadcast(session_id: str, message: dict) -> None:
    data = json.dumps(message)
    dead = set()
    for ws in list(_clients.get(session_id, [])):
        try:
            await ws.send(data)
        except Exception:
            dead.add(ws)
    for ws in dead:
        unregister(session_id, ws)


async def handle_connection(websocket, path=None):
    """Handle incoming WebSocket connection."""
    import urllib.parse
    # Parse session_id from query string
    query = urllib.parse.parse_qs(urllib.parse.urlparse(websocket.path).query)
    session_ids = query.get("session_id", [])
    if not session_ids:
        await websocket.close(1008, "session_id required")
        return
    session_id = session_ids[0]
    register(session_id, websocket)
    try:
        async for _ in websocket:
            pass  # keep alive, ignore incoming messages
    finally:
        unregister(session_id, websocket)
