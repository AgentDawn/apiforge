package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
)

type contextKey string

const UserIDKey contextKey = "userID"
const UsernameKey contextKey = "username"

// APITokenVerifier checks a raw API token against the database.
// Returns (userID, username, error).
type APITokenVerifier func(rawToken string) (string, string, error)

var apiTokenVerifier APITokenVerifier

// SetAPITokenVerifier registers the function used to verify API tokens.
func SetAPITokenVerifier(fn APITokenVerifier) {
	apiTokenVerifier = fn
}

// InitAPITokenAuth sets up API token verification with the given DB client.
func InitAPITokenAuth(dbClient *db.Client) {
	// Import is avoided here; the handler package calls VerifyAPIToken.
	// We use a closure to capture dbClient.
	SetAPITokenVerifier(func(rawToken string) (string, string, error) {
		return verifyAPITokenFromDB(dbClient, rawToken)
	})
}

// Auth validates JWT or API token and injects user info into context.
func Auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, `{"error":"missing or invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		token := strings.TrimPrefix(header, "Bearer ")

		var userID, username string

		// Try API token first (starts with "afk_")
		if strings.HasPrefix(token, "afk_") && apiTokenVerifier != nil {
			uid, uname, err := apiTokenVerifier(token)
			if err != nil {
				http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusUnauthorized)
				return
			}
			userID = uid
			username = uname
		} else {
			// Fall back to JWT
			claims, err := auth.VerifyToken(token)
			if err != nil {
				http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusUnauthorized)
				return
			}
			userID = claims.UserID
			username = claims.Username
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		ctx = context.WithValue(ctx, UsernameKey, username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserID extracts user ID from context.
func GetUserID(r *http.Request) string {
	v, _ := r.Context().Value(UserIDKey).(string)
	return v
}

// verifyAPITokenFromDB checks a raw API token against the database.
func verifyAPITokenFromDB(dbClient *db.Client, rawToken string) (string, string, error) {
	hash := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hash[:])

	row, err := dbClient.QueryRow(
		`SELECT t.id, t.user_id, t.expires_at, u.username
		 FROM api_tokens t JOIN users u ON t.user_id = u.id
		 WHERE t.token_hash = ?`,
		tokenHash,
	)
	if err != nil || row == nil {
		return "", "", fmt.Errorf("invalid api token")
	}

	expiresAt := fmt.Sprint(row["expires_at"])
	if expiresAt != "" && expiresAt != "<nil>" {
		exp, err := time.Parse(time.RFC3339, expiresAt)
		if err == nil && time.Now().After(exp) {
			return "", "", fmt.Errorf("api token expired")
		}
	}

	userID := fmt.Sprint(row["user_id"])
	username := fmt.Sprint(row["username"])
	tokenID := fmt.Sprint(row["id"])

	// Update last_used_at (fire and forget)
	go dbClient.ExecuteOne(
		`UPDATE api_tokens SET last_used_at = datetime('now') WHERE id = ?`,
		tokenID,
	)

	return userID, username, nil
}
