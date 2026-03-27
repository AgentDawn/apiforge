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

## Get Started

### 1. Start the Server

```bash
docker compose pull && docker compose up
```

This starts the database (rqlite), backend server (:8090), and web UI (:3000).

### 2. Open the Client

Choose one:

- **Web**: Open http://localhost:3000
- **Desktop**: Download from [GitHub Releases](https://github.com/agentdawn/apiforge/releases) (Windows `.msi`, macOS `.dmg`, Linux `.AppImage`)

  > **macOS**: 다운로드 후 "손상되었기 때문에 열 수 없습니다" 메시지가 나타나면, 터미널에서 아래 명령어를 실행하세요:
  > ```bash
  > xattr -cr /Applications/APIForge.app
  > ```
  > 이 앱은 오픈소스이며 Apple Developer 인증서로 서명되지 않아 macOS Gatekeeper가 차단합니다.

  > **Windows**: "Windows가 PC를 보호했습니다" 경고가 나타나면 "추가 정보" → "실행"을 클릭하세요. 이 앱은 오픈소스이며 코드 서명 인증서가 없어 SmartScreen이 차단합니다.
- **CLI**: Download the binary from [GitHub Releases](https://github.com/agentdawn/apiforge/releases) or build from source:
  ```bash
  cd packages/apiforge-rs && cargo build --release
  ```

### 3. Connect and Login

On first launch, the onboarding screen asks for:

1. **Server URL** (e.g. `http://localhost:8090`)
2. **Admin setup** (if the server is fresh) or **Login** (if already initialized)

For CLI:

```bash
apiforge auth server http://localhost:8090
apiforge auth login -u admin -p secret
```

### 4. Import a Spec and Start Testing

```bash
# Import an OpenAPI spec
apiforge import ./openapi.json

# Create an environment
apiforge env create prod --base-url https://api.example.com

# Send requests
apiforge run GET /pets -e prod
apiforge run POST /pets -d '{"name":"Buddy"}' -e prod

# Export as cURL
apiforge run GET /pets -e prod --curl
```

Or in the web/desktop UI: click **Open File** to import a spec, then browse endpoints and click **Try it**.

## CLI Commands

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
| `auth` | Authentication (login, register, server, connector, search, switch) |
| `import` | Import OpenAPI/Postman specs as collections |
| `collections` | Server-side collection management (list, push, pull, delete) |
| `spec` | Browse imported specs/collections |
| `deploy` | Generate spec from source and deploy to server |

Run `apiforge help` for a full guide, or `apiforge help <command>` for command-specific examples.

## NestJS Integration

Use `@apiforge/nestjs` as a drop-in replacement for `@nestjs/swagger`:

```bash
npm install @apiforge/nestjs
```

Generate and deploy specs from source:

```bash
apiforge generate-spec --src ./src -o openapi.json
apiforge deploy -s ./src -e prod
```

## Docker Images

Pre-built images on GitHub Container Registry:

```bash
docker pull ghcr.io/agentdawn/apiforge/server:latest
docker pull ghcr.io/agentdawn/apiforge/web:latest
```

Or use `docker compose` to run everything together:

```bash
docker compose pull && docker compose up
```

## Environment Variables

Substitute variables using `{{variable}}` syntax:

```bash
apiforge env create prod --base-url https://api.example.com --set api_key=abc123
apiforge run GET {{base_url}}/pets -H "Authorization: Bearer {{api_key}}" -e prod
apiforge run GET /pets -e prod --var api_key=xyz789
```

## Authentication

| Type | Description |
|------|-------------|
| Bearer Token | `Authorization: Bearer <token>` |
| Basic Auth | `Authorization: Basic <base64>` |
| API Key | Custom header, query parameter, or cookie |
| Connector | Impersonate users via search + token endpoints |

Connector setup for multi-tenant testing:

```bash
apiforge auth connector-config \
  --search-url http://localhost:3002/admin/users/search \
  --token-url http://localhost:3002/admin/users/{id}/token

apiforge auth search "alice"
apiforge auth switch alice@example.com
```

## Running Tests

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
│   ├── web/                 # Vanilla JS SPA + Playwright tests
│   ├── server/              # Go backend (rqlite database)
│   ├── desktop/             # Tauri desktop app
│   ├── nestjs/              # @apiforge/nestjs decorators
│   └── npm/                 # npm CLI distribution wrapper
├── examples/
│   ├── nestjs-sample/       # NestJS example project
│   └── auth-connector-sample/ # Auth connector example server
└── docker-compose.yml       # Full stack deployment
```

## Architecture

APIForge is a polyglot monorepo:

- **CLI**: Rust (cross-platform binaries)
- **Server**: Go (HTTP backend + rqlite)
- **Web**: Vanilla JavaScript SPA (no frameworks)
- **Desktop**: Tauri (Rust + WebView)
- **NestJS Package**: TypeScript (framework integration)

## Development

### Prerequisites

- Node.js >= 18.3.0
- Rust (for CLI and desktop)
- Go (for server)
- Docker (for deployment)

### Local Development

```bash
# Web UI (dev server with hot reload)
cd packages/web && npm install && node dev-server.mjs

# Rust CLI
cd packages/apiforge-rs && cargo build --release

# Desktop app
cd packages/desktop && npm install && npx tauri build
```

## License

MIT

## Contributing

Contributions welcome. Please ensure all tests pass and commits are descriptive.

Report issues at [GitHub Issues](https://github.com/agentdawn/apiforge/issues).
