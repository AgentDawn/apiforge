package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

// Event represents a server-sent event
type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// EventBroker manages SSE client connections and broadcasts events
type EventBroker struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
}

// NewEventBroker creates a new SSE event broker
func NewEventBroker() *EventBroker {
	return &EventBroker{
		clients: make(map[chan Event]struct{}),
	}
}

// Subscribe adds a new client channel
func (b *EventBroker) Subscribe() chan Event {
	ch := make(chan Event, 16)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

// Unsubscribe removes a client channel
func (b *EventBroker) Unsubscribe(ch chan Event) {
	b.mu.Lock()
	delete(b.clients, ch)
	close(ch)
	b.mu.Unlock()
}

// Publish sends an event to all connected clients
func (b *EventBroker) Publish(event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- event:
		default:
			// Skip slow clients
		}
	}
}

// ServeHTTP handles the SSE endpoint
func (b *EventBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	ch := b.Subscribe()
	defer b.Unsubscribe(ch)

	// Send initial connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(evt.Data)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, data)
			flusher.Flush()
		}
	}
}
