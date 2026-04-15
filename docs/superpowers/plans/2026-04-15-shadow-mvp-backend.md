# 影境 MVP — Backend Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core dialogue→node→video pipeline: Go API + Hermes Agent (Claude) + Redis queue + MockAdapter video generation + WebSocket push.

**Architecture:** Go API orchestrates the flow. Hermes Agent (Python sidecar) runs the LLM conversation loop with custom tools. When trigger_video_node fires, Go queues a video job in Redis. A worker processes it via VideoGeneratorInterface. WebSocket notifies the client when video is ready (N-2 strategy).

**Tech Stack:** Go 1.22, Gin, go-redis/v9, gorilla/websocket, Python 3.11, Hermes Agent (Nous Research), Claude claude-opus-4-6, Redis 7

---

## Task 1: Project Dependencies Setup

**Files:** `apps/api/go.mod`, `apps/api/go.sum`, `apps/hermes/requirements.txt`

### Steps

- [ ] Initialize Go module and add dependencies
- [ ] Create Python requirements file
- [ ] Verify all dependencies resolve

### 1.1 Go Module Setup

```bash
cd /Users/proerror/Documents/shadow/apps/api
go mod init github.com/shadow/api
go get github.com/gin-gonic/gin@v1.9.1
go get github.com/redis/go-redis/v9@v9.5.1
go get github.com/gorilla/websocket@v1.5.1
go mod tidy
```

**`apps/api/go.mod`** (result after tidy):

```go
module github.com/shadow/api

go 1.22

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/gorilla/websocket v1.5.1
    github.com/redis/go-redis/v9 v9.5.1
)
```

### 1.2 Python Requirements

**`apps/hermes/requirements.txt`:**

```
anthropic>=0.25.0
httpx>=0.27.0
pydantic>=2.7.0
```

> Note: Hermes Agent (Nous Research) is integrated directly via the Anthropic SDK with custom tool definitions — no separate `hermes-agent` PyPI package is required for MVP.

### 1.3 Verify

```bash
cd /Users/proerror/Documents/shadow/apps/api && go build ./...
cd /Users/proerror/Documents/shadow/apps/hermes && pip install -r requirements.txt
```

### Commit

```bash
git add apps/api/go.mod apps/api/go.sum apps/hermes/requirements.txt
git commit -m "chore: add Go and Python dependencies for MVP backend"
```

---

## Task 2: Hermes Agent Sidecar Setup

**Files:** `apps/hermes/agent.py`, `apps/hermes/tools.py`, `apps/hermes/requirements.txt`

### Steps

- [ ] Write failing test for tool registration
- [ ] Implement tools.py with trigger_video_node and get_story_progress
- [ ] Implement agent.py with Claude claude-opus-4-6 and HTTP server
- [ ] Verify tests pass
- [ ] Commit

### 2.1 Failing Test First

**`apps/hermes/test_tools.py`:**

```python
import pytest
from tools import TOOLS, handle_tool_call

def test_tools_registered():
    tool_names = [t["name"] for t in TOOLS]
    assert "trigger_video_node" in tool_names
    assert "get_story_progress" in tool_names

def test_trigger_video_node_schema():
    tool = next(t for t in TOOLS if t["name"] == "trigger_video_node")
    props = tool["input_schema"]["properties"]
    assert "node_id" in props
    assert "scene_description" in props
    assert "session_id" in props

def test_get_story_progress_schema():
    tool = next(t for t in TOOLS if t["name"] == "get_story_progress")
    props = tool["input_schema"]["properties"]
    assert "session_id" in props

def test_handle_trigger_video_node(monkeypatch):
    import httpx
    calls = []
    def mock_post(url, json, timeout):
        calls.append(json)
        class R:
            def raise_for_status(self): pass
            def json(self): return {"job_id": "job-123"}
        return R()
    monkeypatch.setattr(httpx, "post", mock_post)
    result = handle_tool_call("trigger_video_node", {
        "node_id": "n1",
        "scene_description": "A dark forest",
        "session_id": "sess-abc"
    })
    assert result["job_id"] == "job-123"
    assert calls[0]["node_id"] == "n1"

def test_handle_get_story_progress(monkeypatch):
    import httpx
    def mock_get(url, timeout):
        class R:
            def raise_for_status(self): pass
            def json(self): return {"current_node": 3, "total_nodes": 10}
        return R()
    monkeypatch.setattr(httpx, "get", mock_get)
    result = handle_tool_call("get_story_progress", {"session_id": "sess-abc"})
    assert result["current_node"] == 3
```

Run (expect failure):
```bash
cd /Users/proerror/Documents/shadow/apps/hermes
python -m pytest test_tools.py -v
```

### 2.2 Implement tools.py

**`apps/hermes/tools.py`:**

