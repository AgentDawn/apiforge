# APIForge

Open-source API client, documentation generator, and test runner. Postman/Swagger alternative.

## Features

- **API Client**: Send HTTP, gRPC, and FlatBuffers requests
- **API Documentation Viewer**: Docs-first UX with request/response insights
- **OpenAPI Spec Generation**: Auto-generate from NestJS source code using Rust-powered scanner
- **CLI with 14 Commands**: Powerful command-line interface for automation
- **Desktop Application**: Native apps for Windows (.msi), macOS (.dmg), and Linux (.AppImage)
- **Multiple Themes**: Dark, Light, and Midnight color schemes
- **Environment Variables**: Substitute variables in requests using `{{variable}}` syntax
- **Authentication**: Support for Bearer, Basic Auth, API Key, and Connector-based auth
- **Collections Management**: Import, organize, and manage API collections
- **Request History**: Track and replay past requests
- **cURL Import/Export**: Convert between cURL commands and structured requests
- **Shareable Links**: Generate base64-encoded links to share requests
- **Comprehensive Testing**: 370+ Playwright e2e tests

## Quick Start - Docker

Deploy the full stack (server, web, database) in seconds:

```bash
docker compose pull && docker compose up
```

Open http://localhost:3000 in your browser. On first run, create an admin account.

## Quick Start - CLI

