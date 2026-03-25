package main

import (
	"fmt"
	"os"

	"github.com/AgentDawn/apiforge/internal/api"
	"github.com/AgentDawn/apiforge/internal/collection"
	"github.com/AgentDawn/apiforge/internal/config"
	"github.com/AgentDawn/apiforge/internal/environment"
	"github.com/AgentDawn/apiforge/internal/storage"
)

func main() {
	if len(os.Args) < 2 {
		printHelp()
		os.Exit(0)
	}

	cfg := config.Load()
	store := storage.NewFileStorage(cfg.DataDir)
	colManager := collection.NewManager(store)
	envManager := environment.NewManager(store)

	switch os.Args[1] {
	case "serve":
		port := "8484"
		if len(os.Args) > 2 {
			port = os.Args[2]
		}
		webDir := os.Getenv("APIFORGE_WEB_DIR")
		if webDir == "" && len(os.Args) > 3 {
			webDir = os.Args[3]
		}
		server := api.NewServer(colManager, envManager, store, webDir)
		fmt.Printf("APIForge server starting on http://localhost:%s\n", port)
t	if webDir != "" {
			fmt.Printf("Serving web UI from: %s
", webDir)
		}
		if err := server.Start(":" + port); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}

	case "env":
		if len(os.Args) < 3 {
			fmt.Println("Usage: apiforge env <list|create|show|set|use|delete>")
			os.Exit(1)
		}
		handleEnvCommand(os.Args[2:], envManager)

	case "collection":
		if len(os.Args) < 3 {
			fmt.Println("Usage: apiforge collection <list|show|delete>")
			os.Exit(1)
		}
		handleCollectionCommand(os.Args[2:], colManager)

	case "version":
		fmt.Println("apiforge 0.1.0")

	case "help", "-h", "--help":
		printHelp()

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printHelp()
		os.Exit(1)
	}
}

func handleEnvCommand(args []string, mgr *environment.Manager) {
	switch args[0] {
	case "list":
		envs, err := mgr.List()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if len(envs) == 0 {
			fmt.Println("No environments.")
			return
		}
		activeID, _ := mgr.GetActiveID()
		for _, e := range envs {
			marker := ""
			if e.ID == activeID {
				marker = " (active)"
			}
			fmt.Printf("  %s%s\n", e.Name, marker)
		}

	case "create":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge env create <name> [--set key=value ...]")
			os.Exit(1)
		}
		name := args[1]
		vars := parseSetFlags(args[2:])
		env, err := mgr.Create(name, vars)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Created environment: %s (%s)\n", env.Name, env.ID)

	case "show":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge env show <name>")
			os.Exit(1)
		}
		env, err := mgr.GetByName(args[1])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Environment: %s\n", env.Name)
		for _, v := range env.Variables {
			fmt.Printf("  %s = %s\n", v.Key, v.Value)
		}

	case "use":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge env use <name>")
			os.Exit(1)
		}
		env, err := mgr.GetByName(args[1])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if err := mgr.SetActive(env.ID); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Active environment: %s\n", env.Name)

	case "delete":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge env delete <name>")
			os.Exit(1)
		}
		env, err := mgr.GetByName(args[1])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if err := mgr.Delete(env.ID); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Deleted environment: %s\n", env.Name)

	default:
		fmt.Println("Usage: apiforge env <list|create|show|set|use|delete>")
		os.Exit(1)
	}
}

func handleCollectionCommand(args []string, mgr *collection.Manager) {
	switch args[0] {
	case "list":
		cols, err := mgr.List()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if len(cols) == 0 {
			fmt.Println("No collections.")
			return
		}
		for _, c := range cols {
			fmt.Printf("  %s\n", c.Name)
		}

	case "show":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge collection show <name>")
			os.Exit(1)
		}
		col, err := mgr.GetByName(args[1])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("%s (v%s)\n", col.Name, col.Version)
		for _, item := range col.Items {
			if item.Type == "folder" {
				fmt.Printf("  [%s]\n", item.Name)
				for _, req := range item.Items {
					if req.Request != nil {
						fmt.Printf("    %-7s %s\n", req.Request.Method, req.Request.Name)
					}
				}
			}
		}

	case "delete":
		if len(args) < 2 {
			fmt.Println("Usage: apiforge collection delete <name>")
			os.Exit(1)
		}
		col, err := mgr.GetByName(args[1])
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		if err := mgr.Delete(col.ID); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Deleted: %s\n", col.Name)

	default:
		fmt.Println("Usage: apiforge collection <list|show|delete>")
		os.Exit(1)
	}
}

func parseSetFlags(args []string) map[string]string {
	vars := make(map[string]string)
	for i := 0; i < len(args); i++ {
		if args[i] == "--set" && i+1 < len(args) {
			kv := args[i+1]
			for j := 0; j < len(kv); j++ {
				if kv[j] == '=' {
					vars[kv[:j]] = kv[j+1:]
					break
				}
			}
			i++
		}
	}
	return vars
}

func printHelp() {
	fmt.Println(`apiforge - Open-source API client, docs generator, and test runner

USAGE:
  apiforge <command> [options]

COMMANDS:
  serve [port] [webDir]    Start API server (default: 8484) with optional web UI dir
  env <subcommand>         Manage environments
  collection <subcommand>  Manage collections
  version                  Show version
  help                     Show this help`)
}