```python
import os
import httpx

GO_API_BASE = os.environ.get("GO_API_BASE", "http://localhost:8080")

TOOLS = [
    {
        "name": "trigger_video_node",
        "description": (
            "Queue a video generation job for a story node. "
            "Call this when the narrative reaches a point that requires a video scene. "
            "Returns a job_id that can be used to track generation status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "node_id": {
                    "type": "string",
                    "description": "Unique identifier for the story node (e.g. 'node-5')"
                },
                "scene_description": {
                    "type": "string",
                    "description": "Detailed visual description of the scene to generate"
                },
                "session_id": {
                    "type": "string",
                    "description": "The active story session ID"
                }
            },
            "required": ["node_id", "scene_description", "session_id"]
        }
    },
    {
        "name": "get_story_progress",
        "description": (
            "Retrieve the current progress of a story session: "
            "which node is active, how many nodes have been completed, "
            "and which video jobs are pending or done."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "session_id": {
                    "type": "string",
                    "description": "The active story session ID"
                }
            },
            "required": ["session_id"]
        }
    }
]


def handle_tool_call(tool_name: str, tool_input: dict) -> dict:
    if tool_name == "trigger_video_node":
        resp = httpx.post(
            f"{GO_API_BASE}/internal/video/queue",
            json=tool_input,
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()

    if tool_name == "get_story_progress":
        session_id = tool_input["session_id"]
        resp = httpx.get(
            f"{GO_API_BASE}/internal/sessions/{session_id}/progress",
            timeout=10.0
        )
        resp.raise_for_status()
        return resp.json()

    raise ValueError(f"Unknown tool: {tool_name}")
```

### 2.3 Implement agent.py

**`apps/hermes/agent.py`:**

```python
import os
import json
import anthropic
from flask import Flask, request, jsonify
from tools import TOOLS, handle_tool_call

app = Flask(__name__)
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """You are Hermes, the narrative intelligence for 影境 (Shadow).
You guide users through an interactive shadow-puppet story experience.
At key dramatic moments, use trigger_video_node to queue video generation for the scene.
Use get_story_progress to understand where the user is in the story.
Keep responses immersive and atmospheric. Advance the story with each exchange."""


def run_agent_turn(session_id: str, messages: list) -> dict:
    """Run one agent turn, handling tool calls until a final text response."""
    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages
        )

        # Append assistant response to message history
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "end_turn":
            # Extract final text
            text = next(
                (block.text for block in response.content if hasattr(block, "text")),
                ""
            )
            return {"text": text, "messages": messages}

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    result = handle_tool_call(block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result)
                    })
            messages.append({"role": "user", "content": tool_results})
            continue

        # Unexpected stop reason
        break

    return {"text": "", "messages": messages}


@app.route("/agent/message", methods=["POST"])
def message():
    body = request.get_json()
    session_id = body["session_id"]
    messages = body.get("messages", [])
    user_text = body["text"]

    messages.append({"role": "user", "content": user_text})
    result = run_agent_turn(session_id, messages)
    return jsonify(result)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL})


if __name__ == "__main__":
    port = int(os.environ.get("HERMES_PORT", 5001))
    app.run(host="0.0.0.0", port=port)
```

Add flask to requirements:

```
anthropic>=0.25.0
flask>=3.0.0
httpx>=0.27.0
pydantic>=2.7.0
```

### 2.4 Verify Tests Pass

```bash
cd /Users/proerror/Documents/shadow/apps/hermes
python -m pytest test_tools.py -v
```

Expected output:
```
test_tools.py::test_tools_registered PASSED
test_tools.py::test_trigger_video_node_schema PASSED
test_tools.py::test_get_story_progress_schema PASSED
test_tools.py::test_handle_trigger_video_node PASSED
test_tools.py::test_handle_get_story_progress PASSED
5 passed
```

### Commit

```bash
git add apps/hermes/
git commit -m "feat(hermes): add Hermes agent sidecar with trigger_video_node and get_story_progress tools"
```

---

## Task 3: Go API Story Session Handler

**Files:** `apps/api/internal/handler/session.go`, `apps/api/internal/story/session.go`

### Steps

- [ ] Write failing tests for session endpoints
- [ ] Implement session store
- [ ] Implement session handler with Hermes forwarding
- [ ] Register routes in main.go
- [ ] Verify tests pass
- [ ] Commit

### 3.1 Failing Tests First

**`apps/api/internal/handler/session_test.go`:**

