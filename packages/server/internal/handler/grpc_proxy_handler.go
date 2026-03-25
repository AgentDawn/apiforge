package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// GrpcProxyHandler proxies gRPC calls from the browser.
// It accepts JSON requests and forwards them to a gRPC-Web endpoint,
// or uses grpcurl-style invocation via the server.
type GrpcProxyHandler struct{}

type grpcProxyRequest struct {
	Target   string            `json:"target"`
	Service  string            `json:"service"`
	Method   string            `json:"method"`
	Body     json.RawMessage   `json:"body"`
	Metadata map[string]string `json:"metadata"`
	TLS      bool              `json:"tls"`
	Proto    string            `json:"proto"`
}

func (h *GrpcProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}

	var req grpcProxyRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Target == "" {
		writeError(w, http.StatusBadRequest, "target is required (e.g. localhost:50051)")
		return
	}
	if req.Service == "" || req.Method == "" {
		writeError(w, http.StatusBadRequest, "service and method are required")
		return
	}

	// Build the gRPC-Web request
	// gRPC full method path: /package.ServiceName/MethodName
	fullMethod := "/" + req.Service + "/" + req.Method

	// Determine the scheme
	scheme := "http"
	if req.TLS {
		scheme = "https"
	}

	// Try gRPC-Web (JSON) first — many gRPC servers support this via envoy or grpc-gateway
	grpcWebURL := fmt.Sprintf("%s://%s%s", scheme, req.Target, fullMethod)

	bodyBytes, _ := json.Marshal(req.Body)

	// gRPC-Web with JSON content type
	proxyReq, err := http.NewRequest("POST", grpcWebURL, bytes.NewReader(bodyBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid target: "+err.Error())
		return
	}

	proxyReq.Header.Set("Content-Type", "application/json")
	proxyReq.Header.Set("Accept", "application/json")

	// Forward metadata as gRPC headers
	for k, v := range req.Metadata {
		lower := strings.ToLower(k)
		if lower == "content-type" || lower == "accept" {
			continue
		}
		proxyReq.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		// If gRPC-Web fails, return connection error with helpful message
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"error":   "gRPC connection failed: " + err.Error(),
			"target":  req.Target,
			"method":  fullMethod,
			"hint":    "Ensure the gRPC server supports gRPC-Web or has a gRPC-Web proxy (e.g., Envoy) in front of it.",
		})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to read gRPC response: "+err.Error())
		return
	}

	// Try to parse as JSON for pretty output
	var jsonResp interface{}
	if json.Unmarshal(respBody, &jsonResp) == nil {
		writeJSON(w, resp.StatusCode, map[string]interface{}{
			"status":   resp.StatusCode,
			"method":   fullMethod,
			"response": jsonResp,
		})
	} else {
		// Return raw response with metadata
		writeJSON(w, resp.StatusCode, map[string]interface{}{
			"status":      resp.StatusCode,
			"method":      fullMethod,
			"response":    string(respBody),
			"contentType": resp.Header.Get("Content-Type"),
		})
	}
}
