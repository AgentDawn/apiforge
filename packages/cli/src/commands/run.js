import { readFileSync } from 'node:fs';
import { CollectionManager, EnvironmentManager, RequestBuilder, RequestExecutor, FileStorage, VariableResolver } from '@apiforge/core';
import { getToken } from './auth.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/**
 * apiforge run <request-path> [-e <env>] [--var key=value] [--verbose]
 * apiforge run GET https://example.com/api [--header "K: V"] [--query "k=v"] [--body '...'] [--verbose]
 */
export async function runCommand(args, dataDir) {
  if (args.length === 0) {
    console.error(`Usage:
  apiforge run <"collection/folder/request"> [-e <env>] [--verbose]
  apiforge run GET <url> [--header "K: V"] [--query "k=v"] [--body '...'] [--verbose]`);
    process.exit(1);
  }

  // Detect direct HTTP mode: first arg is an HTTP method
  if (HTTP_METHODS.includes(args[0]?.toUpperCase())) {
    return directRunCommand(args, dataDir);
  }

  // Existing collection-based run
  return collectionRunCommand(args, dataDir);
}

// ─── Direct HTTP Run ─────────────────────────────────────

async function directRunCommand(args, dataDir) {
  const method = args[0].toUpperCase();
  const rawUrl = args[1];

  if (!rawUrl) {
    console.error('Usage: apiforge run GET <url> [options]');
    process.exit(1);
  }

  // Parse options
  const headers = {};
  const queryParams = [];
  const varOverrides = {};
  let body = null;
  let bodyFile = null;
  let contentType = null;
  let verbose = false;
  let envName = null;
  let noAuth = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--header':
      case '-H': {
        const val = args[++i];
        if (val) {
          const colonIdx = val.indexOf(':');
          if (colonIdx > 0) {
            headers[val.slice(0, colonIdx).trim()] = val.slice(colonIdx + 1).trim();
          }
        }
        break;
      }
      case '--query':
      case '-q': {
        const val = args[++i];
        if (val) queryParams.push(val);
        break;
      }
      case '--body':
      case '-d':
        body = args[++i];
        break;
      case '--body-file':
        bodyFile = args[++i];
        break;
      case '--content-type':
        contentType = args[++i];
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--env':
      case '-e':
        envName = args[++i];
        break;
      case '--var': {
        const val = args[++i];
        if (val) {
          const [key, ...rest] = val.split('=');
          varOverrides[key] = rest.join('=');
        }
        break;
      }
      case '--no-auth':
        noAuth = true;
        break;
    }
  }

  // Read body from file if specified
  if (bodyFile && !body) {
    try {
      body = readFileSync(bodyFile, 'utf-8');
    } catch (err) {
      console.error(`Error reading body file: ${err.message}`);
      process.exit(1);
    }
  }

  // Resolve variables from environment
  let variables = { ...varOverrides };
  if (envName) {
    const storage = new FileStorage(`${dataDir}/data`);
    const envManager = new EnvironmentManager(storage);
    const env = await envManager.getByName(envName);
    if (!env) {
      console.error(`Environment not found: ${envName}`);
      process.exit(1);
    }
    const envVars = {};
    for (const v of env.variables) {
      if (v.enabled) envVars[v.key] = v.value;
    }
    variables = { ...envVars, ...varOverrides };
  }

  // Variable substitution helper
  const resolveVars = (str) => str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);

  // Build URL with query params
  let url = resolveVars(rawUrl);
  if (queryParams.length > 0) {
    const urlObj = new URL(url);
    for (const qp of queryParams) {
      const eqIdx = qp.indexOf('=');
      if (eqIdx > 0) {
        urlObj.searchParams.append(
          resolveVars(qp.slice(0, eqIdx)),
          resolveVars(qp.slice(eqIdx + 1))
        );
      }
    }
    url = urlObj.toString();
  }

  // Resolve header variables
  const resolvedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    resolvedHeaders[resolveVars(key)] = resolveVars(value);
  }

  // Auto-apply auth token unless --no-auth or Authorization already set
  const hasAuthHeader = Object.keys(resolvedHeaders).some(k => k.toLowerCase() === 'authorization');
  if (!noAuth && !hasAuthHeader) {
    const token = getToken(dataDir);
    if (token) {
      resolvedHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  // Auto-detect content type
  if (body && !contentType && !Object.keys(resolvedHeaders).some(k => k.toLowerCase() === 'content-type')) {
    // Try to detect JSON
    try {
      JSON.parse(body);
      contentType = 'application/json';
    } catch {
      contentType = 'text/plain';
    }
  }
  if (contentType) {
    resolvedHeaders['Content-Type'] = contentType;
  }

  // Resolve body variables
  const resolvedBody = body ? resolveVars(body) : undefined;

  if (verbose) {
    console.log(`${method} ${url}`);
    for (const [key, value] of Object.entries(resolvedHeaders)) {
      console.log(`  ${key}: ${value}`);
    }
    if (resolvedBody) console.log(`\n${resolvedBody}`);
    console.log('');
  }

  // Execute request
  const start = Date.now();
  try {
    const fetchOptions = {
      method,
      headers: resolvedHeaders,
    };
    if (resolvedBody && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = resolvedBody;
    }

    console.log(`${method} ${url}`);
    const resp = await fetch(url, fetchOptions);
    const elapsed = Date.now() - start;

    const statusColor = resp.ok ? '\x1b[32m' : '\x1b[31m';
    console.log(`\n${statusColor}${resp.status} ${resp.statusText}\x1b[0m  (${elapsed}ms)`);

    if (verbose) {
      console.log('\nResponse Headers:');
      resp.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });
    }

    const text = await resp.text();
    if (text) {
      console.log('\nBody:');
      try {
        const json = JSON.parse(text);
        console.log(JSON.stringify(json, null, 2));
      } catch {
        console.log(text);
      }
    }

    if (!resp.ok) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

// ─── Collection-based Run ────────────────────────────────

async function collectionRunCommand(args, dataDir) {
  const requestPath = args[0];
  const envIdx = args.indexOf('-e');
  const envName = envIdx >= 0 ? args[envIdx + 1] : null;
  const verbose = args.includes('--verbose');

  // Parse --var overrides
  const varOverrides = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--var' && args[i + 1]) {
      const [key, ...rest] = args[i + 1].split('=');
      varOverrides[key] = rest.join('=');
    }
  }

  const storage = new FileStorage(`${dataDir}/data`);
  const collectionManager = new CollectionManager(storage);
  const envManager = new EnvironmentManager(storage);

  // Parse request path: "Collection Name/Folder/Request Name"
  const parts = requestPath.split('/');
  const collectionName = parts[0];
  const restPath = parts.slice(1).join('/');

  // Find collection
  const collection = await collectionManager.getByName(collectionName);
  if (!collection) {
    const list = await collectionManager.list();
    console.error(`Collection not found: ${collectionName}`);
    if (list.length > 0) {
      console.error(`Available collections: ${list.map((c) => c.name).join(', ')}`);
    }
    process.exit(1);
  }

  // Find request
  const request = await collectionManager.findRequest(collection.id, restPath);
  if (!request) {
    console.error(`Request not found: ${restPath}`);
    process.exit(1);
  }

  // Get environment variables
  let variables = {};
  if (envName) {
    const env = await envManager.getByName(envName);
    if (!env) {
      console.error(`Environment not found: ${envName}`);
      process.exit(1);
    }
    for (const v of env.variables) {
      if (v.enabled) variables[v.key] = v.value;
    }
  } else {
    variables = await envManager.getActiveVariables();
  }

  // Add collection variables
  for (const v of collection.variables || []) {
    if (v.enabled && !(v.key in variables)) {
      variables[v.key] = v.value;
    }
  }

  // Apply overrides
  Object.assign(variables, varOverrides);

  // Build request
  const builder = new RequestBuilder()
    .setMethod(request.method)
    .setUrl(request.url)
    .resolveVariables(variables);

  // Apply headers
  for (const h of request.headers || []) {
    if (h.enabled !== false) builder.setHeader(h.key, h.value);
  }

  // Apply query params
  for (const p of request.params?.query || []) {
    if (p.enabled && p.value) builder.setQueryParams({ [p.key]: p.value });
  }

  // Apply path params
  for (const p of request.params?.path || []) {
    if (p.enabled && p.value) builder.setPathParams({ [p.key]: p.value });
  }

  // Apply auth
  if (request.auth?.type === 'inherit' && collection.auth) {
    builder.setAuth(collection.auth.type === 'bearer'
      ? { type: 'bearer', token: new VariableResolver(variables).resolve(collection.auth.bearer?.token || '') }
      : collection.auth);
  } else if (request.auth?.type && request.auth.type !== 'inherit' && request.auth.type !== 'none') {
    builder.setAuth(request.auth);
  }

  // Apply body
  if (request.body?.mode === 'json' && request.body.json) {
    builder.setBody(request.body.json);
  } else if (request.body?.mode === 'raw' && request.body.raw) {
    builder.setBody(request.body.raw, 'text/plain');
  }

  const config = builder.build();

  if (verbose) {
    console.log(`${config.method} ${config.url}`);
    for (const [key, value] of Object.entries(config.headers)) {
      console.log(`  ${key}: ${value}`);
    }
    if (config.body) console.log(`\n${config.body}`);
    console.log('');
  }

  // Execute
  const executor = new RequestExecutor();
  console.log(`${request.method} ${config.url}...`);
  const response = await executor.execute(config);

  // Output
  const statusColor = response.ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`\n${statusColor}${response.status} ${response.statusText}\x1b[0m  (${response.timing.total}ms)`);

  if (verbose) {
    console.log('\nResponse Headers:');
    for (const [key, value] of Object.entries(response.headers)) {
      console.log(`  ${key}: ${value}`);
    }
  }

  if (response.body != null) {
    console.log('\nBody:');
    if (typeof response.body === 'object') {
      console.log(JSON.stringify(response.body, null, 2));
    } else {
      console.log(response.body);
    }
  }

  if (response.error) {
    console.error(`\nError: ${response.error}`);
    process.exit(1);
  }
}