```go
package handler_test

import (
    "bytes"
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/shadow/api/internal/handler"
    "github.com/shadow/api/internal/story"
)

func setupRouter(h *handler.SessionHandler) *gin.Engine {
    gin.SetMode(gin.TestMode)
    r := gin.New()
    r.POST("/api/v1/sessions", h.CreateSession)
    r.POST("/api/v1/sessions/:id/messages", h.SendMessage)
    return r
}

func TestCreateSession(t *testing.T) {
    store := story.NewInMemoryStore()
    h := handler.NewSessionHandler(store, "http://localhost:5001")
    r := setupRouter(h)

    w := httptest.NewRecorder()
    req, _ := http.NewRequest("POST", "/api/v1/sessions", bytes.NewBufferString(`{}`))
    req.Header.Set("Content-Type", "application/json")
    r.ServeHTTP(w, req)

    if w.Code != http.StatusCreated {
        t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
    }
    var resp map[string]interface{}
    json.Unmarshal(w.Body.Bytes(), &resp)
    if resp["session_id"] == "" {
        t.Fatal("expected session_id in response")
    }
}

func TestSendMessage_SessionNotFound(t *testing.T) {
    store := story.NewInMemoryStore()
    h := handler.NewSessionHandler(store, "http://localhost:5001")
    r := setupRouter(h)

    w := httptest.NewRecorder()
    body := bytes.NewBufferString(`{"text":"hello"}`)
    req, _ := http.NewRequest("POST", "/api/v1/sessions/nonexistent/messages", body)
    req.Header.Set("Content-Type", "application/json")
    r.ServeHTTP(w, req)

    if w.Code != http.StatusNotFound {
        t.Fatalf("expected 404, got %d", w.Code)
    }
}
```

Run (expect failure):
```bash
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/handler/... -v -run TestCreateSession
```

### 3.2 Implement story/session.go

**`apps/api/internal/story/session.go`:**

```go
package story

import (
    "sync"
    "time"

    "github.com/google/uuid"
)

type Message struct {
    Role    string `json:"role"`
    Content string `json:"content"`
}

type Session struct {
    ID          string    `json:"id"`
    Messages    []Message `json:"messages"`
    CurrentNode int       `json:"current_node"`
    TotalNodes  int       `json:"total_nodes"`
    CreatedAt   time.Time `json:"created_at"`
}

type Store interface {
    Create() *Session
    Get(id string) (*Session, bool)
    AppendMessage(id string, msg Message) error
    IncrementNode(id string) error
}

type InMemoryStore struct {
    mu       sync.RWMutex
    sessions map[string]*Session
}

func NewInMemoryStore() *InMemoryStore {
    return &InMemoryStore{sessions: make(map[string]*Session)}
}

func (s *InMemoryStore) Create() *Session {
    sess := &Session{
        ID:         uuid.NewString(),
        Messages:   []Message{},
        TotalNodes: 10,
        CreatedAt:  time.Now(),
    }
    s.mu.Lock()
    s.sessions[sess.ID] = sess
    s.mu.Unlock()
    return sess
}

func (s *InMemoryStore) Get(id string) (*Session, bool) {
    s.mu.RLock()
    defer s.mu.RUnlock()
    sess, ok := s.sessions[id]
    return sess, ok
}

func (s *InMemoryStore) AppendMessage(id string, msg Message) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    sess, ok := s.sessions[id]
    if !ok {
        return ErrNotFound
    }
    sess.Messages = append(sess.Messages, msg)
    return nil
}

func (s *InMemoryStore) IncrementNode(id string) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    sess, ok := s.sessions[id]
    if !ok {
        return ErrNotFound
    }
    sess.CurrentNode++
    return nil
}

var ErrNotFound = fmt.Errorf("session not found")
```

Add missing import at top:
```go
import (
    "fmt"
    "sync"
    "time"

    "github.com/google/uuid"
)
```

Add uuid dependency:
```bash
cd /Users/proerror/Documents/shadow/apps/api
go get github.com/google/uuid@v1.6.0
go mod tidy
```

### 3.3 Implement handler/session.go

**`apps/api/internal/handler/session.go`:**

```go
package handler

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io"
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/shadow/api/internal/story"
)

type SessionHandler struct {
    store      story.Store
    hermesBase string
}

func NewSessionHandler(store story.Store, hermesBase string) *SessionHandler {
    return &SessionHandler{store: store, hermesBase: hermesBase}
}

// POST /api/v1/sessions
func (h *SessionHandler) CreateSession(c *gin.Context) {
    sess := h.store.Create()
    c.JSON(http.StatusCreated, gin.H{
        "session_id":   sess.ID,
        "current_node": sess.CurrentNode,
        "total_nodes":  sess.TotalNodes,
        "created_at":   sess.CreatedAt,
    })
}

type sendMessageRequest struct {
    Text string `json:"text" binding:"required"`
}

type hermesRequest struct {
    SessionID string               `json:"session_id"`
    Messages  []story.Message      `json:"messages"`
    Text      string               `json:"text"`
}

type hermesResponse struct {
    Text     string          `json:"text"`
    Messages []story.Message `json:"messages"`
}

// POST /api/v1/sessions/:id/messages
func (h *SessionHandler) SendMessage(c *gin.Context) {
    sessionID := c.Param("id")
    sess, ok := h.store.Get(sessionID)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
        return
    }

    var req sendMessageRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Append user message to session
    userMsg := story.Message{Role: "user", Content: req.Text}
    if err := h.store.AppendMessage(sessionID, userMsg); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    // Forward to Hermes agent
    hermesReq := hermesRequest{
        SessionID: sessionID,
        Messages:  sess.Messages,
        Text:      req.Text,
    }
    body, _ := json.Marshal(hermesReq)

    resp, err := http.Post(
        fmt.Sprintf("%s/agent/message", h.hermesBase),
        "application/json",
        bytes.NewReader(body),
    )
    if err != nil {
        c.JSON(http.StatusBadGateway, gin.H{"error": "hermes unavailable: " + err.Error()})
        return
    }
    defer resp.Body.Close()

    respBody, _ := io.ReadAll(resp.Body)
    var hermesResp hermesResponse
    if err := json.Unmarshal(respBody, &hermesResp); err != nil {
        c.JSON(http.StatusBadGateway, gin.H{"error": "invalid hermes response"})
        return
    }

    // Append assistant response
    assistantMsg := story.Message{Role: "assistant", Content: hermesResp.Text}
    h.store.AppendMessage(sessionID, assistantMsg)

    c.JSON(http.StatusOK, gin.H{
        "session_id": sessionID,
        "text":       hermesResp.Text,
    })
}
```

