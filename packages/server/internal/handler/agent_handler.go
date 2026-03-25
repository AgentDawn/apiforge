package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
)

type AgentHandler struct{}

type agentRequest struct {
	Message string       `json:"message"`
	Context agentContext `json:"context"`
}

type agentContext struct {
	SpecTitle   string          `json:"specTitle"`
	Endpoints   json.RawMessage `json:"endpoints"`
	Environment json.RawMessage `json:"environment"`
	LastRequest json.RawMessage `json:"lastRequest"`
}

// workerRequest is sent to the claude-worker service
type workerRequest struct {
	Message      string `json:"message"`
	SystemPrompt string `json:"systemPrompt"`
}

func getClaudeWorkerURL() string {
	if url := os.Getenv("CLAUDE_WORKER_URL"); url != "" {
		return url
	}
	return "http://claude-worker:8091"
}

func (h *AgentHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		h.Chat(w, r)
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

func (h *AgentHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var req agentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}

	// Extract BYOD auth from request headers (forwarded from frontend)
	apiKey := r.Header.Get("X-Claude-Api-Key")
	credentials := r.Header.Get("X-Claude-Credentials")
	localAuth := r.Header.Get("X-Claude-Local-Auth")
	allowLocal := os.Getenv("ALLOW_LOCAL_AUTH") == "true"

	if apiKey == "" && credentials == "" && localAuth != "true" && !allowLocal {
		writeError(w, http.StatusUnauthorized, "Claude authentication required. Provide an API key or Claude account credentials in Settings.")
		return
	}

	// Build system prompt with API context
	systemPrompt := buildSystemPrompt(req.Context)

	// Build request to claude-worker
	workerReq := workerRequest{
		Message:      req.Message,
		SystemPrompt: systemPrompt,
	}
	workerBody, _ := json.Marshal(workerReq)

	workerURL := getClaudeWorkerURL() + "/chat"
	httpReq, err := http.NewRequestWithContext(r.Context(), "POST", workerURL, strings.NewReader(string(workerBody)))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create worker request")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	// Forward BYOD auth to worker
	if apiKey != "" {
		httpReq.Header.Set("X-Api-Key", apiKey)
	} else if credentials != "" {
		httpReq.Header.Set("X-Claude-Credentials", credentials)
	} else if localAuth == "true" || allowLocal {
		httpReq.Header.Set("X-Claude-Local-Auth", "true")
	}

	// Call claude-worker
	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("claude-worker error: %v", err)
		writeError(w, http.StatusServiceUnavailable, "Claude worker unavailable. Is the claude-worker container running?")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("claude-worker returned %d: %s", resp.StatusCode, string(body))
		writeError(w, resp.StatusCode, "Claude worker error: "+string(body))
		return
	}

	// Stream SSE from worker to client
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		return
	}

	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			flusher.Flush()
		}
		if err != nil {
			if err != io.EOF {
				log.Printf("stream read error: %v", err)
			}
			break
		}
	}
}

func buildSystemPrompt(ctx agentContext) string {
	var sb strings.Builder
	sb.WriteString("You are APIForge Agent, an AI assistant for API development and testing.\n")
	sb.WriteString("You help users debug APIs, analyze responses, suggest parameters, and explain endpoints.\n")
	sb.WriteString("Be concise and actionable. Use markdown for formatting.\n\n")

	if ctx.SpecTitle != "" {
		sb.WriteString("## Current API Spec: " + ctx.SpecTitle + "\n")
	}
	if len(ctx.Endpoints) > 0 && string(ctx.Endpoints) != "null" {
		sb.WriteString("## Available Endpoints:\n```json\n" + string(ctx.Endpoints) + "\n```\n\n")
	}
	if len(ctx.Environment) > 0 && string(ctx.Environment) != "null" {
		sb.WriteString("## Current Environment Variables:\n```json\n" + string(ctx.Environment) + "\n```\n\n")
	}
	if len(ctx.LastRequest) > 0 && string(ctx.LastRequest) != "null" {
		sb.WriteString("## Last Request/Response:\n```json\n" + string(ctx.LastRequest) + "\n```\n\n")
	}

	return sb.String()
}
