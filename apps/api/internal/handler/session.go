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
	SessionID string          `json:"session_id"`
	Messages  []story.Message `json:"messages"`
	Text      string          `json:"text"`
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