### 3.4 Register Routes in main.go

**`apps/api/cmd/server/main.go`:**

```go
package main

import (
    "log"
    "os"

    "github.com/gin-gonic/gin"
    "github.com/shadow/api/internal/handler"
    "github.com/shadow/api/internal/story"
)

func main() {
    hermesBase := os.Getenv("HERMES_BASE")
    if hermesBase == "" {
        hermesBase = "http://localhost:5001"
    }

    store := story.NewInMemoryStore()
    sessionHandler := handler.NewSessionHandler(store, hermesBase)

    r := gin.Default()
    v1 := r.Group("/api/v1")
    {
        v1.POST("/sessions", sessionHandler.CreateSession)
        v1.POST("/sessions/:id/messages", sessionHandler.SendMessage)
    }

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    log.Printf("Shadow API listening on :%s", port)
    r.Run(":" + port)
}
```

### 3.5 Verify Tests Pass

```bash
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/handler/... -v
go test ./internal/story/... -v
```

### Commit

```bash
git add apps/api/
git commit -m "feat(api): add story session handler with Hermes forwarding"
```

---

## Task 4: Video Generation Queue (Redis + Worker)

**Files:** `apps/api/internal/worker/video_worker.go`, `apps/api/internal/video/generator.go`

### Steps

- [ ] Write failing tests for worker and generator
- [ ] Implement VideoGeneratorInterface and MockAdapter
- [ ] Implement Redis queue push (internal endpoint)
- [ ] Implement Go worker
- [ ] Verify tests pass
- [ ] Commit

### 4.1 Failing Tests First

**`apps/api/internal/video/generator_test.go`:**

```go
package video_test

import (
    "context"
    "testing"

    "github.com/shadow/api/internal/video"
)

func TestMockAdapterGenerate(t *testing.T) {
    adapter := video.NewMockAdapter()
    result, err := adapter.Generate(context.Background(), video.Job{
        JobID:            "job-001",
        NodeID:           "node-3",
        SceneDescription: "A lone figure walks through fog",
        SessionID:        "sess-abc",
    })
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result.VideoURL == "" {
        t.Fatal("expected non-empty VideoURL")
    }
    if result.JobID != "job-001" {
        t.Fatalf("expected job-001, got %s", result.JobID)
    }
}
```

**`apps/api/internal/worker/video_worker_test.go`:**

```go
package worker_test

import (
    "context"
    "encoding/json"
    "testing"
    "time"

    "github.com/redis/go-redis/v9"
    "github.com/shadow/api/internal/video"
    "github.com/shadow/api/internal/worker"
)

func TestWorkerProcessesJob(t *testing.T) {
    rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
    ctx := context.Background()

    // Clean up
    rdb.Del(ctx, "video:queue")

    adapter := video.NewMockAdapter()
    w := worker.NewVideoWorker(rdb, adapter)

    job := video.Job{
        JobID:            "job-test-1",
        NodeID:           "node-1",
        SceneDescription: "A shadow puppet show begins",
        SessionID:        "sess-test",
    }
    jobBytes, _ := json.Marshal(job)
    rdb.LPush(ctx, "video:queue", jobBytes)

    ctx2, cancel := context.WithTimeout(ctx, 3*time.Second)
    defer cancel()
    w.ProcessOne(ctx2)

    // Check result stored in Redis
    resultKey := "video:result:" + job.JobID
    val, err := rdb.Get(ctx, resultKey).Result()
    if err != nil {
        t.Fatalf("result not stored: %v", err)
    }
    var result video.Result
    json.Unmarshal([]byte(val), &result)
    if result.VideoURL == "" {
        t.Fatal("expected VideoURL in stored result")
    }
}
```

Run (expect failure):
```bash
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/video/... ./internal/worker/... -v
```

### 4.2 Implement video/generator.go

**`apps/api/internal/video/generator.go`:**

