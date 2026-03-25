package handler

import (
	"net/http"
	"strings"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/middleware"
)

type CollectionHandler struct {
	DB *db.Client
}

func (h *CollectionHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)

	// Extract ID from path: /api/collections/{id} or /api/collections/{id}/share
	path := strings.TrimPrefix(r.URL.Path, "/api/collections")
	path = strings.TrimPrefix(path, "/")

	// Handle /api/collections/{id}/share
	if strings.HasSuffix(path, "/share") {
		collectionID := strings.TrimSuffix(path, "/share")
		switch r.Method {
		case http.MethodPost:
			h.createShare(w, r, userID, collectionID)
		case http.MethodDelete:
			h.revokeShare(w, r, userID, collectionID)
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

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

func (h *CollectionHandler) list(w http.ResponseWriter, r *http.Request, userID string) {
	rows, err := h.DB.QueryRows("SELECT id, user_id, name, created_at, updated_at FROM collections WHERE user_id = ? ORDER BY updated_at DESC", userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if rows == nil {
		rows = []map[string]interface{}{}
	}
	writeJSON(w, http.StatusOK, rows)
}

func (h *CollectionHandler) create(w http.ResponseWriter, r *http.Request, userID string) {
	var body struct {
		Name string `json:"name"`
		Spec string `json:"spec"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	id := auth.GenerateID()
	err := h.DB.ExecuteOne(
		"INSERT INTO collections (id, user_id, name, spec) VALUES (?, ?, ?, ?)",
		id, userID, body.Name, body.Spec,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create collection")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "name": body.Name})
}

func (h *CollectionHandler) get(w http.ResponseWriter, r *http.Request, userID, id string) {
	row, err := h.DB.QueryRow("SELECT id, user_id, name, spec, created_at, updated_at FROM collections WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if row == nil {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}
	writeJSON(w, http.StatusOK, row)
}

func (h *CollectionHandler) update(w http.ResponseWriter, r *http.Request, userID, id string) {
	var body struct {
		Name string `json:"name"`
		Spec string `json:"spec"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	err := h.DB.ExecuteOne(
		"UPDATE collections SET name = ?, spec = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
		body.Name, body.Spec, id, userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update collection")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "updated"})
}

func (h *CollectionHandler) delete(w http.ResponseWriter, r *http.Request, userID, id string) {
	err := h.DB.ExecuteOne("DELETE FROM collections WHERE id = ? AND user_id = ?", id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete collection")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "status": "deleted"})
}

func (h *CollectionHandler) createShare(w http.ResponseWriter, r *http.Request, userID, collectionID string) {
	row, err := h.DB.QueryRow("SELECT id, share_token FROM collections WHERE id = ? AND user_id = ?", collectionID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if row == nil {
		writeError(w, http.StatusNotFound, "collection not found")
		return
	}

	token, _ := row["share_token"].(string)
	if token == "" {
		token = auth.GenerateID()
	}

	err = h.DB.ExecuteOne(
		"UPDATE collections SET share_token = ?, visibility = 'unlisted' WHERE id = ? AND user_id = ?",
		token, collectionID, userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create share link")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"shareToken": token,
		"url":        "/docs/" + token,
	})
}

func (h *CollectionHandler) revokeShare(w http.ResponseWriter, r *http.Request, userID, collectionID string) {
	err := h.DB.ExecuteOne(
		"UPDATE collections SET share_token = NULL, visibility = 'private' WHERE id = ? AND user_id = ?",
		collectionID, userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke share link")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "revoked"})
}
