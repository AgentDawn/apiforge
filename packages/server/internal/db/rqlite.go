package db

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Client is a lightweight rqlite HTTP API client.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{},
	}
}

// executeResult represents rqlite execute response.
type executeResult struct {
	Results []struct {
		RowsAffected int64  `json:"rows_affected"`
		LastInsertID int64  `json:"last_insert_id"`
		Error        string `json:"error"`
	} `json:"results"`
}

// queryResult represents rqlite query response.
type queryResult struct {
	Results []struct {
		Columns []string        `json:"columns"`
		Types   []string        `json:"types"`
		Values  [][]interface{} `json:"values"`
		Error   string          `json:"error"`
	} `json:"results"`
}

// Execute runs one or more write statements (INSERT, UPDATE, DELETE, CREATE TABLE).
func (c *Client) Execute(statements [][]interface{}) (*executeResult, error) {
	body, err := json.Marshal(statements)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/db/execute", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result executeResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}

	if len(result.Results) > 0 && result.Results[0].Error != "" {
		return nil, fmt.Errorf("rqlite: %s", result.Results[0].Error)
	}

	return &result, nil
}

// ExecuteOne runs a single write statement with optional params.
func (c *Client) ExecuteOne(stmt string, args ...interface{}) error {
	s := make([]interface{}, 0, len(args)+1)
	s = append(s, stmt)
	s = append(s, args...)
	_, err := c.Execute([][]interface{}{s})
	return err
}

// Query runs a single read statement.
func (c *Client) Query(stmt string, args ...interface{}) (*queryResult, error) {
	s := make([]interface{}, 0, len(args)+1)
	s = append(s, stmt)
	s = append(s, args...)

	body, err := json.Marshal([][]interface{}{s})
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	resp, err := c.httpClient.Post(c.baseURL+"/db/query", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("query request: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result queryResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}

	if len(result.Results) > 0 && result.Results[0].Error != "" {
		return nil, fmt.Errorf("rqlite: %s", result.Results[0].Error)
	}

	return &result, nil
}

// QueryRow returns the first row as a map, or nil.
func (c *Client) QueryRow(stmt string, args ...interface{}) (map[string]interface{}, error) {
	result, err := c.Query(stmt, args...)
	if err != nil {
		return nil, err
	}
	if len(result.Results) == 0 || len(result.Results[0].Values) == 0 {
		return nil, nil
	}

	columns := result.Results[0].Columns
	values := result.Results[0].Values[0]
	row := make(map[string]interface{}, len(columns))
	for i, col := range columns {
		row[col] = values[i]
	}
	return row, nil
}

// QueryRows returns all rows as maps.
func (c *Client) QueryRows(stmt string, args ...interface{}) ([]map[string]interface{}, error) {
	result, err := c.Query(stmt, args...)
	if err != nil {
		return nil, err
	}
	if len(result.Results) == 0 || result.Results[0].Values == nil {
		return nil, nil
	}

	columns := result.Results[0].Columns
	rows := make([]map[string]interface{}, 0, len(result.Results[0].Values))
	for _, values := range result.Results[0].Values {
		row := make(map[string]interface{}, len(columns))
		for i, col := range columns {
			row[col] = values[i]
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// Migrate creates tables if they don't exist.
func (c *Client) Migrate() error {
	stmts := [][]interface{}{
		{`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		)`},
		{`CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			name TEXT NOT NULL,
			spec TEXT,
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		)`},
		{`ALTER TABLE collections ADD COLUMN visibility TEXT DEFAULT 'private'`},
		{`ALTER TABLE collections ADD COLUMN share_token TEXT`},
		{`CREATE INDEX IF NOT EXISTS idx_collections_share_token ON collections(share_token)`},
		{`CREATE TABLE IF NOT EXISTS environments (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			name TEXT NOT NULL,
			variables TEXT DEFAULT '{}',
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		)`},
		{`CREATE TABLE IF NOT EXISTS requests (
			id TEXT PRIMARY KEY,
			collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id),
			name TEXT,
			method TEXT,
			url TEXT,
			headers TEXT DEFAULT '{}',
			body TEXT DEFAULT '',
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		)`},
		{`CREATE TABLE IF NOT EXISTS api_tokens (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id),
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL,
			prefix TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			expires_at TEXT DEFAULT '',
			last_used_at TEXT DEFAULT ''
		)`},
	}
	_, err := c.Execute(stmts)
	return err
}
