package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type Storage interface {
	Get(key string, dest interface{}) error
	Set(key string, value interface{}) error
	Delete(key string) error
	List(prefix string) ([]string, error)
	Has(key string) bool
}

// FileStorage stores each key as a separate JSON file.
type FileStorage struct {
	dir string
}

func NewFileStorage(dir string) *FileStorage {
	return &FileStorage{dir: dir}
}

func (fs *FileStorage) ensureDir() error {
	return os.MkdirAll(fs.dir, 0755)
}

func (fs *FileStorage) keyToPath(key string) string {
	safe := strings.NewReplacer("/", "_", "\\", "_", " ", "_").Replace(key)
	return filepath.Join(fs.dir, safe+".json")
}

func (fs *FileStorage) Get(key string, dest interface{}) error {
	path := fs.keyToPath(key)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("not found: %s", key)
		}
		return err
	}
	return json.Unmarshal(data, dest)
}

func (fs *FileStorage) Set(key string, value interface{}) error {
	if err := fs.ensureDir(); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(fs.keyToPath(key), data, 0644)
}

func (fs *FileStorage) Delete(key string) error {
	path := fs.keyToPath(key)
	err := os.Remove(path)
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (fs *FileStorage) List(prefix string) ([]string, error) {
	if err := fs.ensureDir(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(fs.dir)
	if err != nil {
		return nil, err
	}
	var keys []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			key := strings.TrimSuffix(entry.Name(), ".json")
			if strings.HasPrefix(key, prefix) {
				keys = append(keys, key)
			}
		}
	}
	return keys, nil
}

func (fs *FileStorage) Has(key string) bool {
	_, err := os.Stat(fs.keyToPath(key))
	return err == nil
}
