import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const AUTH_FILE = 'auth.json';
const CONNECTOR_CONFIG_FILE = 'connector.json';
const CONNECTOR_TOKEN_FILE = 'connector-token.json';

function getAuthPath(dataDir) {
  return join(dataDir, AUTH_FILE);
}

function getConnectorConfigPath(dataDir) {
  return join(dataDir, CONNECTOR_CONFIG_FILE);
}

function getConnectorTokenPath(dataDir) {
  return join(dataDir, CONNECTOR_TOKEN_FILE);
}

/** Load connector config */
export function loadConnectorConfig(dataDir) {
  const p = getConnectorConfigPath(dataDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** Load connector token */
export function loadConnectorToken(dataDir) {
  const p = getConnectorTokenPath(dataDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

/** Read saved auth state (token + user) */
export function loadAuth(dataDir) {
  const authPath = getAuthPath(dataDir);
  if (!existsSync(authPath)) return null;
  try {
    return JSON.parse(readFileSync(authPath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Save auth state to disk */
function saveAuth(dataDir, authData) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(getAuthPath(dataDir), JSON.stringify(authData, null, 2));
}

/** Clear auth state */
function clearAuth(dataDir) {
  const authPath = getAuthPath(dataDir);
  if (existsSync(authPath)) unlinkSync(authPath);
}

/** Get the server URL from env or default */
export function getServerUrl(dataDir) {
  const auth = loadAuth(dataDir);
  return process.env.APIFORGE_SERVER || auth?.server || 'http://localhost:8090';
}

/**
 * Get the Bearer token: APIFORGE_TOKEN env > connector token > saved auth token
 */
export function getToken(dataDir) {
  if (process.env.APIFORGE_TOKEN) return process.env.APIFORGE_TOKEN;
  const connectorToken = loadConnectorToken(dataDir);
  if (connectorToken?.token) return connectorToken.token;
  const auth = loadAuth(dataDir);
  return auth?.token || null;
}

/**
 * Make an authenticated fetch to the server.
 * Priority: APIFORGE_TOKEN env var > saved JWT token
 */
export async function serverFetch(dataDir, path, options = {}) {
  const server = getServerUrl(dataDir);
  const url = server.replace(/\/$/, '') + path;
  const token = getToken(dataDir);

  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }

  const resp = await fetch(url, { ...options, headers });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  return { status: resp.status, ok: resp.ok, data };
}

export async function authCommand(args, dataDir) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help') {
    console.log(`
apiforge auth - Authentication management

USAGE:
  apiforge auth <subcommand> [options]

SUBCOMMANDS:
  login                 Login to APIForge server
  register              Register a new account
  logout                Clear saved credentials
  status                Show current auth status
  token <action>        Manage API tokens (for CI/CD)
  connector-config      Configure auth connector URLs
  search <query>        Search users via connector
  switch <email>        Switch user via connector (search + get token)
  whoami                Show current connector user
  connector-clear       Clear connector token

TOKEN ACTIONS:
  token create          Create a new API token
  token list            List issued tokens
  token revoke <id>     Revoke a token

OPTIONS:
  --server <url>        Server URL (default: http://localhost:8090)
  -u, --username <name> Username
  -p, --password <pass> Password
  --name <name>         Token name (for token create)
  --expires <days>      Token expiry in days (0 = never, for token create)
  --search-url <url>    Connector search URL (for connector-config)
  --token-url <url>     Connector token URL (for connector-config)

ENVIRONMENT VARIABLES:
  APIFORGE_TOKEN        API token for CI/CD (skips login)
  APIFORGE_SERVER       Server URL override

EXAMPLES:
  apiforge auth login -u admin -p secret123
  apiforge auth register -u newuser -p mypassword --server https://api.example.com
  apiforge auth token create --name "GitHub Actions" --expires 90
  apiforge auth token list
  apiforge auth token revoke abc123
  apiforge auth status
  apiforge auth logout
  apiforge auth connector-config --search-url http://localhost:3002/admin/users/search --token-url http://localhost:3002/admin/users/{id}/token
  apiforge auth search "user@test"
  apiforge auth switch user@test.com
  apiforge auth whoami
  apiforge auth connector-clear

CI/CD USAGE:
  export APIFORGE_TOKEN=afk_xxxx
  export APIFORGE_SERVER=https://api.example.com
  apiforge collections list
`);
    return;
  }

  switch (subcommand) {
    case 'login':
      await loginFlow(args.slice(1), dataDir);
      break;
    case 'register':
      await registerFlow(args.slice(1), dataDir);
      break;
    case 'logout':
      clearAuth(dataDir);
      console.log('Logged out. Auth credentials cleared.');
      break;
    case 'status':
      statusFlow(dataDir);
      break;
    case 'token':
      await tokenFlow(args.slice(1), dataDir);
      break;
    case 'connector-config':
      await connectorConfigCommand(args.slice(1), dataDir);
      break;
    case 'search':
      await connectorSearchCommand(args.slice(1), dataDir);
      break;
    case 'switch':
      await connectorSwitchCommand(args.slice(1), dataDir);
      break;
    case 'whoami':
      await connectorWhoamiCommand(args.slice(1), dataDir);
      break;
    case 'connector-clear':
      connectorClearCommand(args.slice(1), dataDir);
      break;
    default:
      console.error(`Unknown auth subcommand: ${subcommand}`);
      process.exit(1);
  }
}

async function loginFlow(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      username: { type: 'string', short: 'u' },
      password: { type: 'string', short: 'p' },
      server: { type: 'string' },
    },
  });

  const username = values.username;
  const password = values.password;
  const server = values.server || getServerUrl(dataDir);

  if (!username || !password) {
    console.error('Error: --username and --password are required');
    console.error('Usage: apiforge auth login -u <username> -p <password>');
    process.exit(1);
  }

  console.log(`Logging in to ${server}...`);

  try {
    const resp = await fetch(server.replace(/\/$/, '') + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error(`Login failed: ${data.error || resp.statusText}`);
      process.exit(1);
    }

    saveAuth(dataDir, { token: data.token, user: data.user, server });
    console.log(`Logged in as ${data.user.username}`);
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }
}

async function registerFlow(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      username: { type: 'string', short: 'u' },
      password: { type: 'string', short: 'p' },
      server: { type: 'string' },
    },
  });

  const username = values.username;
  const password = values.password;
  const server = values.server || getServerUrl(dataDir);

  if (!username || !password) {
    console.error('Error: --username and --password are required');
    console.error('Usage: apiforge auth register -u <username> -p <password>');
    process.exit(1);
  }

  if (password.length < 6) {
    console.error('Error: password must be at least 6 characters');
    process.exit(1);
  }

  console.log(`Registering on ${server}...`);

  try {
    const resp = await fetch(server.replace(/\/$/, '') + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error(`Registration failed: ${data.error || resp.statusText}`);
      process.exit(1);
    }

    saveAuth(dataDir, { token: data.token, user: data.user, server });
    console.log(`Registered and logged in as ${data.user.username}`);
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }
}

