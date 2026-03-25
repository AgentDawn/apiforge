package handler

import (
	"net/http"
	"time"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/model"
)

type AuthHandler struct {
	DB *db.Client
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req model.RegisterRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	if len(req.Password) < 6 {
		writeError(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	// Check if username already exists
	existing, err := h.DB.QueryRow("SELECT id FROM users WHERE username = ?", req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if existing != nil {
		writeError(w, http.StatusConflict, "username already exists")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	id := auth.GenerateID()
	err = h.DB.ExecuteOne(
		"INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
		id, req.Username, hash,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	token, err := auth.CreateToken(id, req.Username, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusCreated, model.LoginResponse{
		Token: token,
		User: model.User{
			ID:        id,
			Username:  req.Username,
			CreatedAt: time.Now(),
		},
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req model.LoginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password are required")
		return
	}

	row, err := h.DB.QueryRow("SELECT id, username, password_hash, created_at FROM users WHERE username = ?", req.Username)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if row == nil {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	hash, _ := row["password_hash"].(string)
	if !auth.CheckPassword(req.Password, hash) {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	userID, _ := row["id"].(string)
	username, _ := row["username"].(string)

	token, err := auth.CreateToken(userID, username, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create token")
		return
	}

	writeJSON(w, http.StatusOK, model.LoginResponse{
		Token: token,
		User: model.User{
			ID:       userID,
			Username: username,
		},
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	userID, _ := r.Context().Value("userID").(string)
	row, err := h.DB.QueryRow("SELECT id, username, created_at FROM users WHERE id = ?", userID)
	if err != nil || row == nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":       row["id"],
		"username": row["username"],
	})
}
