package handler

import (
	"net/http"
	"strings"

	"github.com/AgentDawn/apiforge-server/internal/db"
)

// PublicDocsHandler serves shared collection data (no auth required).
type PublicDocsHandler struct {
	DB *db.Client
}

func (h *PublicDocsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	// Path: /public/docs/{shareToken}
	token := strings.TrimPrefix(r.URL.Path, "/public/docs/")
	token = strings.TrimSuffix(token, "/")
	if token == "" {
		writeError(w, http.StatusBadRequest, "share token required")
		return
	}

	row, err := h.DB.QueryRow(
		"SELECT id, name, spec, visibility, created_at, updated_at FROM collections WHERE share_token = ? AND visibility IN ('unlisted', 'public')",
		token,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if row == nil {
		writeError(w, http.StatusNotFound, "document not found or not shared")
		return
	}

	writeJSON(w, http.StatusOK, row)
}
