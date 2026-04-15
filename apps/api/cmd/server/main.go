package main

import (
	"context"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/shadow/api/internal/handler"
	"github.com/shadow/api/internal/story"
	"github.com/shadow/api/internal/video"
	"github.com/shadow/api/internal/worker"
)

func main() {
	hermesBase := os.Getenv("HERMES_BASE")
	if hermesBase == "" {
		hermesBase = "http://localhost:5001"
	}

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})

	store := story.NewInMemoryStore()
	sessionHandler := handler.NewSessionHandler(store, hermesBase)
	internalHandler := handler.NewInternalHandler(rdb)

	hub := handler.NewHub()
	go hub.Run()
	wsHandler := handler.NewWSHandler(hub)

	r := gin.Default()

	v1 := r.Group("/api/v1")
	{
		v1.POST("/sessions", sessionHandler.CreateSession)
		v1.POST("/sessions/:id/messages", sessionHandler.SendMessage)
	}

	internal := r.Group("/internal")
	{
		internal.POST("/video/queue", internalHandler.QueueVideo)
		internal.GET("/sessions/:id/progress", internalHandler.GetProgress)
	}

	r.GET("/ws", wsHandler.GinServeWS)

	// N-2 strategy: broadcast video-ready to session clients when job completes
	onComplete := func(result *video.Result) {
		hub.Broadcast(result.SessionID, handler.VideoReadyMessage{
			Type:      "video_ready",
			JobID:     result.JobID,
			NodeID:    result.NodeID,
			SessionID: result.SessionID,
			VideoURL:  result.VideoURL,
		})
	}

	adapter := video.NewMockAdapter()
	w := worker.NewVideoWorker(rdb, adapter, onComplete)
	go w.Run(context.Background())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Shadow API listening on :%s", port)
	r.Run(":" + port)
}
