package handler

import (
	"io"
	"net/http"
)

// ProxyHandler forwards API requests to bypass CORS restrictions.
type ProxyHandler struct{}

func (h *ProxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST with target request in body")
		return
	}

	var req struct {
		Method  string            `json:"method"`
		URL     string            `json:"url"`
		Headers map[string]string `json:"headers"`
		Body    string            `json:"body"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if req.Method == "" {
		req.Method = "GET"
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = io.NopCloser(
			io.LimitReader(
				readerFromString(req.Body), 10*1024*1024,
			),
		)
	}

	proxyReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid target request: "+err.Error())
		return
	}

	for k, v := range req.Headers {
		proxyReq.Header.Set(k, v)
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		writeError(w, http.StatusBadGateway, "proxy request failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for k, vals := range resp.Header {
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	w.Header().Set("X-Proxy-Status", http.StatusText(resp.StatusCode))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

type stringReader struct {
	s string
	i int
}

func (r *stringReader) Read(p []byte) (int, error) {
	if r.i >= len(r.s) {
		return 0, io.EOF
	}
	n := copy(p, r.s[r.i:])
	r.i += n
	return n, nil
}

func readerFromString(s string) io.Reader {
	return &stringReader{s: s}
}