```go
package video

import (
    "context"
    "fmt"
    "time"
)

// Job represents a video generation request.
type Job struct {
    JobID            string `json:"job_id"`
    NodeID           string `json:"node_id"`
    SceneDescription string `json:"scene_description"`
    SessionID        string `json:"session_id"`
}

// Result holds the output of a completed video generation job.
type Result struct {
    JobID     string    `json:"job_id"`
    NodeID    string    `json:"node_id"`
    SessionID string    `json:"session_id"`
    VideoURL  string    `json:"video_url"`
    Duration  float64   `json:"duration_seconds"`
    CreatedAt time.Time `json:"created_at"`
}

// Generator is the interface all video adapters must implement.
type Generator interface {
    Generate(ctx context.Context, job Job) (*Result, error)
}

// MockAdapter simulates video generation for development and testing.
type MockAdapter struct{}

func NewMockAdapter() *MockAdapter {
    return &MockAdapter{}
}

func (m *MockAdapter) Generate(ctx context.Context, job Job) (*Result, error) {
    // Simulate processing time
    select {
    case <-ctx.Done():
        return nil, ctx.Err()
    case <-time.After(100 * time.Millisecond):
    }

    return &Result{
        JobID:     job.JobID,
        NodeID:    job.NodeID,
        SessionID: job.SessionID,
        VideoURL:  fmt.Sprintf("https://mock-cdn.shadow.local/videos/%s.mp4", job.JobID),
        Duration:  15.0,
        CreatedAt: time.Now(),
    }, nil
}
```

### 4.3 Implement worker/video_worker.go

**`apps/api/internal/worker/video_worker.go`:**

```go
package worker

import (
    "context"
    "encoding/json"
    "log"
    "time"

    "github.com/redis/go-redis/v9"
    "github.com/shadow/api/internal/video"
)

const (
    QueueKey     = "video:queue"
    ResultPrefix = "video:result:"
    ResultTTL    = 24 * time.Hour
)

type VideoWorker struct {
    rdb       *redis.Client
    generator video.Generator
}

func NewVideoWorker(rdb *redis.Client, generator video.Generator) *VideoWorker {
    return &VideoWorker{rdb: rdb, generator: generator}
}

// ProcessOne blocks until one job is available, processes it, and stores the result.
func (w *VideoWorker) ProcessOne(ctx context.Context) {
    result, err := w.rdb.BRPop(ctx, 5*time.Second, QueueKey).Result()
    if err != nil {
        if err != redis.Nil {
            log.Printf("[worker] BRPop error: %v", err)
        }
        return
    }

    var job video.Job
    if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
        log.Printf("[worker] failed to unmarshal job: %v", err)
        return
    }

    log.Printf("[worker] processing job %s for node %s", job.JobID, job.NodeID)

    genResult, err := w.generator.Generate(ctx, job)
    if err != nil {
        log.Printf("[worker] generation failed for job %s: %v", job.JobID, err)
        return
    }

    resultBytes, _ := json.Marshal(genResult)
    resultKey := ResultPrefix + job.JobID
    if err := w.rdb.Set(ctx, resultKey, resultBytes, ResultTTL).Err(); err != nil {
        log.Printf("[worker] failed to store result for job %s: %v", job.JobID, err)
        return
    }

    log.Printf("[worker] job %s complete, video: %s", job.JobID, genResult.VideoURL)
}

// Run starts the worker loop until ctx is cancelled.
func (w *VideoWorker) Run(ctx context.Context) {
    log.Println("[worker] video worker started")
    for {
        select {
        case <-ctx.Done():
            log.Println("[worker] shutting down")
            return
        default:
            w.ProcessOne(ctx)
        }
    }
}
```

### 4.4 Internal Queue Endpoint (called by Hermes tool)

Add to `apps/api/internal/handler/internal.go`:

```go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "github.com/redis/go-redis/v9"
    "github.com/shadow/api/internal/video"
    "github.com/shadow/api/internal/worker"
)

type InternalHandler struct {
    rdb *redis.Client
}

func NewInternalHandler(rdb *redis.Client) *InternalHandler {
    return &InternalHandler{rdb: rdb}
}

type queueVideoRequest struct {
    NodeID           string `json:"node_id" binding:"required"`
    SceneDescription string `json:"scene_description" binding:"required"`
    SessionID        string `json:"session_id" binding:"required"`
}

// POST /internal/video/queue
func (h *InternalHandler) QueueVideo(c *gin.Context) {
    var req queueVideoRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    job := video.Job{
        JobID:            uuid.NewString(),
        NodeID:           req.NodeID,
        SceneDescription: req.SceneDescription,
        SessionID:        req.SessionID,
    }
    jobBytes, _ := json.Marshal(job)

    if err := h.rdb.LPush(c.Request.Context(), worker.QueueKey, jobBytes).Err(); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue job"})
        return
    }

    c.JSON(http.StatusAccepted, gin.H{"job_id": job.JobID})
}

// GET /internal/sessions/:id/progress
func (h *InternalHandler) GetProgress(c *gin.Context) {
    // Placeholder — returns mock progress for MVP
    c.JSON(http.StatusOK, gin.H{
        "current_node": 1,
        "total_nodes":  10,
    })
}
```

