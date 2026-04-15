package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/shadow/api/internal/handler"
	"github.com/shadow/api/internal/story"
)

func main() {
	hermesBase := os.Getenv("HERMES_BASE")
	if hermesBase == "" {
		hermesBase = "http://localhost:5001"
	}

	store := story.NewInMemoryStore()
	sessionHandler := handler.NewSessionHandler(store, hermesBase)

	r := gin.Default()
	v1 := r.Group("/api/v1")
	{
		v1.POST("/sessions", sessionHandler.CreateSession)
		v1.POST("/sessions/:id/messages", sessionHandler.SendMessage)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Shadow API listening on :%s", port)
	r.Run(":" + port)
}
