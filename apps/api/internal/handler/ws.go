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
