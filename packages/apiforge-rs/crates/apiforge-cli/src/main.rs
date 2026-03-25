use clap::{Parser, Subcommand};
use anyhow::Result;

mod commands;

#[derive(Parser)]
#[command(name = "apiforge", version, about = "API client, documentation generator, and test runner", long_about = None, after_help = r#"Quick Start:
  apiforge import ./openapi.json              Import an OpenAPI spec
  apiforge env create prod --base-url https://api.example.com
  apiforge run GET /pets -e prod              Send a request
  apiforge run POST /pets -d '{"name":"Buddy"}' -e prod

Workflows:
  apiforge curl "curl -X GET https://..."     Parse & execute cURL
  apiforge run GET /pets --curl               Export request as cURL
  apiforge generate-spec --src ./src -o spec.json
  apiforge deploy -s ./src -e prod            Generate + upload spec
  apiforge history list                       View request history
  apiforge report -f markdown -o report.md    Generate report

Auth:
  apiforge auth login                         Login to server
  apiforge auth connector-config --search-url <url> --token-url <url>
  apiforge auth search "alice"                Search users
  apiforge auth switch alice@example.com      Switch user identity

Collections:
  apiforge collections list                   List server collections
  apiforge collections push --file spec.json  Upload to server
  apiforge share GET https://api.example.com/pets  Create share link

gRPC:
  apiforge grpc list-services --proto service.proto
  apiforge grpc call MyService/GetItem --proto service.proto --address localhost:50051 -d '{}'

For more details on any command: apiforge <command> --help"#)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Send an HTTP request
    #[command(after_help = "Examples:
  apiforge run GET https://api.example.com/pets
  apiforge run POST https://api.example.com/pets -d '{\"name\":\"Buddy\",\"species\":\"dog\"}'
  apiforge run GET /pets -e prod                    Use environment variables
  apiforge run PUT /pets/1 -H \"Content-Type: application/json\" -d '{\"name\":\"Max\"}'
  apiforge run GET /pets -q \"species=dog\" -q \"limit=10\"
  apiforge run GET /pets --curl                     Export as cURL command
  apiforge run GET /pets --var base_url=http://localhost:3002")]
    Run {
        /// HTTP method (GET, POST, PUT, PATCH, DELETE) or collection path
        method_or_path: String,
        /// URL (when using HTTP method directly)
        url: Option<String>,
        /// Request headers
        #[arg(short = 'H', long = "header", num_args = 1)]
        headers: Vec<String>,
        /// Query parameters
        #[arg(short = 'q', long = "query", num_args = 1)]
        query: Vec<String>,
        /// Request body
        #[arg(short = 'd', long = "body")]
        body: Option<String>,
        /// Environment name
        #[arg(short = 'e', long = "env")]
        env: Option<String>,
        /// Variable overrides (key=value)
        #[arg(long = "var", num_args = 1)]
        vars: Vec<String>,
        /// Export as cURL instead of executing
        #[arg(long = "curl")]
        as_curl: bool,
        /// Verbose output
        #[arg(short = 'v', long = "verbose")]
        verbose: bool,
    },
    /// Parse and execute a cURL command
    #[command(after_help = "Examples:
  apiforge curl \"curl -X GET https://api.example.com/pets\"
  apiforge curl \"curl -X POST https://api.example.com/pets -H 'Content-Type: application/json' -d '{\"name\":\"Buddy\"}'\"
  apiforge curl \"curl https://api.example.com/pets\" --dry-run")]
    Curl {
        /// The cURL command string
        command: String,
        /// Show parsed request without executing
        #[arg(long = "dry-run")]
        dry_run: bool,
    },
    /// Manage environments
    #[command(after_help = "Examples:
  apiforge env list
  apiforge env create staging --base-url https://staging.api.com --set api_key=abc123
  apiforge env set staging timeout_ms 5000
  apiforge env show staging
  apiforge env delete staging