Register in main.go:
```go
rdb := redis.NewClient(&redis.Options{
    Addr: os.Getenv("REDIS_ADDR"),
})
if rdb.Options().Addr == "" {
    rdb = redis.NewClient(&redis.Options{Addr: "localhost:6379"})
}

internalHandler := handler.NewInternalHandler(rdb)
internal := r.Group("/internal")
{
    internal.POST("/video/queue", internalHandler.QueueVideo)
    internal.GET("/sessions/:id/progress", internalHandler.GetProgress)
}

// Start worker in background
adapter := video.NewMockAdapter()
w := worker.NewVideoWorker(rdb, adapter)
go w.Run(context.Background())
```

### 4.5 Verify Tests Pass

```bash
# Requires Redis running locally
redis-server --daemonize yes
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/video/... ./internal/worker/... -v
```

### Commit

```bash
git add apps/api/internal/video/ apps/api/internal/worker/ apps/api/internal/handler/internal.go
git commit -m "feat(worker): add Redis video queue, MockAdapter, and Go worker"
```

---

## Task 5: WebSocket Push for Video-Ready (N-2 Strategy)

**Files:** `apps/api/internal/handler/ws.go`

### Steps

- [ ] Write failing test for WebSocket hub
- [ ] Implement WebSocket hub and handler
- [ ] Integrate hub with worker (publish on job complete)
- [ ] Register WebSocket route
- [ ] Verify tests pass
- [ ] Commit

### N-2 Strategy Explained

When the user reaches story node N, the system proactively pushes the completed video for node N-2 to the client. This means:
- Node 1 starts → no push yet
- Node 2 starts → no push yet
- Node 3 starts → push video for node 1 (if ready)
- Node N starts → push video for node N-2

This hides generation latency: by the time the user needs a video, it was queued 2 nodes ago.

### 5.1 Failing Test First

**`apps/api/internal/handler/ws_test.go`:**

```go
package handler_test

import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "time"

    "github.com/gorilla/websocket"
    "github.com/shadow/api/internal/handler"
)

func TestWebSocketConnect(t *testing.T) {
    hub := handler.NewHub()
    go hub.Run()

    h := handler.NewWSHandler(hub)
    srv := httptest.NewServer(http.HandlerFunc(h.ServeWS))
    defer srv.Close()

    wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?session_id=sess-test"
    conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
    if err != nil {
        t.Fatalf("failed to connect: %v", err)
    }
    defer conn.Close()

    // Broadcast a message and verify client receives it
    time.Sleep(50 * time.Millisecond)
    hub.Broadcast("sess-test", handler.VideoReadyMessage{
        Type:      "video_ready",
        JobID:     "job-001",
        NodeID:    "node-1",
        SessionID: "sess-test",
        VideoURL:  "https://mock-cdn.shadow.local/videos/job-001.mp4",
    })

    conn.SetReadDeadline(time.Now().Add(2 * time.Second))
    _, msg, err := conn.ReadMessage()
    if err != nil {
        t.Fatalf("failed to read message: %v", err)
    }
    if !strings.Contains(string(msg), "job-001") {
        t.Fatalf("expected job-001 in message, got: %s", msg)
    }
}
```

Run (expect failure):
```bash
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/handler/... -v -run TestWebSocket
```

### 5.2 Implement handler/ws.go

**`apps/api/internal/handler/ws.go`:**

```go
package handler

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"

    "github.com/gin-gonic/gin"
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

// VideoReadyMessage is sent to clients when a video job completes.
type VideoReadyMessage struct {
    Type      string `json:"type"`
    JobID     string `json:"job_id"`
    NodeID    string `json:"node_id"`
    SessionID string `json:"session_id"`
    VideoURL  string `json:"video_url"`
}

type client struct {
    conn      *websocket.Conn
    sessionID string
    send      chan []byte
}

// Hub manages all active WebSocket connections.
type Hub struct {
    mu      sync.RWMutex
    clients map[string][]*client
    reg     chan *client
    unreg   chan *client
}

func NewHub() *Hub {
    return &Hub{
        clients: make(map[string][]*client),
        reg:     make(chan *client, 16),
        unreg:   make(chan *client, 16),
    }
}

func (h *Hub) Run() {
    for {
        select {
        case c := <-h.reg:
            h.mu.Lock()
            h.clients[c.sessionID] = append(h.clients[c.sessionID], c)
            h.mu.Unlock()
            log.Printf("[ws] client registered for session %s", c.sessionID)

        case c := <-h.unreg:
            h.mu.Lock()
            list := h.clients[c.sessionID]
            for i, cl := range list {
                if cl == c {
                    h.clients[c.sessionID] = append(list[:i], list[i+1:]...)
                    close(c.send)
                    break
                }
            }
            h.mu.Unlock()
            log.Printf("[ws] client unregistered for session %s", c.sessionID)
        }
    }
}

// Broadcast sends a VideoReadyMessage to all clients in a session.
func (h *Hub) Broadcast(sessionID string, msg VideoReadyMessage) {
    data, _ := json.Marshal(msg)
    h.mu.RLock()
    clients := h.clients[sessionID]
    h.mu.RUnlock()
    for _, c := range clients {
        select {
        case c.send <- data:
        default:
            log.Printf("[ws] send buffer full for session %s, dropping message", sessionID)
        }
    }
}

type WSHandler struct {
    hub *Hub
}

func NewWSHandler(hub *Hub) *WSHandler {
    return &WSHandler{hub: hub}
}

// ServeWS upgrades the HTTP connection to WebSocket.
// Query param: session_id
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
    sessionID := r.URL.Query().Get("session_id")
    if sessionID == "" {
        http.Error(w, "session_id required", http.StatusBadRequest)
        return
    }

    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("[ws] upgrade error: %v", err)
        return
    }

    c := &client{
        conn:      conn,
        sessionID: sessionID,
        send:      make(chan []byte, 32),
    }
    h.hub.reg <- c

    // Write pump
    go func() {
        defer func() {
            h.hub.unreg <- c
            conn.Close()
        }()
        for msg := range c.send {
            if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
                return
            }
        }
    }()

    // Read pump (keeps connection alive, handles pings)
    go func() {
        defer func() { h.hub.unreg <- c }()
        for {
            if _, _, err := conn.ReadMessage(); err != nil {
                return
            }
        }
    }()
}

// GinServeWS wraps ServeWS for use as a Gin handler.
func (h *WSHandler) GinServeWS(c *gin.Context) {
    h.ServeWS(c.Writer, c.Request)
}
```

