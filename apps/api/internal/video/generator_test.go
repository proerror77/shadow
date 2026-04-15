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
