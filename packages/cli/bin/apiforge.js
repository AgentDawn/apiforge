#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { importCommand } from '../src/commands/import.js';
import { runCommand } from '../src/commands/run.js';
import { envCommand } from '../src/commands/env.js';
import { specCommand } from '../src/commands/spec.js';

import { authCommand } from '../src/commands/auth.js';
import { collectionsCommand } from '../src/commands/collections.js';
import { deployCommand } from '../src/commands/deploy.js';
import { screenshotCommand } from '../src/commands/screenshot.js';
import { reportCommand } from '../src/commands/report.js';
import { generateSpecCommand } from '../src/commands/generate-spec.js';

const HELP = `
apiforge - Open-source API client, docs generator, and test runner

USAGE:
  apiforge <command> [options]

COMMANDS:
  import <file|url>     Import OpenAPI spec or Postman collection
  run <request-path>    Execute an API request (collection-based)
  run <METHOD> <url>    Execute a direct HTTP request
  env <subcommand>      Manage environments
  spec <subcommand>     Browse imported specs
  generate-spec         Generate OpenAPI spec from NestJS source (static AST analysis + exception enrichment)
  auth <subcommand>     Login, register, logout, status, connector
  collections <sub>     Server-side collection management
  deploy                Enrich + upload to server (CI/CD)
  screenshot            Take a screenshot of a URL with optional highlights
  report                Generate API test report from request history

OPTIONS:
  -h, --help            Show this help
  -v, --version         Show version
  -e, --env <name>      Use specific environment

EXAMPLES:
  apiforge import ./swagger.json --name "My API"
  apiforge run "My API/users/GET users"
  apiforge run GET https://api.example.com/pets --query "limit=10" --verbose
  apiforge run POST https://api.example.com/pets --body '{"name":"Buddy"}' -H "Content-Type: application/json"
  apiforge env create local --set baseUrl=http://localhost:8080
  apiforge spec list
  apiforge auth login -u admin -p secret
  apiforge auth connector-config --search-url http://localhost:3002/admin/users/search --token-url http://localhost:3002/admin/users/{id}/token
  apiforge auth search "user@test"
  apiforge auth switch user@test.com
  apiforge auth whoami
  apiforge collections list
  apiforge collections push --file ./swagger.json --name "My API"
  apiforge deploy --source ./src -e production --base-url https://api.prod.com
  apiforge screenshot --url http://localhost:3001 --output report.png
  apiforge screenshot --url http://localhost:3001 --highlight ".response-status:red" --output status.png
  apiforge report --format markdown --output report.md
  apiforge report --format markdown --screenshots --url http://localhost:3001 --output report.md
  apiforge generate-spec --src ./src --output openapi.json --title "My API"
`;

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '-h' || command === '--help') {
  console.log(HELP);
  process.exit(0);
}

if (command === '-v' || command === '--version') {
  console.log('apiforge 0.1.0');
  process.exit(0);
}

const dataDir = resolve(process.env.APIFORGE_DATA_DIR || `${process.env.HOME || process.env.USERPROFILE}/.apiforge`);

try {
  switch (command) {
    case 'import':
      await importCommand(args.slice(1), dataDir);
      break;
    case 'run':
      await runCommand(args.slice(1), dataDir);
      break;
    case 'env':
      await envCommand(args.slice(1), dataDir);
      break;
    case 'spec':
      await specCommand(args.slice(1), dataDir);
      break;
    case 'auth':
      await authCommand(args.slice(1), dataDir);
      break;
    case 'collections':
      await collectionsCommand(args.slice(1), dataDir);
      break;
    case 'deploy':
      await deployCommand(args.slice(1), dataDir);
      break;
    case 'screenshot':
      await screenshotCommand(args.slice(1), dataDir);
      break;
    case 'report':
      await reportCommand(args.slice(1), dataDir);
      break;
    case 'generate-spec':
      await generateSpecCommand(args.slice(1), dataDir);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
