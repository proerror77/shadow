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
	rdb        *redis.Client
	generator  video.Generator
	onComplete func(result *video.Result)
}

func NewVideoWorker(rdb *redis.Client, generator video.Generator, onComplete func(*video.Result)) *VideoWorker {
	return &VideoWorker{rdb: rdb, generator: generator, onComplete: onComplete}
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

	if w.onComplete != nil {
		w.onComplete(genResult)
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
