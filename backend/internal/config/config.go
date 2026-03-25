package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	DataDir string
	Port    string
}

func Load() *Config {
	dataDir := os.Getenv("APIFORGE_DATA_DIR")
	if dataDir == "" {
		home, _ := os.UserHomeDir()
		dataDir = filepath.Join(home, ".apiforge", "data")
	}
	return &Config{
		DataDir: dataDir,
		Port:    "8484",
	}
}
