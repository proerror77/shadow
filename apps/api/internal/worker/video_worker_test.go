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
	w := worker.NewVideoWorker(rdb, adapter, nil)

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
