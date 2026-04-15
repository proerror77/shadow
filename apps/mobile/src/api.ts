const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8080';

export interface Session {
  session_id: string;
  current_node: number;
  total_nodes: number;
}

export interface MessageResponse {
  session_id: string;
  text: string;
}

export interface VideoReadyEvent {
  type: 'video_ready';
  job_id: string;
  node_id: string;
  session_id: string;
  video_url: string;
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${API_BASE}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json();
}

export async function sendMessage(sessionId: string, text: string): Promise<MessageResponse> {
  const res = await fetch(`${API_BASE}/api/v1/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
  return res.json();
}

export function connectWebSocket(
  sessionId: string,
  onVideoReady: (event: VideoReadyEvent) => void
): WebSocket {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/ws?session_id=${sessionId}`);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data) as VideoReadyEvent;
      if (data.type === 'video_ready') onVideoReady(data);
    } catch {}
  };
  return ws;
}
