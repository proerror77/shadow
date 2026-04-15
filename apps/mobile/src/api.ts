const HERMES_BASE = process.env.EXPO_PUBLIC_HERMES_BASE ?? 'http://localhost:8000';
const WS_BASE = process.env.EXPO_PUBLIC_WS_BASE ?? 'ws://localhost:8001';
const FETCH_TIMEOUT_MS = 10_000;

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

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`request timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isVideoReadyEvent(data: unknown): data is VideoReadyEvent {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const event = data as Partial<VideoReadyEvent>;
  return (
    event.type === 'video_ready' &&
    typeof event.job_id === 'string' &&
    typeof event.node_id === 'string' &&
    typeof event.session_id === 'string' &&
    typeof event.video_url === 'string'
  );
}

export async function sendMessage(
  userId: string,
  sessionId: string,
  text: string
): Promise<ChatResponse> {
  const res = await fetchWithTimeout(`${HERMES_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, session_id: sessionId, text }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  return res.json();
}

export async function endSession(userId: string): Promise<void> {
  const res = await fetchWithTimeout(`${HERMES_BASE}/users/${userId}`, { method: 'DELETE' });
  if (!res.ok) {
    const details = await res.text().catch(() => '');
    throw new Error(`end session failed: ${res.status}${details ? ` ${details}` : ''}`);
  }
}

export function connectWebSocket(
  sessionId: string,
  onVideoReady: (event: VideoReadyEvent) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws?session_id=${sessionId}`);
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (isVideoReadyEvent(data)) {
        onVideoReady(data);
        return;
      }
      console.warn('Invalid websocket payload', data);
    } catch (error) {
      console.warn('Invalid websocket payload', e.data, error);
    }
  };
  return ws;
}
