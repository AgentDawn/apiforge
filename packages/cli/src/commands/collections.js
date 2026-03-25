import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadAuth, serverFetch } from './auth.js';

export async function collectionsCommand(args, dataDir) {
  const subcommand = args[0];

  if (!subcommand || subcommand === '--help') {
    console.log(`
apiforge collections - Server-side collection management

USAGE:
  apiforge collections <subcommand> [options]

SUBCOMMANDS:
  list                  List saved collections on server
  show <id>             Show collection detail
  save                  Save a spec file as a collection
  delete <id>           Delete a collection
  pull <id>             Download collection to local file
  push <file>           Upload local spec file to server

OPTIONS:
  --name <name>         Collection name (for save/push)
  --file <path>         Spec file path (for save/push)
  --output <path>       Output file path (for pull)

EXAMPLES:
  apiforge collections list
  apiforge collections save --name "My API" --file ./swagger.json
  apiforge collections pull abc123 --output ./my-api.json
  apiforge collections push ./swagger.json --name "Studio API"
  apiforge collections delete abc123
`);
    return;
  }

  // All collection commands require auth
  const auth = loadAuth(dataDir);
  if (!auth?.token) {
    console.error('Error: Not logged in. Run `apiforge auth login` first.');
    process.exit(1);
  }

  switch (subcommand) {
    case 'list':
      await listCollections(dataDir);
      break;
    case 'show':
      await showCollection(args.slice(1), dataDir);
      break;
    case 'save':
    case 'push':
      await pushCollection(args.slice(1), dataDir);
      break;
    case 'pull':
      await pullCollection(args.slice(1), dataDir);
      break;
    case 'delete':
      await deleteCollection(args.slice(1), dataDir);
      break;
    default:
      console.error(`Unknown collections subcommand: ${subcommand}`);
      process.exit(1);
  }
}

async function listCollections(dataDir) {
  const { status, ok, data } = await serverFetch(dataDir, '/api/collections');

  if (!ok) {
    console.error(`Failed to list collections: ${data?.error || status}`);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('No collections found.');
    return;
  }

  console.log(`Found ${data.length} collection(s):\n`);
  for (const col of data) {
    const updated = col.updated_at ? new Date(col.updated_at).toLocaleString() : '-';
    console.log(`  ${col.id}  ${col.name}  (updated: ${updated})`);
  }
}

async function showCollection(args, dataDir) {
  const id = args[0];
  if (!id) {
    console.error('Error: collection ID is required');
    console.error('Usage: apiforge collections show <id>');
    process.exit(1);
  }

  const { ok, data } = await serverFetch(dataDir, `/api/collections/${id}`);
  if (!ok) {
    console.error(`Failed to get collection: ${data?.error || 'Not found'}`);
    process.exit(1);
  }

  console.log(`Collection: ${data.name}`);
  console.log(`ID: ${data.id}`);
  console.log(`Created: ${data.created_at}`);
  console.log(`Updated: ${data.updated_at}`);

  if (data.spec) {
    try {
      const spec = JSON.parse(data.spec);
      const paths = Object.keys(spec.paths || {});
      console.log(`\nEndpoints: ${paths.length}`);
      for (const p of paths) {
        const methods = Object.keys(spec.paths[p]).filter(m => m !== 'parameters');
        for (const m of methods) {
          console.log(`  ${m.toUpperCase().padEnd(7)} ${p}`);
        }
      }
    } catch {
      console.log('\nSpec: (raw data available, use --output to save)');
    }
  }
}

async function pushCollection(args, dataDir) {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      file: { type: 'string' },
    },
  });

  const filePath = values.file;
  if (!filePath) {
    console.error('Error: --file <path> is required');
    console.error('Usage: apiforge collections push --file ./swagger.json --name "My API"');
    process.exit(1);
  }

  const absPath = resolve(filePath);
  let specContent;
  try {
    specContent = readFileSync(absPath, 'utf-8');
    JSON.parse(specContent); // validate JSON
  } catch (err) {
    console.error(`Error reading spec file: ${err.message}`);
    process.exit(1);
  }

  const name = values.name || guessName(specContent, absPath);

  console.log(`Uploading "${name}" to server...`);

  const { ok, data } = await serverFetch(dataDir, '/api/collections', {
    method: 'POST',
    body: JSON.stringify({ name, spec: specContent }),
  });

  if (!ok) {
    console.error(`Failed to save collection: ${data?.error || 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`Collection saved: ${data.name} (ID: ${data.id})`);
}

async function pullCollection(args, dataDir) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: 'string', short: 'o' },
    },
    allowPositionals: true,
  });

  const id = positionals[0];
  if (!id) {
    console.error('Error: collection ID is required');
    console.error('Usage: apiforge collections pull <id> --output ./spec.json');
    process.exit(1);
  }

  const { ok, data } = await serverFetch(dataDir, `/api/collections/${id}`);
  if (!ok) {
    console.error(`Failed to get collection: ${data?.error || 'Not found'}`);
    process.exit(1);
  }

  const outputPath = values.output || `${data.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
  const absOutput = resolve(outputPath);

  try {
    const spec = JSON.parse(data.spec);
    writeFileSync(absOutput, JSON.stringify(spec, null, 2));
  } catch {
    writeFileSync(absOutput, data.spec || '{}');
  }

  console.log(`Collection "${data.name}" saved to ${absOutput}`);
}

async function deleteCollection(args, dataDir) {
  const id = args[0];
  if (!id) {
    console.error('Error: collection ID is required');
    console.error('Usage: apiforge collections delete <id>');
    process.exit(1);
  }

  const { ok, data } = await serverFetch(dataDir, `/api/collections/${id}`, {
    method: 'DELETE',
  });

  if (!ok) {
    console.error(`Failed to delete: ${data?.error || 'Not found'}`);
    process.exit(1);
  }

  console.log(`Collection ${id} deleted.`);
}

function guessName(specContent, filePath) {
  try {
    const spec = JSON.parse(specContent);
    if (spec.info?.title) return spec.info.title;
  } catch { /* ignore */ }
  const base = filePath.split(/[/\\]/).pop();
  return base.replace(/\.json$/i, '');
}
