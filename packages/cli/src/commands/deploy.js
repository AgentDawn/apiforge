import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { EnvironmentManager } from '../../../core/src/collection/environment-manager.js';
import { FileStorage } from '../../../core/src/storage/file-storage.js';
import { buildSpec, findTsFiles } from './generate-spec.js';
import { serverFetch, getToken, getServerUrl } from './auth.js';

export async function deployCommand(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      source: { type: 'string', short: 's' },
      environment: { type: 'string', short: 'e' },
      'base-url': { type: 'string' },
      name: { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (!values.source) {
    console.log(`
apiforge deploy - Generate spec from NestJS source and upload to server

USAGE:
  apiforge deploy --source <dir> [options]

OPTIONS:
  -s, --source <dir>        NestJS source directory (required)
  -e, --environment <name>  Environment name (looks up saved env variables)
  --base-url <url>          Override base URL (optional if env has baseUrl)
  --name <name>             Collection name (default: spec title)
  -v, --verbose             Show detailed output

EXAMPLES:
  apiforge deploy --source ./src -e production
  apiforge deploy --source ./src -e staging
  apiforge deploy --source ./src --base-url https://api.prod.com
`);
    return;
  }

  // Check auth
  const token = getToken(dataDir);
  if (!token) {
    console.error('Error: Not logged in. Run `apiforge auth login` or set APIFORGE_TOKEN.');
    process.exit(1);
  }

  const sourceDir = resolve(values.source);
  const envName = values.environment || null;
  let baseUrl = values['base-url'] || null;

  // ─── Step 1: Resolve environment variables ─────────────
  let envVars = {};
  if (envName) {
    const storage = new FileStorage(`${dataDir}/data`);
    const envManager = new EnvironmentManager(storage);
    const env = await envManager.getByName(envName);

    if (env) {
      for (const v of env.variables) {
        if (v.enabled !== false) envVars[v.key] = v.value;
      }
      if (!baseUrl && envVars.baseUrl) {
        baseUrl = envVars.baseUrl;
      }
      console.log(`Environment "${envName}": ${Object.keys(envVars).length} variable(s)`);
    } else {
      console.log(`Environment "${envName}" not found locally.`);
      if (!baseUrl) {
        console.log('Tip: Create it with: apiforge env create ' + envName + ' --set baseUrl=https://...');
      }
    }
  }

  // ─── Step 2: Generate spec (includes exception enrichment) ──
  console.log(`Scanning NestJS source: ${sourceDir}`);

  const tsFiles = findTsFiles(sourceDir);
  console.log(`Found ${tsFiles.length} TypeScript files`);

  const spec = buildSpec(sourceDir, tsFiles, { title: values.name || 'API' });
  const pathCount = Object.keys(spec.paths).length;
  const opCount = Object.values(spec.paths).reduce((sum, p) => sum + Object.keys(p).length, 0);
  console.log(`Generated spec: ${pathCount} paths, ${opCount} operations`);

  // ─── Step 3: Apply environment to spec ─────────────────
  if (baseUrl) {
    spec.servers = [{ url: baseUrl, description: envName || 'default' }];
    console.log(`Server URL: ${baseUrl}`);
  }

  // ─── Step 4: Upload collection ─────────────────────────
  const collectionName = values.name || spec.info?.title || 'API';
  const displayName = envName ? `${collectionName} (${envName})` : collectionName;

  console.log(`Uploading "${displayName}" to ${getServerUrl(dataDir)}...`);

  const { ok, data } = await serverFetch(dataDir, '/api/collections', {
    method: 'POST',
    body: JSON.stringify({
      name: displayName,
      spec: JSON.stringify(spec),
    }),
  });

  if (!ok) {
    console.error(`Upload failed: ${data?.error || 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`Collection uploaded: ${displayName} (ID: ${data.id})`);

  // ─── Step 5: Sync environment to server ────────────────
  if (envName && Object.keys(envVars).length > 0) {
    const envResp = await serverFetch(dataDir, '/api/environments', {
      method: 'POST',
      body: JSON.stringify({
        name: envName,
        variables: JSON.stringify(envVars),
      }),
    });

    if (envResp.ok) {
      console.log(`Environment "${envName}" synced to server`);
    } else {
      if (values.verbose) console.log(`Environment sync: ${envResp.data?.error || envResp.status}`);
    }
  }

  console.log('\nDeploy complete.');
  return { collectionId: data.id, spec };
}
