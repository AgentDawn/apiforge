package collection

import (
	"fmt"
	"time"

	"github.com/AgentDawn/apiforge/internal/storage"
	"github.com/google/uuid"
)

type Request struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Method      string `json:"method"`
	URL         string `json:"url"`
}

type Item struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	Name    string  `json:"name,omitempty"`
	Items   []Item  `json:"items,omitempty"`
	Request *Request `json:"request,omitempty"`
}

type AuthConfig struct {
	Type   string            `json:"type"`
	Bearer map[string]string `json:"bearer,omitempty"`
}

type CollVariable struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type Collection struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Version     string         `json:"version"`
	Auth        *AuthConfig    `json:"auth,omitempty"`
	Items       []Item         `json:"items"`
	Variables   []CollVariable `json:"variables"`
	CreatedAt   string         `json:"createdAt"`
	UpdatedAt   string         `json:"updatedAt"`
}

type IndexEntry struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Manager struct {
	store storage.Storage
}

func NewManager(store storage.Storage) *Manager {
	return &Manager{store: store}
}

func (m *Manager) Create(name, description string) (*Collection, error) {
	col := &Collection{
		ID:          uuid.New().String(),
		Name:        name,
		Description: description,
		Version:     "1.0.0",
		Items:       []Item{},
		Variables:   []CollVariable{},
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	if err := m.store.Set("col:"+col.ID, col); err != nil {
		return nil, err
	}
	if err := m.updateIndex(col.ID, col.Name); err != nil {
		return nil, err
	}
	return col, nil
}

func (m *Manager) Save(col *Collection) error {
	col.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return m.store.Set("col:"+col.ID, col)
}

func (m *Manager) List() ([]IndexEntry, error) {
	var index []IndexEntry
	err := m.store.Get("col:index", &index)
	if err != nil {
		return []IndexEntry{}, nil
	}
	return index, nil
}

func (m *Manager) Get(id string) (*Collection, error) {
	var col Collection
	if err := m.store.Get("col:"+id, &col); err != nil {
		return nil, err
	}
	return &col, nil
}

func (m *Manager) GetByName(name string) (*Collection, error) {
	index, _ := m.List()
	for _, entry := range index {
		if entry.Name == name {
			return m.Get(entry.ID)
		}
	}
	return nil, fmt.Errorf("collection not found: %s", name)
}

func (m *Manager) Delete(id string) error {
	m.store.Delete("col:" + id)
	index, _ := m.List()
	var filtered []IndexEntry
	for _, e := range index {
		if e.ID != id {
			filtered = append(filtered, e)
		}
	}
	return m.store.Set("col:index", filtered)
}

func (m *Manager) updateIndex(id, name string) error {
	index, _ := m.List()
	for i, e := range index {
		if e.ID == id {
			index[i].Name = name
			return m.store.Set("col:index", index)
		}
	}
	index = append(index, IndexEntry{ID: id, Name: name})
	return m.store.Set("col:index", index)
}
