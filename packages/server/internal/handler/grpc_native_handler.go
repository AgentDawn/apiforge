package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/bufbuild/protocompile"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
	"crypto/tls"
)

// stripEmptyValues walks a JSON document and removes fields whose value is an
// empty string. This lets clients submit forms with blank enum / numeric
// fields without protojson rejecting the whole request.
func stripEmptyValues(data []byte) []byte {
	var decoded interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		return data
	}
	cleaned := stripEmptyRecursive(decoded)
	out, err := json.Marshal(cleaned)
	if err != nil {
		return data
	}
	return out
}

func stripEmptyRecursive(v interface{}) interface{} {
	switch val := v.(type) {
	case map[string]interface{}:
		result := make(map[string]interface{}, len(val))
		for k, vv := range val {
			// Skip empty strings (would fail enum / numeric parsing)
			if s, ok := vv.(string); ok && s == "" {
				continue
			}
			// Skip empty objects (common when UI generates placeholder structures
			// for unset nested messages or unknown enum fields)
			if m, ok := vv.(map[string]interface{}); ok && len(m) == 0 {
				continue
			}
			result[k] = stripEmptyRecursive(vv)
		}
		return result
	case []interface{}:
		result := make([]interface{}, 0, len(val))
		for _, vv := range val {
			result = append(result, stripEmptyRecursive(vv))
		}
		return result
	}
	return v
}

// rewriteLocalhostTarget rewrites "localhost:PORT" or "127.0.0.1:PORT" to
// "host.docker.internal:PORT" when the server runs in Docker. This lets
// users point at a gRPC server running on their host machine (e.g. via
// "localhost:50051") while the apiforge server dials it from inside the
// container. Configured via APIFORGE_LOCALHOST_REWRITE env var in
// docker-compose (set to "host.docker.internal" by default).
func rewriteLocalhostTarget(target string) string {
	rewrite := os.Getenv("APIFORGE_LOCALHOST_REWRITE")
	if rewrite == "" {
		return target
	}
	parts := strings.SplitN(target, ":", 2)
	host := parts[0]
	if host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" {
		if len(parts) == 2 {
			return rewrite + ":" + parts[1]
		}
		return rewrite
	}
	return target
}

// GrpcNativeHandler handles pure gRPC calls via dynamic protobuf.
// The client sends the .proto file content along with the request,
// and the server parses it, encodes the message, calls the target
// gRPC server, and returns the JSON-decoded response.
//
// This lets CLI and AI agents call gRPC servers without needing
// generated client code — only the .proto file is required.
type GrpcNativeHandler struct{}

type grpcNativeRequest struct {
	Target   string            `json:"target"`   // e.g. "localhost:50051"
	Service  string            `json:"service"`  // full name, e.g. "petstore.PetService"
	Method   string            `json:"method"`   // e.g. "GetPet"
	Body     json.RawMessage   `json:"body"`     // JSON payload for the request message
	Metadata map[string]string `json:"metadata"` // gRPC metadata headers
	TLS      bool              `json:"tls"`      // use TLS
	Proto    string            `json:"proto"`    // .proto file content as string
}

