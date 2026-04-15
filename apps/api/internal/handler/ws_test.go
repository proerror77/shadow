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
