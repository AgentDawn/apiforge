import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OpenApiParser } from '../src/parser/openapi-parser.js';
import { CollectionManager } from '../src/collection/collection-manager.js';
import { EnvironmentManager } from '../src/collection/environment-manager.js';
import { VariableResolver } from '../src/collection/variable-resolver.js';
import { MemoryStorage } from '../src/storage/memory-storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json');

describe('VariableResolver', () => {
  it('should resolve simple variables', () => {
    const resolver = new VariableResolver({ baseUrl: 'http://localhost:3000' });
    assert.equal(resolver.resolve('{{baseUrl}}/api'), 'http://localhost:3000/api');
  });

  it('should support default values', () => {
    const resolver = new VariableResolver({});
    assert.equal(resolver.resolve('{{host:localhost}}'), 'localhost');
  });

  it('should leave unresolved variables intact', () => {
    const resolver = new VariableResolver({});
    assert.equal(resolver.resolve('{{unknown}}/path'), '{{unknown}}/path');
  });

  it('should detect unresolved variables', () => {
    const resolver = new VariableResolver({ a: '1' });
    const unresolved = resolver.getUnresolved('{{a}} and {{b}}');
    assert.deepEqual(unresolved, ['b']);
  });
});

describe('EnvironmentManager', () => {
  let envManager;
  beforeEach(() => { envManager = new EnvironmentManager(new MemoryStorage()); });

  it('should create an environment', async () => {
    const env = await envManager.create('test', { baseUrl: 'http://localhost' });
    assert.ok(env.id);
    assert.equal(env.name, 'test');
    assert.equal(env.variables[0].key, 'baseUrl');
  });

  it('should list environments', async () => {
    await envManager.create('dev');
    await envManager.create('prod');
    const list = await envManager.list();
    assert.equal(list.length, 2);
  });

  it('should set and get active', async () => {
    const env = await envManager.create('active-test', { key: 'value' });
    await envManager.setActive(env.id);
    const active = await envManager.getActive();
    assert.equal(active.name, 'active-test');
  });

  it('should create from servers', async () => {
    const servers = [
      { url: 'https://api.example.com', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local' },
    ];
    const envs = await envManager.createFromServers(servers);
    assert.equal(envs.length, 2);
    assert.equal(envs[0].name, 'Production');
  });
});

describe('CollectionManager', () => {
  let collectionManager;
  beforeEach(() => { collectionManager = new CollectionManager(new MemoryStorage()); });

  it('should create an empty collection', async () => {
    const col = await collectionManager.create('Test', 'A test');
    assert.ok(col.id);
    assert.equal(col.name, 'Test');
  });

  it('should import from OpenAPI spec', async () => {
    const content = await readFile(specPath, 'utf-8');
    const parser = OpenApiParser.parse(content);
    const col = await collectionManager.importFromSpec(parser, 'Petstore');
    assert.equal(col.name, 'Petstore');
    const folderNames = col.items.map((i) => i.name);
    assert.ok(folderNames.includes('Pets'));
    assert.ok(folderNames.includes('Users'));
    const petsFolder = col.items.find((i) => i.name === 'Pets');
    assert.equal(petsFolder.items.length, 4);
    assert.equal(col.auth.type, 'bearer');
  });

  it('should find request by path', async () => {
    const content = await readFile(specPath, 'utf-8');
    const parser = OpenApiParser.parse(content);
    const col = await collectionManager.importFromSpec(parser);
    const req = await collectionManager.findRequest(col.id, 'Pets/Get all pets');
    assert.ok(req);
    assert.equal(req.method, 'GET');
  });
});