function statusFlow(dataDir) {
  const envToken = process.env.APIFORGE_TOKEN;
  if (envToken) {
    console.log(`Auth: APIFORGE_TOKEN environment variable (${envToken.slice(0, 12)}...)`);
    console.log(`Server: ${getServerUrl(dataDir)}`);
    return;
  }

  const auth = loadAuth(dataDir);
  if (!auth || !auth.token) {
    console.log('Not logged in.');
    return;
  }
  console.log(`Logged in as: ${auth.user?.username || 'unknown'}`);
  console.log(`Server: ${auth.server || 'http://localhost:8090'}`);
}

// ─── Token Management ────────────────────────────────────

async function tokenFlow(args, dataDir) {
  const action = args[0];

  if (!action || action === '--help') {
    console.log(`
apiforge auth token - API token management for CI/CD

ACTIONS:
  create    Create a new API token
  list      List your API tokens
  revoke    Revoke (delete) a token

EXAMPLES:
  apiforge auth token create --name "CI Pipeline" --expires 90
  apiforge auth token list
  apiforge auth token revoke <token-id>
`);
    return;
  }

  switch (action) {
    case 'create':
      await tokenCreate(args.slice(1), dataDir);
      break;
    case 'list':
      await tokenList(dataDir);
      break;
    case 'revoke':
      await tokenRevoke(args.slice(1), dataDir);
      break;
    default:
      console.error(`Unknown token action: ${action}`);
      process.exit(1);
  }
}

