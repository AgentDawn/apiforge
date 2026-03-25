package environment

import (
	"fmt"
	"time"

	"github.com/AgentDawn/apiforge/internal/storage"
	"github.com/google/uuid"
)

type Variable struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

type Environment struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Variables []Variable `json:"variables"`
	CreatedAt string     `json:"createdAt"`
	UpdatedAt string     `json:"updatedAt"`
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

func (m *Manager) Create(name string, vars map[string]string) (*Environment, error) {
	env := &Environment{
		ID:        uuid.New().String(),
		Name:      name,
		Variables: make([]Variable, 0),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	for k, v := range vars {
		env.Variables = append(env.Variables, Variable{
			Key: k, Value: v, Type: "default", Enabled: true,
		})
	}
	if err := m.store.Set("env:"+env.ID, env); err != nil {
		return nil, err
	}
	if err := m.updateIndex(env.ID, env.Name); err != nil {
		return nil, err
	}
	return env, nil
}

func (m *Manager) List() ([]IndexEntry, error) {
	var index []IndexEntry
	err := m.store.Get("env:index", &index)
	if err != nil {
		return []IndexEntry{}, nil
	}
	return index, nil
}

func (m *Manager) Get(id string) (*Environment, error) {
	var env Environment
	if err := m.store.Get("env:"+id, &env); err != nil {
		return nil, err
	}
	return &env, nil
}

func (m *Manager) GetByName(name string) (*Environment, error) {
	index, _ := m.List()
	for _, entry := range index {
		if entry.Name == name {
			return m.Get(entry.ID)
		}
	}
	return nil, fmt.Errorf("environment not found: %s", name)
}

func (m *Manager) SetVariable(envID, key, value string) error {
	env, err := m.Get(envID)
	if err != nil {
		return err
	}
	found := false
	for i, v := range env.Variables {
		if v.Key == key {
			env.Variables[i].Value = value
			found = true
			break
		}
	}
	if !found {
		env.Variables = append(env.Variables, Variable{
			Key: key, Value: value, Type: "default", Enabled: true,
		})
	}
	env.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return m.store.Set("env:"+envID, env)
}

func (m *Manager) SetActive(id string) error {
	return m.store.Set("env:active", id)
}

func (m *Manager) GetActiveID() (string, error) {
	var id string
	err := m.store.Get("env:active", &id)
	return id, err
}

func (m *Manager) GetActive() (*Environment, error) {
	id, err := m.GetActiveID()
	if err != nil {
		return nil, err
	}
	return m.Get(id)
}

func (m *Manager) GetActiveVariables() (map[string]string, error) {
	env, err := m.GetActive()
	if err != nil {
		return map[string]string{}, nil
	}
	vars := make(map[string]string)
	for _, v := range env.Variables {
		if v.Enabled {
			vars[v.Key] = v.Value
		}
	}
	return vars, nil
}

func (m *Manager) Delete(id string) error {
	m.store.Delete("env:" + id)
	index, _ := m.List()
	var filtered []IndexEntry
	for _, e := range index {
		if e.ID != id {
			filtered = append(filtered, e)
		}
	}
	return m.store.Set("env:index", filtered)
}

func (m *Manager) updateIndex(id, name string) error {
	index, _ := m.List()
	for i, e := range index {
		if e.ID == id {
			index[i].Name = name
			return m.store.Set("env:index", index)
		}
	}
	index = append(index, IndexEntry{ID: id, Name: name})
	return m.store.Set("env:index", index)
}
