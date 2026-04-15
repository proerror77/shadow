package story

import (
	"fmt"
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