async function tokenCreate(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      expires: { type: 'string' },
    },
  });

  if (!values.name) {
    console.error('Error: --name is required');
    console.error('Usage: apiforge auth token create --name "CI Pipeline" --expires 90');
    process.exit(1);
  }

  const expiresInDays = values.expires ? parseInt(values.expires, 10) : 0;

  const { ok, data } = await serverFetch(dataDir, '/api/tokens', {
    method: 'POST',
    body: JSON.stringify({ name: values.name, expiresInDays }),
  });

  if (!ok) {
    console.error(`Failed to create token: ${data?.error || 'Unknown error'}`);
    process.exit(1);
  }

  console.log('\nAPI Token created successfully!\n');
  console.log(`  Name:    ${data.apiToken.name}`);
  console.log(`  ID:      ${data.apiToken.id}`);
  console.log(`  Prefix:  ${data.apiToken.prefix}`);
  console.log(`  Expires: ${data.apiToken.expires_at || 'never'}`);
  console.log(`\n  Token: ${data.token}\n`);
  console.log('  Save this token now — it will not be shown again.');
  console.log('\n  Usage in CI:');
  console.log(`    export APIFORGE_TOKEN=${data.token}`);
  console.log('    apiforge collections list');
}

async function tokenList(dataDir) {
  const { ok, data } = await serverFetch(dataDir, '/api/tokens');

  if (!ok) {
    console.error(`Failed to list tokens: ${data?.error || 'Unknown error'}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No API tokens found.');
    return;
  }

  console.log(`\n  ${data.length} API token(s):\n`);
  for (const t of data) {
    const expires = t.expires_at || 'never';
    const lastUsed = t.last_used_at || 'never';
    console.log(`  ${t.prefix}...  ${t.name.padEnd(24)} expires: ${expires}  last used: ${lastUsed}  id: ${t.id}`);
  }
  console.log();
}

async function tokenRevoke(args, dataDir) {
  const id = args[0];
  if (!id) {
    console.error('Error: token ID is required');
    console.error('Usage: apiforge auth token revoke <token-id>');
    process.exit(1);
  }

  const { ok, data } = await serverFetch(dataDir, `/api/tokens/${id}`, {
    method: 'DELETE',
  });

  if (!ok) {
    console.error(`Failed to revoke token: ${data?.error || 'Not found'}`);
    process.exit(1);
  }

  console.log(`Token ${id} revoked.`);
}

// ─── Auth Connector ──────────────────────────────────────

export async function connectorConfigCommand(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      'search-url': { type: 'string' },
      'token-url': { type: 'string' },
    },
  });

  const searchUrl = values['search-url'];
  const tokenUrl = values['token-url'];

  if (!searchUrl && !tokenUrl) {
    // Show current config
    const config = loadConnectorConfig(dataDir);
    if (!config) {
      console.log('No connector configured.');
      console.log('Usage: apiforge auth connector-config --search-url <url> --token-url <url>');
      return;
    }
    console.log('Connector config:');
    console.log(`  Search URL: ${config.searchUrl}`);
    console.log(`  Token URL:  ${config.tokenUrl}`);
    return;
  }

  if (!searchUrl || !tokenUrl) {
    console.error('Error: both --search-url and --token-url are required');
    process.exit(1);
  }

  mkdirSync(dataDir, { recursive: true });
  const config = { searchUrl, tokenUrl };
  writeFileSync(getConnectorConfigPath(dataDir), JSON.stringify(config, null, 2));
  console.log('Connector configured:');
  console.log(`  Search URL: ${searchUrl}`);
  console.log(`  Token URL:  ${tokenUrl}`);
}

export async function connectorSearchCommand(args, dataDir) {
  const query = args[0];
  if (!query) {
    console.error('Usage: apiforge auth search <query>');
    process.exit(1);
  }

  const config = loadConnectorConfig(dataDir);
  if (!config) {
    console.error('Error: connector not configured. Run: apiforge auth connector-config --search-url <url> --token-url <url>');
    process.exit(1);
  }

  const users = await connectorSearch(config.searchUrl, query);
  printUsersTable(users);
  return users;
}

export async function connectorSwitchCommand(args, dataDir) {
  const email = args[0];
  if (!email) {
    console.error('Usage: apiforge auth switch <email>');
    process.exit(1);
  }

  const config = loadConnectorConfig(dataDir);
  if (!config) {
    console.error('Error: connector not configured. Run: apiforge auth connector-config --search-url <url> --token-url <url>');
    process.exit(1);
  }

  // Search for the user
  const users = await connectorSearch(config.searchUrl, email);
  const user = users.find(u => u.email === email);
  if (!user) {
    console.error(`User not found: ${email}`);
    if (users.length > 0) {
      console.log('Did you mean one of these?');
      printUsersTable(users);
    }
    process.exit(1);
  }

  // Get token for the user
  const tokenUrl = config.tokenUrl.replace('{id}', user.id);
  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Failed to get token: ${resp.status} ${text}`);
      process.exit(1);
    }

    const data = await resp.json();
    const tokenData = {
      token: data.token || data.access_token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(getConnectorTokenPath(dataDir), JSON.stringify(tokenData, null, 2));
    console.log(`Authenticated as ${email} (token saved)`);
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }
}