### 5.3 Integrate Hub with Worker

Update `apps/api/internal/worker/video_worker.go` to accept an optional broadcast callback:

```go
type VideoWorker struct {
    rdb       *redis.Client
    generator video.Generator
    onComplete func(result *video.Result)  // called after successful generation
}

func NewVideoWorker(rdb *redis.Client, generator video.Generator, onComplete func(*video.Result)) *VideoWorker {
    return &VideoWorker{rdb: rdb, generator: generator, onComplete: onComplete}
}
```

In `ProcessOne`, after storing the result:
```go
if w.onComplete != nil {
    w.onComplete(genResult)
}
```

In `main.go`, wire the hub:
```go
hub := handler.NewHub()
go hub.Run()

wsHandler := handler.NewWSHandler(hub)
r.GET("/ws", wsHandler.GinServeWS)

// N-2 strategy: track node counts per session in Redis
onComplete := func(result *video.Result) {
    hub.Broadcast(result.SessionID, handler.VideoReadyMessage{
        Type:      "video_ready",
        JobID:     result.JobID,
        NodeID:    result.NodeID,
        SessionID: result.SessionID,
        VideoURL:  result.VideoURL,
    })
}

w := worker.NewVideoWorker(rdb, adapter, onComplete)
go w.Run(context.Background())
```

### 5.4 Verify Tests Pass

```bash
cd /Users/proerror/Documents/shadow/apps/api
go test ./internal/handler/... -v -run TestWebSocket
go build ./...
```

### Commit

```bash
git add apps/api/internal/handler/ws.go apps/api/internal/worker/video_worker.go apps/api/cmd/server/main.go
git commit -m "feat(ws): add WebSocket hub with N-2 video-ready push strategy"
```

---

## Task 6: Integration Test with curl

**Goal:** Verify the full pipeline end-to-end: create session → send message → Hermes calls trigger_video_node → Redis job queued → worker processes → WebSocket push.

### Steps

- [ ] Start Redis
- [ ] Start Hermes agent
- [ ] Start Go API
- [ ] Run curl tests for each endpoint
- [ ] Verify WebSocket receives video-ready event

### 6.1 Start Services

Terminal 1 — Redis:
```bash
redis-server
```

Terminal 2 — Hermes Agent:
```bash
cd /Users/proerror/Documents/shadow/apps/hermes
export ANTHROPIC_API_KEY=your_key_here
export GO_API_BASE=http://localhost:8080
export HERMES_PORT=5001
python agent.py
```

Terminal 3 — Go API:
```bash
cd /Users/proerror/Documents/shadow/apps/api
export REDIS_ADDR=localhost:6379
export HERMES_BASE=http://localhost:5001
export PORT=8080
go run ./cmd/server/main.go
```

### 6.2 Test: Create Session

```bash
curl -s -X POST http://localhost:8080/api/v1/sessions   -H "Content-Type: application/json"   -d '{}' | jq .
```

