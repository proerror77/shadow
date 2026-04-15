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
