"""
Redis video queue worker + MockAdapter。
BRPop from video:queue → simulate generation → store result → broadcast via WebSocket.
"""
import asyncio
import json
import logging
import os
import redis.asyncio as aioredis
import ws_server

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
QUEUE_KEY = "video:queue"
RESULT_PREFIX = "video:result:"
RESULT_TTL = 86400  # 24h


async def mock_generate(job: dict) -> dict:
    """Simulate video generation with 100ms delay."""
    await asyncio.sleep(0.1)
    return {
        "job_id": job["job_id"],
        "node_id": job["node_id"],
        "session_id": job["session_id"],
        "video_url": f"https://mock-cdn.shadow.local/videos/{job['job_id']}.mp4",
        "duration_seconds": 15.0,
    }


async def run_worker():
    rdb = aioredis.from_url(REDIS_URL)
    logger.info("[worker] started, listening on %s", QUEUE_KEY)
    while True:
        try:
            item = await rdb.brpop(QUEUE_KEY, timeout=5)
            if item is None:
                continue
            _, raw = item
            job = json.loads(raw)
            logger.info("[worker] processing job=%s node=%s", job["job_id"], job["node_id"])

            result = await mock_generate(job)

            # Store result in Redis
            await rdb.set(
                f"{RESULT_PREFIX}{job['job_id']}",
                json.dumps(result),
                ex=RESULT_TTL,
            )

            # Push video_ready to WebSocket clients
            await ws_server.broadcast(job["session_id"], {
                "type": "video_ready",
                "job_id": result["job_id"],
                "node_id": result["node_id"],
                "session_id": result["session_id"],
                "video_url": result["video_url"],
            })
            logger.info("[worker] done job=%s url=%s", job["job_id"], result["video_url"])

        except Exception as e:
            logger.error("[worker] error: %s", e)
            await asyncio.sleep(1)