Install the CLI from [GitHub Releases](https://github.com/agentdawn/apiforge/releases) or build from source:

```bash
cd packages/apiforge-rs
cargo build --release
```

Basic workflow:

```bash
# Configure server and login
apiforge auth server http://localhost:8090
apiforge auth login -u admin -p secret

# Import an API spec
apiforge import ./openapi.json

# Create an environment
apiforge env create prod --base-url https://api.example.com

# Send a request
apiforge run GET /pets -e prod
apiforge run POST /pets -d '{"name":"Buddy"}' -e prod

# Export as cURL
apiforge run GET /pets -e prod --curl

# Generate OpenAPI spec from NestJS source
apiforge generate-spec --src ./src -o spec.json

# Push spec to server
apiforge collections push --file ./openapi.json --name "My API"

# View request history
apiforge history list

# Generate a report
apiforge report -f markdown -o report.md
```

## CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `run` | Send HTTP requests (GET, POST, PUT, PATCH, DELETE) |
| `curl` | Parse and execute cURL commands |
| `env` | Manage environments (list, create, set, show, delete) |
| `generate-spec` | Generate OpenAPI spec from NestJS source |
| `history` | View and manage request history |
| `grpc` | Call gRPC services (list-services, call) |
| `report` | Generate reports from request history (markdown, json, html) |
| `screenshot` | Take screenshots of URLs with optional highlights |
| `share` | Create shareable links for API requests |
| `auth` | Authentication (login, register, status, whoami, logout, connector) |
| `import` | Import OpenAPI/Postman specs as collections |
| `collections` | Server-side collection management (list, push, pull, delete) |
| `spec` | Browse imported specs/collections |
| `deploy` | Generate spec from source and deploy to server |

## Quick Start - Web App

Develop the web UI locally:

```bash
cd packages/web
npm install
node dev-server.mjs
```

Open http://localhost:3000. The dev server includes hot reload.

## Quick Start - Desktop App

Download pre-built binaries from [GitHub Releases](https://github.com/agentdawn/apiforge/releases):

- **Windows**: `APIForge-windows.msi` or `.exe`
- **macOS**: `APIForge-macos.dmg`
- **Linux**: `APIForge-linux.AppImage` or `.deb`

Or build from source:

```bash
cd packages/desktop
npm install
npx tauri build
```

## NestJS Integration

Use the `@apiforge/nestjs` package as a drop-in replacement for `@nestjs/swagger`:

```bash
npm install @apiforge/nestjs
```

Decorate your NestJS controllers and generate OpenAPI specs automatically:

```bash
apiforge generate-spec --src ./src -o openapi.json
apiforge deploy -s ./src -e prod
```

## Docker Images

Pre-built images are available on GitHub Container Registry:

```bash
# Web UI
docker pull ghcr.io/agentdawn/apiforge/web:latest

# Backend server
docker pull ghcr.io/agentdawn/apiforge/server:latest
```

Or use `docker compose` to run both together with the database.

## Running Tests

Run the full test suite:

```bash
# Web e2e tests (Playwright)
cd packages/web
npm install
npx playwright install --with-deps chromium
npx playwright test

# Rust CLI tests
cd packages/apiforge-rs
cargo test
```

## Project Structure

```
apiforge/
├── packages/
│   ├── apiforge-rs/         # Rust CLI (14 commands)
│   │   └── crates/apiforge-cli/
│   ├── web/                 # Vanilla JS SPA with Playwright tests
│   ├── server/              # Go backend (HTTP + gRPC)
│   ├── desktop/             # Tauri desktop app (Windows, macOS, Linux)
│   ├── nestjs/              # @apiforge/nestjs decorators package
│   ├── npm/                 # npm CLI distribution wrapper
│   ├── cli/                 # Legacy Node.js CLI (deprecated)
│   ├── core/                # Legacy Node.js core (deprecated)
│   └── spec-generator/      # Legacy Rust spec generator (merged into apiforge-rs)
├── examples/
│   ├── nestjs-sample/       # Complete NestJS example project
│   └── auth-connector-sample/ # Auth connector configuration example
├── backend/                 # Alternative Go backend
└── docker-compose.yml       # Full stack deployment (server, web, database)
```

## Architecture

APIForge is a polyglot monorepo:

- **CLI**: Rust (high-performance, cross-platform binaries)
- **Server**: Go (HTTP/gRPC backend, lightweight)
- **Web**: Vanilla JavaScript SPA (no frameworks, minimal dependencies)
- **Desktop**: Tauri (Rust + WebView, native apps)
- **NestJS Package**: TypeScript (framework integration)

## Environment Variables

Substitute variables in requests using `{{variable}}` syntax:

```bash
# Create environment with variables
apiforge env create prod --base-url https://api.example.com --set api_key=abc123

# Reference variables in requests
apiforge run GET {{base_url}}/pets -H "Authorization: Bearer {{api_key}}" -e prod

# Override variables per-request
apiforge run GET /pets -e prod --var api_key=xyz789
```

## Authentication Types

- **Bearer Token**: `Authorization: Bearer <token>`
- **Basic Auth**: `Authorization: Basic <base64>`
- **API Key**: Custom header or query parameter
- **Connector**: Impersonate users for testing via search + token endpoints

Configure connectors for multi-tenant testing:

```bash
apiforge auth connector-config \
  --search-url http://localhost:3002/admin/users/search \
  --token-url http://localhost:3002/admin/users/{id}/token

apiforge auth search "alice"
apiforge auth switch alice@example.com
```

## Supported Spec Formats

- **OpenAPI 3.x**: JSON or YAML format
- **Postman Collections**: JSON format
- **NestJS Source**: Automatic generation from TypeScript decorators

Import via URL or local file:

```bash
apiforge import ./openapi.json
apiforge import https://petstore.swagger.io/v2/swagger.json --name "Petstore"
```

## Development

### Prerequisites

- Node.js >= 18.3.0
- Rust (for CLI and desktop)
- Go (for server)
- Docker (optional, for easy deployment)

### Setup

```bash
# Install web dependencies
cd packages/web && npm install

# Build Rust CLI
cd packages/apiforge-rs && cargo build --release

# Build desktop app
cd packages/desktop && npm install && npx tauri build
```

### Code Quality

```bash
# Lint JavaScript
npm run lint

# Format code
npm run format
```

## License

MIT - See LICENSE file for details.

## Contributing

Contributions are welcome. Please ensure:

- All tests pass locally
- Code follows the project style
- Commits are descriptive

## Community

Report issues and request features on [GitHub Issues](https://github.com/agentdawn/apiforge/issues).
