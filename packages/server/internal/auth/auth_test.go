package auth

import (
	"testing"
	"time"
)

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("mypassword123")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "" {
		t.Fatal("hash should not be empty")
	}
	if !CheckPassword("mypassword123", hash) {
		t.Error("CheckPassword should return true for correct password")
	}
	if CheckPassword("wrongpassword", hash) {
		t.Error("CheckPassword should return false for wrong password")
	}
}

func TestGenerateID(t *testing.T) {
	id1 := GenerateID()
	id2 := GenerateID()
	if len(id1) != 32 {
		t.Errorf("ID should be 32 hex chars, got %d", len(id1))
	}
	if id1 == id2 {
		t.Error("IDs should be unique")
	}
}

func TestCreateAndVerifyToken(t *testing.T) {
	SetSecret("test-secret-key-for-testing")

	token, err := CreateToken("user-123", "testuser", time.Hour)
	if err != nil {
		t.Fatalf("CreateToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("token should not be empty")
	}

	claims, err := VerifyToken(token)
	if err != nil {
		t.Fatalf("VerifyToken failed: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("expected UserID 'user-123', got '%s'", claims.UserID)
	}
	if claims.Username != "testuser" {
		t.Errorf("expected Username 'testuser', got '%s'", claims.Username)
	}
}

func TestTokenExpired(t *testing.T) {
	SetSecret("test-secret-key-for-testing")

	token, err := CreateToken("user-123", "testuser", -time.Hour)
	if err != nil {
		t.Fatalf("CreateToken failed: %v", err)
	}

	_, err = VerifyToken(token)
	if err == nil {
		t.Error("expired token should fail verification")
	}
}

func TestTokenInvalidSignature(t *testing.T) {
	SetSecret("secret-1")
	token, _ := CreateToken("user-123", "testuser", time.Hour)

	SetSecret("secret-2")
	_, err := VerifyToken(token)
	if err == nil {
		t.Error("token signed with different secret should fail")
	}
}

func TestTokenInvalidFormat(t *testing.T) {
	SetSecret("test-secret")
	_, err := VerifyToken("not.a.valid.token.format")
	if err == nil {
		t.Error("invalid format should fail")
	}
	_, err = VerifyToken("garbage")
	if err == nil {
		t.Error("garbage token should fail")
	}
}