Variables are substituted in URLs, headers, and body using {{variable}} syntax:
  apiforge run GET {{base_url}}/pets -e prod")]
    Env {
        #[command(subcommand)]
        action: EnvAction,
    },
    /// Generate OpenAPI spec from NestJS source
    #[command(after_help = "Examples:
  apiforge generate-spec --src ./src -o openapi.json
  apiforge generate-spec --src ./src -t \"My API\" --version 2.0.0 --server https://api.example.com
  apiforge generate-spec --src ./src -v              Verbose output with counts

Scans NestJS TypeScript source for @Controller, @Get/@Post decorators and DTO classes.
Also detects throw statements for automatic error response documentation.")]
    GenerateSpec {
        /// Source directory
        #[arg(long = "src", default_value = ".")]
        src: String,
        /// Output file
        #[arg(short = 'o', long = "output")]
        output: Option<String>,
        /// API title
        #[arg(short = 't', long = "title", default_value = "API")]
        title: String,
        /// API version
        #[arg(long = "version", default_value = "1.0.0")]
        version: String,
        /// API description
        #[arg(short = 'D', long = "description")]
        description: Option<String>,
        /// Server URLs
        #[arg(long = "server", num_args = 1)]
        servers: Vec<String>,
        /// Verbose output
        #[arg(short = 'v', long = "verbose")]
        verbose: bool,
    },
    /// View request history
    #[command(after_help = "Examples:
  apiforge history list
  apiforge history list -n 50                       Show last 50 requests
  apiforge history clear                            Clear all history")]
    History {
        #[command(subcommand)]
        action: HistoryAction,
    },
    /// gRPC operations
    #[command(after_help = "Examples:
  apiforge grpc list-services --proto service.proto
  apiforge grpc call PetService/GetPet --proto pet.proto --address localhost:50051 -d '{\"id\": 1}'
  apiforge grpc call PetService/ListPets --proto pet.proto --address localhost:50051 -d '{}'")]
    Grpc {
        #[command(subcommand)]
        action: GrpcAction,
    },
    /// Generate a report from request history
    #[command(after_help = "Examples:
  apiforge report                                   Markdown report to stdout
  apiforge report -f json -o report.json            JSON report to file
  apiforge report -f html -o report.html            HTML report with styling
  apiforge report -n 100                            Include last 100 requests")]
    Report {
        /// Report format (markdown, json, html)
        #[arg(short = 'f', long = "format", default_value = "markdown")]
        format: String,
        /// Output file path
        #[arg(short = 'o', long = "output")]
        output: Option<String>,
        /// Maximum number of history entries
        #[arg(short = 'n', long = "limit", default_value = "50")]
        limit: usize,
    },
    /// Take a screenshot of a URL
    #[command(after_help = "Examples:
  apiforge screenshot --url https://example.com -o page.png
  apiforge screenshot --url https://example.com --viewport 1920x1080
  apiforge screenshot --url https://example.com --highlight \".header:blue\" --highlight \"#main:red\"

Requires Chromium. Install with: npx playwright install chromium")]
    Screenshot {
        /// URL to screenshot
        #[arg(long = "url")]
        url: String,
        /// Output file path
        #[arg(short = 'o', long = "output", default_value = "screenshot.png")]
        output: String,
        /// Viewport size (WIDTHxHEIGHT)
        #[arg(long = "viewport", default_value = "1280x720")]
        viewport: String,
        /// CSS selectors to highlight
        #[arg(long = "highlight")]
        highlights: Vec<String>,
    },
    /// Create a shareable link for an API request
    #[command(after_help = "Examples:
  apiforge share GET https://api.example.com/pets
  apiforge share POST https://api.example.com/pets -H \"Content-Type: application/json\" -d '{\"name\":\"Buddy\"}'

