# 影境 v1.0 — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Stack:** React Native (Expo) + Go + Anthropic Managed Agents + Seedance 2.0 (abstracted)

---

## 1. Product Overview

影境 is an AI-driven interactive drama community that combines multi-turn LLM dialogue with AI video generation. Users converse with an AI agent to drive a story forward; the system automatically generates 15-second video clips at narrative nodes, ultimately assembling a ~3-minute personalized short drama.

**Target users:**
- Domestic: OC (Original Character) community and pan-ACG audience
- International: adult audience seeking high-stimulation interactive content

**Core value:** Zero-barrier cinematic storytelling; viral UGC video sharing for low-cost user acquisition.

---

## 2. Architecture

### Monorepo Structure

```
yingjing/
├── apps/
│   ├── mobile/          # React Native (Expo)
│   └── api/             # Go + Gin
├── packages/
│   ├── shared-types/    # OpenAPI spec → generated TS + Go types
│   └── ai-core/         # Video generation interface definitions
├── infra/               # Docker Compose, K8s configs
├── tools/               # codegen scripts (openapi-generator)
├── Makefile             # make dev / build / test
└── pnpm-workspace.yaml
```

**Type sharing:** OpenAPI spec as contract; `tools/codegen` generates Go structs and TypeScript interfaces. Frontend and backend types stay in sync automatically.

---

## 3. Core Loop (MVP)

### 3.1 Dialogue → Node → Video Pipeline

```
User input
    ↓
[mobile] POST /api/v1/sessions/:id/messages
    ↓
[api/Go] → Anthropic Managed Agent Session
              Agent system prompt: story rules, node detection logic
              Agent tools:
                - trigger_video_node (Custom Tool)
                - get_story_progress (Custom Tool)
    ↓
Agent reply → SSE stream to frontend
    │
    ├── No node triggered → return dialogue content
    │
    └── Node triggered → Agent calls trigger_video_node
                          ↓
                    [api/Go] receives agent.custom_tool_use event
                          ↓
                    Extract story summary → generate video Prompt
                          ↓
                    Push to Redis queue (async Worker)
                          ↓
                    Worker calls VideoGeneratorInterface
                    (SeedanceAdapter / MockAdapter)
                          ↓
                    N-2 strategy: video ready → WebSocket push to frontend
```

### 3.2 Agent Design

- **One agent config** created at setup, stored as `AGENT_ID` env var
- **One Managed Agent Session per user story** — session maps to a story run
- **System prompt** encodes: story progress rules, 12-node limit, forced convergence at node 10, N-2 buffer strategy
- **Custom tools** on the agent:
  - `trigger_video_node`: called when LLM judges a narrative node has been reached
  - `get_story_progress`: returns current node count and progress percentage

### 3.3 Video Generation Abstraction

```go
// packages/ai-core (interface definition)
type VideoGeneratorInterface interface {
    Generate(ctx context.Context, req VideoRequest) (VideoJob, error)
    GetStatus(ctx context.Context, jobID string) (VideoStatus, error)
}

// Implementations
type SeedanceAdapter struct{}   // Seedance 2.0 API
type MockAdapter struct{}       // For development/testing
```

Swapping video providers requires only a new adapter — no business logic changes.

### 3.4 N-2 Buffer Strategy

- User is on story segment N
- App pushes video for segment N-2
- Provides ~6-10 minutes of render window
- Ensures seamless "invisible generation" UX

---

## 4. Story Length & Pacing

| Parameter | Value |
|---|---|
| Total nodes | 12 |
| Video per node | 15 seconds |
| Total video | ~3 minutes |
| Forced convergence | Node 10 (AI guides toward climax/ending) |
| Progress bar | Displayed in UI: "Story progress: X%" |

---

## 5. Post-Processing (Final Assembly)

After node 12:
1. Concatenate 12 × 15s clips
2. Add transitions + AI-matched BGM (mood-based)
3. Brand watermark: product logo + QR code + "同款口令码"
4. Export as shareable video

---

## 6. Dual-Track Strategy

| Market | Focus | Monetization |
|---|---|---|
| Domestic | OC visual fidelity, style preservation (e.g. Tang dynasty, Ukiyo-e) | "Detail repaint rights", "storyboard edit rights", world expansion packs |
| International | High-stimulation, faster node intervals, TTS + ambient audio | Subscription tiers |

---

## 7. Monetization Tiers

| Tier | Price | Quota | Features |
|---|---|---|---|
| Free | ¥0 | ~1 min/month | Basic experience, watermarked |
| Basic | ¥69/month | 6 min/month | HD, preset scene/costume packs |
| Standard | ¥199/month | 15 min/month | OC style binding, storyboard tweaks, priority queue |
| Premium | ¥499/month | 60 min/month | Multi-branch parallel, watermark-free, commercial license |

---

## 8. Tech Stack Summary

| Layer | Technology |
|---|---|
| Mobile | React Native (Expo) |
| API | Go + Gin |
| Agent | Anthropic Managed Agents (claude-opus-4-6) |
| Video generation | VideoGeneratorInterface → SeedanceAdapter (Seedance 2.0) |
| Queue | Redis + Go worker |
| Real-time push | WebSocket (SSE for agent stream, WS for video ready) |
| Type sharing | OpenAPI spec + codegen |
| Monorepo | pnpm workspaces + Go modules + Makefile |

---

## 9. MVP Scope

MVP focuses exclusively on the core loop:

1. Multi-turn dialogue with Managed Agent
2. Node detection via `trigger_video_node` custom tool
3. Async video generation queue (MockAdapter for dev)
4. N-2 video push to mobile client
5. Basic story progress display

**Out of scope for MVP:** Community/social features, OC asset upload, final video assembly, monetization.
