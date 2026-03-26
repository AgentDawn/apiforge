package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/AgentDawn/apiforge-server/internal/auth"
	"github.com/AgentDawn/apiforge-server/internal/db"
	"github.com/AgentDawn/apiforge-server/internal/handler"
	"github.com/AgentDawn/apiforge-server/internal/middleware"
)

func main() {
	// Configuration from env vars
	port := getEnv("PORT", "8090")
	rqliteURL := getEnv("RQLITE_URL", "http://localhost:4001")
	jwtSecret := getEnv("JWT_SECRET", "")

	if jwtSecret == "" {
		// Generate a random secret if not set
		b := make([]byte, 32)
		rand.Read(b)
		jwtSecret = hex.EncodeToString(b)
		log.Println("WARNING: JWT_SECRET not set, using random secret (tokens won't survive restart)")
	}
	auth.SetSecret(jwtSecret)

	// Database
	dbClient := db.NewClient(rqliteURL)
	if err := dbClient.Migrate(); err != nil {
		log.Printf("WARNING: Database migration failed (is rqlite running at %s?): %v", rqliteURL, err)
		log.Println("Server will start but database operations will fail until rqlite is available")
	} else {
		log.Println("Database migrated successfully")
	}

	// Initialize API token auth
	middleware.InitAPITokenAuth(dbClient)

	// Handlers
	authHandler := &handler.AuthHandler{DB: dbClient}
	collectionHandler := &handler.CollectionHandler{DB: dbClient}
	envHandler := &handler.EnvironmentHandler{DB: dbClient}
	tokenHandler := &handler.TokenHandler{DB: dbClient}
	proxyHandler := &handler.ProxyHandler{}
	grpcProxyHandler := &handler.GrpcProxyHandler{}
	agentHandler := &handler.AgentHandler{}
	publicDocsHandler := &handler.PublicDocsHandler{DB: dbClient}

	// Mux
	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("/auth/register", authHandler.Register)
	mux.HandleFunc("/auth/login", authHandler.Login)

	// Protected routes (require JWT)
	mux.Handle("/api/collections", middleware.Auth(collectionHandler))
	mux.Handle("/api/collections/", middleware.Auth(collectionHandler))
	mux.Handle("/api/environments", middleware.Auth(envHandler))
	mux.Handle("/api/environments/", middleware.Auth(envHandler))
	mux.Handle("/api/proxy", middleware.Auth(proxyHandler))
	mux.Handle("/api/grpc", middleware.Auth(grpcProxyHandler))
	mux.Handle("/api/tokens", middleware.Auth(tokenHandler))
	mux.Handle("/api/tokens/", middleware.Auth(tokenHandler))
	mux.Handle("/api/agent/chat", middleware.Auth(agentHandler))

	// Public docs (no auth required)
	mux.Handle("/public/docs/", publicDocsHandler)

	// Health check (includes initialization status)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		initialized := false
		row, err := dbClient.QueryRow("SELECT COUNT(*) as cnt FROM users")
		if err == nil && row != nil {
			if cnt, ok := row["cnt"].(float64); ok && cnt > 0 {
				initialized = true
			}
		}
		fmt.Fprintf(w, `{"status":"ok","initialized":%t,"version":"0.1.0"}`, initialized)
	})

	// Initial admin setup (only when no users exist)
	mux.HandleFunc("/auth/setup", authHandler.Setup)

	// Static file serving (for local dev mode without nginx)
	webDir := getEnv("WEB_DIR", "")
	if webDir != "" {
		fs := http.FileServer(http.Dir(webDir))
		mux.Handle("/", fs)
		fmt.Printf("  Serving static files from: %s\n", webDir)
	}

	// Wrap everything with CORS
	server := middleware.CORS(mux)

	addr := ":" + port
	fmt.Printf("APIForge server starting on http://localhost%s\n", addr)
	fmt.Printf("  rqlite: %s\n", rqliteURL)
	fmt.Println("  Endpoints:")
	fmt.Println("    POST /auth/register    - Create account")
	fmt.Println("    POST /auth/login       - Login")
	fmt.Println("    GET  /api/collections  - List collections")
	fmt.Println("    POST /api/collections  - Create collection")
	fmt.Println("    GET  /api/environments - List environments")
	fmt.Println("    POST /api/environments - Create environment")
	fmt.Println("    POST /api/proxy        - CORS proxy")
	fmt.Println("    POST /api/grpc         - gRPC proxy (JSON to gRPC-Web)")
	fmt.Println("    POST /api/tokens       - Create API token")
	fmt.Println("    GET  /api/tokens       - List API tokens")
	fmt.Println("    DELETE /api/tokens/{id} - Revoke API token")
	fmt.Println("    POST /api/agent/chat   - Agent Mode (Claude CLI)")
	fmt.Println("    POST /api/collections/{id}/share - Create share link")
	fmt.Println("    GET  /public/docs/{token}       - Public API docs")
	fmt.Println("    POST /auth/setup                - Initial admin setup")
	fmt.Println("    GET  /health                    - Health check (includes init status)")

	if err := http.ListenAndServe(addr, server); err != nil {
		log.Fatal(err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
