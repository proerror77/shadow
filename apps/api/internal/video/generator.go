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