Generates a base64-encoded URL that can be opened in APIForge web to load the request.")]
    Share {
        /// HTTP method
        method: String,
        /// URL
        url: String,
        /// Request headers
        #[arg(short = 'H', long = "header")]
        headers: Vec<String>,
        /// Request body
        #[arg(short = 'd', long = "body")]
        body: Option<String>,
    },
    /// Authentication management
    #[command(after_help = "Examples:
  apiforge auth login -u admin -p secret --server https://api.example.com
  apiforge auth register -u newuser -p pass --server https://api.example.com
  apiforge auth status                              Check login status
  apiforge auth whoami                              Show current user
  apiforge auth logout

Connector (impersonate users for testing):
  apiforge auth connector-config --search-url http://localhost:3002/admin/users/search --token-url http://localhost:3002/admin/users/{id}/token
  apiforge auth search \"alice\"                      Search users
  apiforge auth switch alice@example.com            Get token for user
  apiforge auth connector-clear                     Clear connector token")]
    Auth {
        #[command(subcommand)]
        action: AuthAction,
    },
    /// Import an OpenAPI/Postman spec as a collection
    #[command(after_help = "Examples:
  apiforge import ./openapi.json
  apiforge import ./openapi.yaml --name \"My API\"
  apiforge import https://petstore.swagger.io/v2/swagger.json

Supports OpenAPI 3.x (JSON/YAML). Auto-creates environments from spec servers.")]
    Import {
        /// File path or URL to import
        source: String,
        /// Collection name
        #[arg(long = "name")]
        name: Option<String>,
    },
    /// Server-side collection management
    #[command(after_help = "Examples:
  apiforge collections list
  apiforge collections show <id>
  apiforge collections push --file ./openapi.json --name \"Petstore API\"
  apiforge collections pull <id> -o ./downloaded.json
  apiforge collections delete <id>

Requires authentication: apiforge auth login first.")]
    Collections {
        #[command(subcommand)]
        action: CollectionsAction,
    },
    /// Browse imported specs/collections
    #[command(after_help = "Examples:
  apiforge spec list                                List imported specs
  apiforge spec show \"Petstore API\"                 Show spec details")]
    Spec {
        #[command(subcommand)]
        action: SpecAction,
    },
    /// Generate spec and deploy to server
    #[command(after_help = "Examples:
  apiforge deploy -s ./src -e prod
  apiforge deploy -s ./src --base-url https://api.example.com --name \"My API\" -v

Workflow: scans NestJS source -> generates OpenAPI spec -> uploads to server -> syncs environment.
Requires authentication: apiforge auth login first.")]
    Deploy {
        /// NestJS source directory
        #[arg(short = 's', long = "source", default_value = ".")]
        source: String,
        /// Environment name
        #[arg(short = 'e', long = "env")]
        environment: Option<String>,
        /// Override base URL
        #[arg(long = "base-url")]
        base_url: Option<String>,
        /// Collection name
        #[arg(long = "name")]
        name: Option<String>,
        /// Verbose output
        #[arg(short = 'v', long = "verbose")]
        verbose: bool,
    },
}

#[derive(Subcommand)]
pub enum EnvAction {
    /// List all environments
    List,
    /// Show environment details
    Show { name: String },
    /// Create a new environment
    Create {
        name: String,
        #[arg(long = "base-url", default_value = "")]
        base_url: String,
        #[arg(long = "set", num_args = 1)]
        vars: Vec<String>,
    },
    /// Set a variable in an environment
    Set { name: String, key: String, value: String },
    /// Delete an environment
    Delete { name: String },
}

#[derive(Subcommand)]
pub enum GrpcAction {
    /// Call a gRPC method
    Call {
        /// Service and method (e.g., Greeter.SayHello)
        service_method: String,
        /// Path to .proto file
        #[arg(long = "proto")]
        proto: String,
        /// Server address (host:port)
        #[arg(long = "address", default_value = "localhost:50051")]
        address: String,
        /// JSON request data
        #[arg(short = 'd', long = "data")]
        data: Option<String>,
    },
    /// List services in a .proto file
    ListServices {
        /// Path to .proto file
        proto: String,
    },
}

