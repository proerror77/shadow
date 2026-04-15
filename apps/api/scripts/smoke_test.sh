#!/usr/bin/env bash
set -euo pipefail

BASE="http://localhost:8080"
HERMES="http://localhost:5001"

echo "=== Shadow MVP Smoke Test ==="

# 1. Health checks
echo "[1] Hermes health..."
curl -sf "$HERMES/health" | jq -r '"  model: " + .model'

# 2. Create session
echo "[2] Creating session..."
SESSION=$(curl -sf -X POST "$BASE/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d '{}')
SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
echo "  session_id: $SESSION_ID"

# 3. Queue a video job directly
echo "[3] Queuing video job..."
JOB=$(curl -sf -X POST "$BASE/internal/video/queue" \
  -H "Content-Type: application/json" \
  -d "{\"node_id\":\"node-1\",\"scene_description\":\"Opening scene\",\"session_id\":\"$SESSION_ID\"}")
JOB_ID=$(echo "$JOB" | jq -r '.job_id')
echo "  job_id: $JOB_ID"

# 4. Wait for worker
sleep 0.5

# 5. Check result
echo "[4] Checking Redis result..."
RESULT=$(redis-cli GET "video:result:$JOB_ID")
if [ -z "$RESULT" ]; then
  echo "  FAIL: no result in Redis"
  exit 1
fi
VIDEO_URL=$(echo "$RESULT" | jq -r '.video_url')
echo "  video_url: $VIDEO_URL"

# 6. Send a message through Hermes
echo "[5] Sending message through Hermes..."
REPLY=$(curl -sf -X POST "$BASE/api/v1/sessions/$SESSION_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{"text":"Tell me the story of the shadow realm"}')
echo "  reply: $(echo "$REPLY" | jq -r '.text' | head -c 100)..."

echo ""
echo "=== All checks passed ==="
