package model

import "time"

type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Collection struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Spec      string    `json:"spec"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Environment struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	Name      string    `json:"name"`
	Variables string    `json:"variables"` // JSON string
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type SavedRequest struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collectionId"`
	UserID       string    `json:"userId"`
	Name         string    `json:"name"`
	Method       string    `json:"method"`
	URL          string    `json:"url"`
	Headers      string    `json:"headers"` // JSON string
	Body         string    `json:"body"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// API Token (long-lived, for CI/CD)
type APIToken struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`      // first 8 chars for identification
	CreatedAt  string `json:"created_at"`
	ExpiresAt  string `json:"expires_at"`   // empty = never expires
	LastUsedAt string `json:"last_used_at"` // empty = never used
}

type CreateTokenRequest struct {
	Name      string `json:"name"`
	ExpiresIn int    `json:"expiresInDays"` // 0 = never expires
}

type CreateTokenResponse struct {
	Token    string   `json:"token"` // shown only once
	APIToken APIToken `json:"apiToken"`
}

// Auth DTOs
type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}