#[derive(Subcommand)]
pub enum HistoryAction {
    /// List recent requests
    List {
        #[arg(short = 'n', long = "limit", default_value = "20")]
        limit: usize,
    },
    /// Clear all history
    Clear,
}

#[derive(Subcommand)]
pub enum AuthAction {
    /// Login to APIForge server
    Login {
        /// Username
        #[arg(short = 'u', long = "username")]
        username: String,
        /// Password
        #[arg(short = 'p', long = "password")]
        password: String,
        /// Server URL
        #[arg(long = "server")]
        server: Option<String>,
    },
    /// Register a new account
    Register {
        /// Username
        #[arg(short = 'u', long = "username")]
        username: String,
        /// Password
        #[arg(short = 'p', long = "password")]
        password: String,
        /// Server URL
        #[arg(long = "server")]
        server: Option<String>,
    },
    /// Clear saved credentials
    Logout,
    /// Show current auth status
    Status,
    /// Show current connector user
    Whoami,
    /// Configure auth connector URLs
    ConnectorConfig {
        /// Connector search URL
        #[arg(long = "search-url")]
        search_url: Option<String>,
        /// Connector token URL
        #[arg(long = "token-url")]
        token_url: Option<String>,
    },
    /// Search users via connector
    Search {
        /// Search query
        query: String,
    },
    /// Switch user via connector
    Switch {
        /// User email
        email: String,
    },
    /// Clear connector token
    ConnectorClear,
}

#[derive(Subcommand)]
pub enum CollectionsAction {
    /// List saved collections on server
    List,
    /// Show collection detail
    Show {
        /// Collection ID
        id: String,
    },
    /// Upload local spec file to server
    Push {
        /// Spec file path
        #[arg(long = "file")]
        file: String,
        /// Collection name
        #[arg(long = "name")]
        name: Option<String>,
    },
    /// Download collection to local file
    Pull {
        /// Collection ID
        id: String,
        /// Output file path
        #[arg(short = 'o', long = "output")]
        output: Option<String>,
    },
    /// Delete a collection
    Delete {
        /// Collection ID
        id: String,
    },
}

#[derive(Subcommand)]
pub enum SpecAction {
    /// List imported specs/collections
    List,
    /// Show endpoints in a collection
    Show {
        /// Collection name
        name: String,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { method_or_path, url, headers, query, body, env, vars, as_curl, verbose } => {
            commands::run::execute(method_or_path, url, headers, query, body, env, vars, as_curl, verbose).await
        }
        Commands::Curl { command, dry_run } => {
            commands::curl::execute(command, dry_run).await
        }
        Commands::Env { action } => {
            commands::env::execute(action)
        }
        Commands::GenerateSpec { src, output, title, version, description, servers, verbose } => {
            commands::generate_spec::execute(src, output, title, version, description, servers, verbose)
        }
        Commands::History { action } => {
            commands::run::handle_history(action)
        }
        Commands::Grpc { action } => {
            commands::grpc::execute(action).await
        }
        Commands::Report { format, output, limit } => {
            commands::report::execute(format, output, limit)
        }
        Commands::Screenshot { url, output, viewport, highlights } => {
            commands::screenshot::execute(url, output, viewport, highlights)
        }
        Commands::Share { method, url, headers, body } => {
            commands::share::execute(method, url, headers, body)
        }
        Commands::Auth { action } => {
            commands::auth::execute(action).await
        }
        Commands::Import { source, name } => {
            commands::import::execute(source, name).await
        }
        Commands::Collections { action } => {
            commands::collections::execute(action).await
        }
        Commands::Spec { action } => {
            commands::spec::execute(action)
        }
        Commands::Deploy { source, environment, base_url, name, verbose } => {
            commands::deploy::execute(source, environment, base_url, name, verbose).await
        }
    }
}
