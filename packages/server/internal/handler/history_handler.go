package handler

import (
	"net/http"
	"strings"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/middleware"
)

type HistoryHandler struct {
	DB     *db.Client
	Events *EventBroker
}

func (h *HistoryHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	path := strings.TrimPrefix(r.URL.Path, "/api/history")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.list(w, r, userID)
	case path == "" && r.Method == http.MethodPost:
		h.create(w, r, userID)
	case path == "" && r.Method == http.MethodDelete:
		h.clear(w, r, userID)
	case path != "" && r.Method == http.MethodDelete:
		h.deleteOne(w, r, userID, path)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *HistoryHandler) list(w http.ResponseWriter, r *http.Request, userID string) {
	limit := r.URL.Query().Get("limit")
	if limit == "" {
		limit = "50"
	}
	rows, err := h.DB.QueryRows(
		"SELECT id, user_id, method, url, status, timing_ms, request_body, response_body, source, environment, auth_type, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
		userID, limit,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *HistoryHandler) create(w http.ResponseWriter, r *http.Request, userID string) {
	var body struct {
		ID           string `json:"id"`
		Method       string `json:"method"`
		URL          string `json:"url"`
		Status       int    `json:"status"`
		TimingMs     int    `json:"timing_ms"`
		RequestBody  string `json:"request_body"`
		ResponseBody string `json:"response_body"`
		Source       string `json:"source"`
		Environment  string `json:"environment"`
		AuthType     string `json:"auth_type"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Method == "" || body.URL == "" {
		writeError(w, http.StatusBadRequest, "method and url are required")
		return
	}

	id := body.ID
	if id == "" {
		id = auth.GenerateID()
	}
	source := body.Source
	if source == "" {
		source = "web"
	}

	err := h.DB.ExecuteOne(
		"INSERT INTO history (id, user_id, method, url, status, timing_ms, request_body, response_body, source, environment, auth_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, userID, body.Method, body.URL, body.Status, body.TimingMs, body.RequestBody, body.ResponseBody, source, body.Environment, body.AuthType,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save history")
		return
	}

	// SSE broadcast
	if h.Events != nil {
		h.Events.Publish(Event{Type: "history:created", Data: map[string]string{"id": id, "source": source}})
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"id": id, "source": source})
}

func (h *HistoryHandler) clear(w http.ResponseWriter, r *http.Request, userID string) {
	err := h.DB.ExecuteOne("DELETE FROM history WHERE user_id = ?", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear history")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cleared"})
}

func (h *HistoryHandler) deleteOne(w http.ResponseWriter, r *http.Request, userID, id string) {
	err := h.DB.ExecuteOne("DELETE FROM history WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete history entry")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "deleted"})
}
