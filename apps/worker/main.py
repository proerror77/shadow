"""
影境 Worker — Redis video queue worker + WebSocket push server。
两个 asyncio task 在同一个 event loop 中运行。
"""
import asyncio
import logging
import os
import websockets
import worker
import ws_server

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

WS_PORT = int(os.environ.get("WS_PORT", "8001"))


async def main():
    # Start WebSocket server
    ws_task = websockets.serve(ws_server.handle_connection, "0.0.0.0", WS_PORT)
    # Start worker loop
    worker_task = worker.run_worker()

    async with ws_task:
        logging.info("[main] WebSocket server on :%d", WS_PORT)
        await worker_task  # runs forever


if __name__ == "__main__":
    asyncio.run(main())
