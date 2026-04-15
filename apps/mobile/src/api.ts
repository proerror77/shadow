const HERMES_BASE = process.env.EXPO_PUBLIC_HERMES_BASE ?? 'http://localhost:8000';
const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE ?? 'ws://localhost:8001';

export interface ChatResponse {
  text: string;
  completed: boolean;
}

export interface VideoReadyEvent {
  type: 'video_ready';
  job_id: string;
  node_id: string;
  session_id: string;
  video_url: string;
}

export async function sendMessage(
  userId: string,
  sessionId: string,
  text: string
): Promise<ChatResponse> {
  const res = await fetch(`${HERMES_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, session_id: sessionId, text }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  return res.json();
}

export async function endSession(userId: string): Promise<void> {
  await fetch(`${HERMES_BASE}/users/${userId}`, { method: 'DELETE' });
}

export function connectWebSocket(
  sessionId: string,
  onVideoReady: (event: VideoReadyEvent) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws?session_id=${sessionId}`);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as VideoReadyEvent;
      if (data.type === 'video_ready') onVideoReady(data);
    } catch {}
  };
  return ws;
}
