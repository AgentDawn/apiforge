package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/AgentDawn/apiforge/internal/collection"
	"github.com/AgentDawn/apiforge/internal/environment"
	"github.com/AgentDawn/apiforge/internal/storage"
)

type Server struct {
	collections *collection.Manager
	envs        *environment.Manager
	store       storage.Storage
	mux         *http.ServeMux
	webDir      string // path to web UI static files
}

func NewServer(col *collection.Manager, env *environment.Manager, store storage.Storage, webDir string) *Server {
	s := &Server{
		collections: col,
		envs:        env,
		store:       store,
		webDir:      webDir,
		mux:         http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) Start(addr string) error {
	return http.ListenAndServe(addr, s.cors(s.mux))
}

func (s *Server) registerRoutes() {
	// Collections
	s.mux.HandleFunc("GET /api/collections", s.listCollections)
	s.mux.HandleFunc("GET /api/collections/{id}", s.getCollection)
	s.mux.HandleFunc("POST /api/collections", s.createCollection)
	s.mux.HandleFunc("DELETE /api/collections/{id}", s.deleteCollection)

	// Environments
	s.mux.HandleFunc("GET /api/environments", s.listEnvironments)
	s.mux.HandleFunc("GET /api/environments/{id}", s.getEnvironment)
	s.mux.HandleFunc("POST /api/environments", s.createEnvironment)
	s.mux.HandleFunc("PUT /api/environments/{id}/variables", s.setVariable)
	s.mux.HandleFunc("POST /api/environments/{id}/activate", s.activateEnvironment)
	s.mux.HandleFunc("DELETE /api/environments/{id}", s.deleteEnvironment)

	// Import spec (receives OpenAPI JSON, creates collection)
	s.mux.HandleFunc("POST /api/import", s.importSpec)

	// Health check
	s.mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": "0.1.0"})
	})

	// Serve static web UI files
	if s.webDir != "" {
		s.mux.HandleFunc("/", s.serveStatic)
	}
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// --- Collection handlers ---

func (s *Server) listCollections(w http.ResponseWriter, r *http.Request) {
	cols, err := s.collections.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, cols)
}

func (s *Server) getCollection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	col, err := s.collections.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, col)
}

func (s *Server) createCollection(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	col, err := s.collections.Create(body.Name, body.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, col)
}

func (s *Server) deleteCollection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.collections.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Environment handlers ---

func (s *Server) listEnvironments(w http.ResponseWriter, r *http.Request) {
	envs, err := s.envs.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	activeID, _ := s.envs.GetActiveID()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"environments": envs,
		"activeId":     activeID,
	})
}

func (s *Server) getEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	env, err := s.envs.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, env)
}

func (s *Server) createEnvironment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string            `json:"name"`
		Variables map[string]string `json:"variables"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	env, err := s.envs.Create(body.Name, body.Variables)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, env)
}

func (s *Server) setVariable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.envs.SetVariable(id, body.Key, body.Value); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) activateEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.envs.SetActive(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "activeId": id})
}

func (s *Server) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.envs.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Import handler ---

func (s *Server) importSpec(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string          `json:"name"`
		Spec json.RawMessage `json:"spec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	// Parse the spec to extract basic info
	var spec struct {
		Info struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			Version     string `json:"version"`
		} `json:"info"`
		Servers []struct {
			URL         string `json:"url"`
			Description string `json:"description"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(body.Spec, &spec); err != nil {
		writeError(w, http.StatusBadRequest, "invalid OpenAPI spec")
		return
	}

	name := body.Name
	if name == "" {
		name = spec.Info.Title
	}
	if name == "" {
		name = "Imported API"
	}

	col, err := s.collections.Create(name, spec.Info.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Store raw spec alongside collection
	if err := s.store.Set(fmt.Sprintf("spec:%s", col.ID), body.Spec); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Auto-create environments from servers
	var createdEnvs []string
	for _, server := range spec.Servers {
		envName := server.Description
		if envName == "" {
			envName = server.URL
		}
		env, err := s.envs.Create(envName, map[string]string{"baseUrl": server.URL})
		if err == nil {
			createdEnvs = append(createdEnvs, env.Name)
		}
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"collection":   col,
		"environments": createdEnvs,
	})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// --- Static file server ---

func (s *Server) serveStatic(w http.ResponseWriter, r *http.Request) {
	// Only serve non-API paths
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}

	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	filePath := filepath.Join(s.webDir, filepath.Clean(path))

	// Security: ensure we don't serve outside webDir
	absWeb, _ := filepath.Abs(s.webDir)
	absFile, _ := filepath.Abs(filePath)
	if !strings.HasPrefix(absFile, absWeb) {
		http.NotFound(w, r)
		return
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// SPA fallback: serve index.html for non-file paths
		filePath = filepath.Join(s.webDir, "index.html")
	}

	// Set content type based on extension
	ext := filepath.Ext(filePath)
	switch ext {
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case ".js":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	case ".json":
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
	}

	http.ServeFile(w, r, filePath)
}
