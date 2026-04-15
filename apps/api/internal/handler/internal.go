package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/shadow/api/internal/video"
	"github.com/shadow/api/internal/worker"
)

type InternalHandler struct {
	rdb *redis.Client
}

func NewInternalHandler(rdb *redis.Client) *InternalHandler {
	return &InternalHandler{rdb: rdb}
}

type queueVideoRequest struct {
	NodeID           string `json:"node_id" binding:"required"`
	SceneDescription string `json:"scene_description" binding:"required"`
	SessionID        string `json:"session_id" binding:"required"`
}

// POST /internal/video/queue
func (h *InternalHandler) QueueVideo(c *gin.Context) {
	var req queueVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	job := video.Job{
		JobID:            uuid.NewString(),
		NodeID:           req.NodeID,
		SceneDescription: req.SceneDescription,
		SessionID:        req.SessionID,
	}
	jobBytes, _ := json.Marshal(job)

	if err := h.rdb.LPush(c.Request.Context(), worker.QueueKey, jobBytes).Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to queue job"})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{"job_id": job.JobID})
}

// GET /internal/sessions/:id/progress
func (h *InternalHandler) GetProgress(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"current_node": 1,
		"total_nodes":  10,
	})
}
