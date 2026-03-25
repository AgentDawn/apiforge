package handler

import (
	"net/http"
	"strings"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/middleware"
)

type EnvironmentHandler struct {
	DB *db.Client
}

func (h *EnvironmentHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	path := strings.TrimPrefix(r.URL.Path, "/api/environments")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.list(w, r, userID)
	case path == "" && r.Method == http.MethodPost:
		h.create(w, r, userID)
	case path != "" && r.Method == http.MethodGet:
		h.get(w, r, userID, path)
	case path != "" && r.Method == http.MethodPut:
		h.update(w, r, userID, path)
	case path != "" && r.Method == http.MethodDelete:
		h.delete(w, r, userID, path)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *EnvironmentHandler) list(w http.ResponseWriter, r *http.Request, userID string) {
	rows, err := h.DB.QueryRows("SELECT id, user_id, name, variables, created_at, updated_at FROM environments WHERE user_id = ? ORDER BY name", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *EnvironmentHandler) create(w http.ResponseWriter, r *http.Request, userID string) {
	var body struct {
		Name      string `json:"name"`
		Variables string `json:"variables"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if body.Variables == "" {
		body.Variables = "{}"
	}

	id := auth.GenerateID()
	err := h.DB.ExecuteOne(
		"INSERT INTO environments (id, user_id, name, variables) VALUES (?, ?, ?, ?)",
		id, userID, body.Name, body.Variables,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create environment")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "name": body.Name})
}

func (h *EnvironmentHandler) get(w http.ResponseWriter, r *http.Request, userID, id string) {
	row, err := h.DB.QueryRow("SELECT id, user_id, name, variables, created_at, updated_at FROM environments WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if row == nil {
		writeError(w, http.StatusNotFound, "environment not found")
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (h *EnvironmentHandler) update(w http.ResponseWriter, r *http.Request, userID, id string) {
	var body struct {
		Name      string `json:"name"`
		Variables string `json:"variables"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.DB.ExecuteOne(
		"UPDATE environments SET name = ?, variables = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
		body.Name, body.Variables, id, userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update environment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "updated"})
}

func (h *EnvironmentHandler) delete(w http.ResponseWriter, r *http.Request, userID, id string) {
	err := h.DB.ExecuteOne("DELETE FROM environments WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete environment")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "deleted"})
}
