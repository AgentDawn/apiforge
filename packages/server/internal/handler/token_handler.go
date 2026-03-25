package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/middleware"
	"github.com/AgentDawn/apiforge-server/internal/model"
)

type TokenHandler struct {
	DB *db.Client
}

func (h *TokenHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	path := strings.TrimPrefix(r.URL.Path, "/api/tokens")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.list(w, r, userID)
	case path == "" && r.Method == http.MethodPost:
		h.create(w, r, userID)
	case path != "" && r.Method == http.MethodDelete:
		h.revoke(w, r, userID, path)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *TokenHandler) create(w http.ResponseWriter, r *http.Request, userID string) {
	var req model.CreateTokenRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	// Generate a random token: "afk_" prefix + 48 hex chars
	rawToken := "afk_" + auth.GenerateID() + auth.GenerateID()[:16]
	prefix := rawToken[:12] // "afk_" + 8 chars for display

	// Store SHA-256 hash only
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	id := auth.GenerateID()
	expiresAt := ""
	if req.ExpiresIn > 0 {
		expiresAt = time.Now().AddDate(0, 0, req.ExpiresIn).UTC().Format(time.RFC3339)
	}

	err := h.DB.ExecuteOne(
		`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)`,
		id, userID, req.Name, tokenHash, prefix, expiresAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusCreated, model.CreateTokenResponse{
		Token: rawToken,
		APIToken: model.APIToken{
			ID:        id,
			UserID:    userID,
			Name:      req.Name,
			Prefix:    prefix,
			ExpiresAt: expiresAt,
		},
	})
}

func (h *TokenHandler) list(w http.ResponseWriter, r *http.Request, userID string) {
	rows, err := h.DB.QueryRows(
		`SELECT id, user_id, name, prefix, created_at, expires_at, last_used_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tokens")
		return
	}

	tokens := make([]model.APIToken, 0, len(rows))
	for _, row := range rows {
		tokens = append(tokens, model.APIToken{
			ID:         fmt.Sprint(row["id"]),
			UserID:     fmt.Sprint(row["user_id"]),
			Name:       fmt.Sprint(row["name"]),
			Prefix:     fmt.Sprint(row["prefix"]),
			CreatedAt:  fmt.Sprint(row["created_at"]),
			ExpiresAt:  fmt.Sprint(row["expires_at"]),
			LastUsedAt: fmt.Sprint(row["last_used_at"]),
		})
	}

	writeJSON(w, http.StatusOK, tokens)
}

func (h *TokenHandler) revoke(w http.ResponseWriter, r *http.Request, userID string, tokenID string) {
	row, err := h.DB.QueryRow(
		`SELECT id FROM api_tokens WHERE id = ? AND user_id = ?`,
		tokenID, userID,
	)
	if err != nil || row == nil {
		writeError(w, http.StatusNotFound, "token not found")
		return
	}

	err = h.DB.ExecuteOne(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`, tokenID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke token")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}
