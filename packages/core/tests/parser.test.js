import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OpenApiParser } from '../src/parser/openapi-parser.js';
import { SchemaResolver } from '../src/parser/schema-resolver.js';
import { SpecValidator } from '../src/parser/validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json');

async function loadSpec() {
  const content = await readFile(specPath, 'utf-8');
  return JSON.parse(content);
}

describe('OpenApiParser', async () => {
  it('should parse a spec from JSON string', async () => {
    const content = await readFile(specPath, 'utf-8');
    const parser = OpenApiParser.parse(content);
    assert.ok(parser);
    assert.equal(parser.getInfo().title, 'Petstore API');
  });

  it('should parse a spec from object', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    assert.equal(parser.getInfo().version, '1.0.0');
  });

  it('should return servers', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const servers = parser.getServers();
    assert.equal(servers.length, 2);
    assert.equal(servers[0].url, 'https://petstore.example.com/api/v1');
    assert.equal(servers[1].description, 'Local');
  });

  it('should return security schemes (Bearer JWT)', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const schemes = parser.getSecuritySchemes();
    assert.ok(schemes.JWT);
    assert.equal(schemes.JWT.type, 'http');
    assert.equal(schemes.JWT.scheme, 'bearer');
    assert.equal(schemes.JWT.bearerFormat, 'JWT');
  });

  it('should extract all tags', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const tags = parser.getTags();
    assert.ok(tags.includes('Pets'));
    assert.ok(tags.includes('Users'));
  });

  it('should get all endpoints', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const endpoints = parser.getEndpoints();
    assert.equal(endpoints.length, 5); // GET /pets, POST /pets, GET /pets/{id}, DELETE /pets/{id}, GET /users
  });

  it('should filter endpoints by tags', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const petEndpoints = parser.getEndpointsByTags(['Pets']);
    assert.equal(petEndpoints.length, 4);
    const userEndpoints = parser.getEndpointsByTags(['Users']);
    assert.equal(userEndpoints.length, 1);
  });

  it('should group endpoints by tag', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const groups = parser.getEndpointsGroupedByTag();
    assert.ok(groups.has('Pets'));
    assert.ok(groups.has('Users'));
    assert.equal(groups.get('Pets').length, 4);
  });

  it('should get single endpoint', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const ep = parser.getEndpoint('/pets', 'get');
    assert.ok(ep);
    assert.equal(ep.method, 'GET');
    assert.equal(ep.summary, 'Get all pets');
    assert.equal(ep.parameters.length, 2);
  });

  it('should detect deprecated endpoints', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const ep = parser.getEndpoint('/pets/{id}', 'delete');
    assert.ok(ep.deprecated);
  });

  it('should extract request body', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const ep = parser.getEndpoint('/pets', 'post');
    assert.ok(ep.requestBody);
    assert.ok(ep.requestBody.required);
    assert.ok(ep.requestBody.content['application/json']);
  });

  it('should return null for non-existent endpoint', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    assert.equal(parser.getEndpoint('/nonexistent', 'get'), null);
  });

  it('should get schemas', async () => {
    const spec = await loadSpec();
    const parser = OpenApiParser.parse(spec);
    const schemas = parser.getSchemas();
    assert.ok(schemas.Pet);
    assert.ok(schemas.CreatePetDto);
    assert.ok(schemas.User);
  });
});

describe('SchemaResolver', async () => {
  it('should resolve $ref pointers', async () => {
    const spec = await loadSpec();
    const resolver = new SchemaResolver(spec);
    const resolved = resolver.resolve('#/components/schemas/Pet');
    assert.ok(resolved);
    assert.equal(resolved.type, 'object');
    assert.ok(resolved.properties.id);
  });

  it('should handle nested $ref in resolveAll', async () => {
    const spec = await loadSpec();
    const resolver = new SchemaResolver(spec);
    const resolved = resolver.resolveAll();
    // The response schema $ref should be resolved
    const getPath = resolved.paths['/pets'].get;
    const schema = getPath.responses['200'].content['application/json'].schema;
    assert.equal(schema.type, 'array');
    assert.equal(schema.items.type, 'object');
  });

  it('should return null for invalid $ref', async () => {
    const spec = await loadSpec();
    const resolver = new SchemaResolver(spec);
    const result = resolver.resolve('#/components/schemas/NonExistent');
    assert.equal(result, null);
  });
});

describe('SpecValidator', async () => {
  it('should validate a correct spec', async () => {
    const spec = await loadSpec();
    const result = SpecValidator.validate(spec);
    assert.ok(result.valid);
    assert.equal(result.errors.length, 0);
  });

  it('should detect missing openapi field', () => {
    const result = SpecValidator.validate({ info: { title: 'Test', version: '1' }, paths: {} });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('openapi')));
  });

  it('should detect missing info', () => {
    const result = SpecValidator.validate({ openapi: '3.0.0', paths: {} });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('info')));
  });

  it('should detect missing paths', () => {
    const result = SpecValidator.validate({ openapi: '3.0.0', info: { title: 'T', version: '1' } });
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e) => e.includes('paths')));
  });

  it('should reject non-object input', () => {
    const result = SpecValidator.validate(null);
    assert.ok(!result.valid);
  });
});