export async function connectorWhoamiCommand(_args, dataDir) {
  const tokenData = loadConnectorToken(dataDir);
  if (!tokenData) {
    console.log('No connector user. Use: apiforge auth switch <email>');
    return;
  }
  console.log(`Connector user: ${tokenData.user?.email || 'unknown'}`);
  if (tokenData.user?.name) console.log(`  Name: ${tokenData.user.name}`);
  if (tokenData.user?.role) console.log(`  Role: ${tokenData.user.role}`);
}

export function connectorClearCommand(_args, dataDir) {
  const p = getConnectorTokenPath(dataDir);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log('Connector token cleared.');
  } else {
    console.log('No connector token to clear.');
  }
}

/** Search users via connector */
async function connectorSearch(searchUrl, query) {
  try {
    const resp = await fetch(searchUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`Search failed: ${resp.status} ${text}`);
      process.exit(1);
    }

    const data = await resp.json();
    return Array.isArray(data) ? data : data.users || data.results || [];
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exit(1);
  }
}

/** Print users as a formatted table */
function printUsersTable(users) {
  if (!users || users.length === 0) {
    console.log('No users found.');
    return;
  }

  const idW = Math.max(2, ...users.map(u => String(u.id).length));
  const emailW = Math.max(5, ...users.map(u => (u.email || '').length));
  const nameW = Math.max(4, ...users.map(u => (u.name || '').length));

  console.log(
    `${'ID'.padEnd(idW)}    ${'EMAIL'.padEnd(emailW)}    ${'NAME'.padEnd(nameW)}    ROLE`
  );
  for (const u of users) {
    console.log(
      `${String(u.id).padEnd(idW)}    ${(u.email || '').padEnd(emailW)}    ${(u.name || '').padEnd(nameW)}    ${u.role || ''}`
    );
  }
}
