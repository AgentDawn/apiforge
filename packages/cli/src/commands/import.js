import { readFile } from 'node:fs/promises';
import { OpenApiParser } from '@apiforge/core';
import { CollectionManager } from '@apiforge/core';
import { EnvironmentManager } from '@apiforge/core';
import { FileStorage } from '@apiforge/core';

/**
 * apiforge import <file|url> [--name <name>]
 */
export async function importCommand(args, dataDir) {
  if (args.length === 0) {
    console.error('Usage: apiforge import <file|url> [--name <name>]');
    process.exit(1);
  }

  const source = args[0];
  const nameIdx = args.indexOf('--name');
  const name = nameIdx >= 0 ? args[nameIdx + 1] : null;

  const storage = new FileStorage(`${dataDir}/data`);
  const collectionManager = new CollectionManager(storage);
  const envManager = new EnvironmentManager(storage);

  let parser;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    console.log(`Fetching spec from ${source}...`);
    parser = await OpenApiParser.fromUrl(source);
  } else {
    console.log(`Reading spec from ${source}...`);
    const content = await readFile(source, 'utf-8');
    parser = OpenApiParser.parse(content);
  }

  // Validate
  const validation = parser.validate();
  if (!validation.valid) {
    console.warn('Spec validation warnings:');
    for (const err of validation.errors) {
      console.warn(`  - ${err}`);
    }
  }

  // Import as collection
  const collection = await collectionManager.importFromSpec(parser, name);
  const info = parser.getInfo();
  const endpoints = parser.getEndpoints();
  const tags = parser.getTags();
  const servers = parser.getServers();

  console.log(`\nImported: ${collection.name}`);
  console.log(`  Version: ${info.version || 'N/A'}`);
  console.log(`  Endpoints: ${endpoints.length}`);
  console.log(`  Tags: ${tags.join(', ')}`);
  console.log(`  Collection ID: ${collection.id}`);

  // Auto-create environments from servers
  if (servers.length > 0) {
    const envs = await envManager.createFromServers(servers);
    console.log(`\nCreated ${envs.length} environment(s):`);
    for (const env of envs) {
      console.log(`  - ${env.name} (baseUrl: ${env.variables[0]?.value})`);
    }
    // Set first as active
    await envManager.setActive(envs[0].id);
    console.log(`\nActive environment: ${envs[0].name}`);
  }

  console.log('\nDone!');
}