Expected response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "current_node": 0,
  "total_nodes": 10,
  "created_at": "2026-04-15T10:00:00Z"
}
```

Save the session ID:
```bash
SESSION_ID=$(curl -s -X POST http://localhost:8080/api/v1/sessions   -H "Content-Type: application/json"   -d '{}' | jq -r '.session_id')
echo "Session: $SESSION_ID"
```

### 6.3 Test: Send Message (triggers Hermes + video queue)

```bash
curl -s -X POST "http://localhost:8080/api/v1/sessions/$SESSION_ID/messages"   -H "Content-Type: application/json"   -d '{"text": "Begin the story. I want to see the shadow world."}' | jq .
```

Expected response:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "text": "The lantern flickers as the first shadow puppet takes the stage..."
}
```

In the Go API logs you should see:
```
[worker] processing job abc-123 for node node-1
[worker] job abc-123 complete, video: https://mock-cdn.shadow.local/videos/abc-123.mp4
```

### 6.4 Test: Internal Queue Endpoint (direct test)

```bash
curl -s -X POST http://localhost:8080/internal/video/queue   -H "Content-Type: application/json"   -d '{
    "node_id": "node-5",
    "scene_description": "A dragon made of shadows rises from the mist",
    "session_id": "'"$SESSION_ID"'"
  }' | jq .
```

Expected:
```json
{
  "job_id": "7f3a9b2c-1234-5678-abcd-ef0123456789"
}
```

### 6.5 Test: Check Redis for Job Result

```bash
JOB_ID="<job_id from above>"
redis-cli GET "video:result:$JOB_ID" | jq .
```

Expected:
```json
{
  "job_id": "7f3a9b2c-1234-5678-abcd-ef0123456789",
  "node_id": "node-5",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "video_url": "https://mock-cdn.shadow.local/videos/7f3a9b2c-1234-5678-abcd-ef0123456789.mp4",
  "duration_seconds": 15,
  "created_at": "2026-04-15T10:01:00Z"
}
```

### 6.6 Test: WebSocket Video-Ready Push

Terminal 4 — WebSocket listener (using websocat or wscat):

```bash
# Install wscat if needed: npm install -g wscat
wscat -c "ws://localhost:8080/ws?session_id=$SESSION_ID"
```

Then in another terminal, queue a video job:
```bash
curl -s -X POST http://localhost:8080/internal/video/queue   -H "Content-Type: application/json"   -d '{
    "node_id": "node-3",
    "scene_description": "The shadow emperor appears on his throne",
    "session_id": "'"$SESSION_ID"'"
  }'
```

Within ~100ms you should see in the wscat terminal:
```json
{
  "type": "video_ready",
  "job_id": "...",
  "node_id": "node-3",
  "session_id": "...",
  "video_url": "https://mock-cdn.shadow.local/videos/....mp4"
}
```

### 6.7 Test: Hermes Health Check

```bash
curl -s http://localhost:5001/health | jq .
```

Expected:
```json
{
  "status": "ok",
  "model": "claude-opus-4-6"
}
```

### 6.8 Full Pipeline Smoke Test Script

**`apps/api/scripts/smoke_test.sh`:**

```bash
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
SESSION=$(curl -sf -X POST "$BASE/api/v1/sessions"   -H "Content-Type: application/json"   -d '{}')
SESSION_ID=$(echo "$SESSION" | jq -r '.session_id')
echo "  session_id: $SESSION_ID"

# 3. Queue a video job directly
echo "[3] Queuing video job..."
JOB=$(curl -sf -X POST "$BASE/internal/video/queue"   -H "Content-Type: application/json"   -d "{"node_id":"node-1","scene_description":"Opening scene","session_id":"$SESSION_ID"}")
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
REPLY=$(curl -sf -X POST "$BASE/api/v1/sessions/$SESSION_ID/messages"   -H "Content-Type: application/json"   -d '{"text":"Tell me the story of the shadow realm"}')
echo "  reply: $(echo "$REPLY" | jq -r '.text' | head -c 100)..."

echo ""
echo "=== All checks passed ==="
```

Run:
```bash
chmod +x /Users/proerror/Documents/shadow/apps/api/scripts/smoke_test.sh
/Users/proerror/Documents/shadow/apps/api/scripts/smoke_test.sh
```

### Commit

```bash
git add apps/api/scripts/smoke_test.sh
git commit -m "test(integration): add smoke test script for full MVP pipeline"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Dependencies | `go.mod`, `requirements.txt` |
| 2 | Hermes Agent | `apps/hermes/agent.py`, `tools.py` |
| 3 | Session Handler | `handler/session.go`, `story/session.go` |
| 4 | Redis Queue + Worker | `worker/video_worker.go`, `video/generator.go` |
| 5 | WebSocket Push | `handler/ws.go` |
| 6 | Integration Tests | `scripts/smoke_test.sh` |

**Final architecture verification:**

```
Client
  │
  ├─ POST /api/v1/sessions          → Create session
  ├─ POST /api/v1/sessions/:id/messages → Go → Hermes (Claude claude-opus-4-6)
  │                                         └─ tool: trigger_video_node
  │                                              └─ POST /internal/video/queue
  │                                                   └─ Redis LPUSH video:queue
  │                                                        └─ Go Worker (BRPop)
  │                                                             └─ MockAdapter.Generate()
  │                                                                  └─ Redis SET video:result:*
  │                                                                       └─ Hub.Broadcast()
  └─ WS /ws?session_id=*            ← video_ready push (N-2 strategy)
```