func (h *GrpcNativeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}

	var req grpcNativeRequest
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
	if req.Proto == "" {
		writeError(w, http.StatusBadRequest, "proto is required (.proto file content)")
		return
	}

	// Parse the .proto file content using protocompile.
	// We expose the content as a virtual file "input.proto" via a custom accessor
	// so protocompile can include it as a regular compile unit.
	protoContent := req.Proto
	accessor := func(path string) (io.ReadCloser, error) {
		if path == "input.proto" {
			return io.NopCloser(strings.NewReader(protoContent)), nil
		}
		return nil, fmt.Errorf("file not found: %s", path)
	}
	resolver := protocompile.WithStandardImports(&protocompile.SourceResolver{
		Accessor: accessor,
	})
	compiler := &protocompile.Compiler{Resolver: resolver}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	files, err := compiler.Compile(ctx, "input.proto")
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse .proto: "+err.Error())
		return
	}

	file := files.FindFileByPath("input.proto")
	if file == nil {
		writeError(w, http.StatusBadRequest, "proto file not found after compilation")
		return
	}

	// Find the service by matching either full name or short name
	var svcDesc protoreflect.ServiceDescriptor
	services := file.Services()
	for i := 0; i < services.Len(); i++ {
		s := services.Get(i)
		if string(s.FullName()) == req.Service || string(s.Name()) == req.Service {
			svcDesc = s
			break
		}
	}
	if svcDesc == nil {
		available := make([]string, 0, services.Len())
		for i := 0; i < services.Len(); i++ {
			available = append(available, string(services.Get(i).FullName()))
		}
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":     "service not found: " + req.Service,
			"available": available,
		})
		return
	}

	// Find the method
	methodDesc := svcDesc.Methods().ByName(protoreflect.Name(req.Method))
	if methodDesc == nil {
		available := make([]string, 0, svcDesc.Methods().Len())
		for i := 0; i < svcDesc.Methods().Len(); i++ {
			available = append(available, string(svcDesc.Methods().Get(i).Name()))
		}
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":     "method not found: " + req.Method,
			"available": available,
		})
		return
	}

	// Streaming RPCs are not supported in this unary-only handler
	if methodDesc.IsStreamingClient() || methodDesc.IsStreamingServer() {
		writeError(w, http.StatusBadRequest, "streaming RPCs are not supported by this endpoint (unary only)")
		return
	}

	// Build the dynamic request message from JSON.
	// Empty string values are stripped before unmarshalling because protojson
	// rejects empty strings for enum / message / numeric fields. This mirrors
	// how human API clients typically submit optional fields ("") to mean
	// "no value" — we interpret that as "omit the field".
	reqMsg := dynamicpb.NewMessage(methodDesc.Input())
	if len(req.Body) > 0 && string(req.Body) != "null" {
		bodyBytes := stripEmptyValues(req.Body)
		unmarshaler := protojson.UnmarshalOptions{DiscardUnknown: true}
		if err := unmarshaler.Unmarshal(bodyBytes, reqMsg); err != nil {
			writeError(w, http.StatusBadRequest, "failed to parse body as JSON for message type "+string(methodDesc.Input().FullName())+": "+err.Error())
			return
		}
	}

	// Build the dynamic response message
	respMsg := dynamicpb.NewMessage(methodDesc.Output())

	// Dial the target gRPC server
	var opts []grpc.DialOption
	if req.TLS {
		opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12})))
	} else {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	dialCtx, dialCancel := context.WithTimeout(ctx, 10*time.Second)
	defer dialCancel()

	dialTarget := rewriteLocalhostTarget(req.Target)
	conn, err := grpc.NewClient(dialTarget, opts...)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"error":  "failed to create gRPC client: " + err.Error(),
			"target": req.Target,
		})
		return
	}
	defer conn.Close()
	_ = dialCtx

	// Attach metadata as gRPC headers
	callCtx := ctx
	if len(req.Metadata) > 0 {
		md := metadata.New(nil)
		for k, v := range req.Metadata {
			md.Set(strings.ToLower(k), v)
		}
		callCtx = metadata.NewOutgoingContext(ctx, md)
	}

	// Invoke the method.
	// Full method path format: /package.Service/Method
	fullMethod := "/" + string(svcDesc.FullName()) + "/" + string(methodDesc.Name())

	start := time.Now()
	invokeErr := conn.Invoke(callCtx, fullMethod, reqMsg, respMsg)
	elapsed := time.Since(start)

	if invokeErr != nil {
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"error":     "gRPC call failed: " + invokeErr.Error(),
			"target":    req.Target,
			"method":    fullMethod,
			"timing_ms": elapsed.Milliseconds(),
		})
		return
	}

	// Marshal response to JSON using protojson (respects proto field names)
	respBytes, err := protojson.MarshalOptions{
		UseProtoNames:   true,
		EmitUnpopulated: true,
	}.Marshal(respMsg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode response: "+err.Error())
		return
	}

	var respData interface{}
	if err := json.Unmarshal(respBytes, &respData); err != nil {
		// Fallback: return raw bytes as string
		respData = string(respBytes)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    200,
		"target":    req.Target,
		"method":    fullMethod,
		"timing_ms": elapsed.Milliseconds(),
		"response":  respData,
	})
}
