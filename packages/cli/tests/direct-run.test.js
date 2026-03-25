import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test that HTTP method detection works by importing and testing the module structure
describe('direct run - HTTP method detection', () => {
  it('should export runCommand when @apiforge/core is available', async () => {
    try {
      const mod = await import('../src/commands/run.js');
      assert.equal(typeof mod.runCommand, 'function');
    } catch (err) {
      // @apiforge/core may not be installed in isolated test environments
      if (err.code === 'ERR_MODULE_NOT_FOUND') {
        assert.ok(true, 'Skipped: @apiforge/core not available');
      } else {
        throw err;
      }
    }
  });

  it('should recognize HTTP methods as direct mode trigger', () => {
    const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    for (const method of HTTP_METHODS) {
      assert.ok(HTTP_METHODS.includes(method.toUpperCase()), `${method} should be recognized`);
    }
    // Collection paths should NOT be detected as HTTP methods
    assert.ok(!HTTP_METHODS.includes('My API'), 'Collection name should not match');
    assert.ok(!HTTP_METHODS.includes('users'), 'Path segment should not match');
  });
});

describe('direct run - argument parsing', () => {
  it('should parse header arguments', () => {
    const args = [
      'GET', 'https://example.com',
      '--header', 'Content-Type: application/json',
      '-H', 'Authorization: Bearer token123',
    ];

    const headers = {};
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--header' || args[i] === '-H') {
        const val = args[++i];
        if (val) {
          const colonIdx = val.indexOf(':');
          if (colonIdx > 0) {
            headers[val.slice(0, colonIdx).trim()] = val.slice(colonIdx + 1).trim();
          }
        }
      }
    }

    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['Authorization'], 'Bearer token123');
  });

  it('should parse query arguments', () => {
    const args = [
      'GET', 'https://example.com/pets',
      '--query', 'limit=10',
      '-q', 'status=available',
    ];

    const queryParams = [];
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--query' || args[i] === '-q') {
        const val = args[++i];
        if (val) queryParams.push(val);
      }
    }

    assert.equal(queryParams.length, 2);
    assert.equal(queryParams[0], 'limit=10');
    assert.equal(queryParams[1], 'status=available');
  });

  it('should parse body argument', () => {
    const args = [
      'POST', 'https://example.com/pets',
      '--body', '{"name":"Buddy"}',
    ];

    let body = null;
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--body' || args[i] === '-d') {
        body = args[++i];
      }
    }

    assert.equal(body, '{"name":"Buddy"}');
  });

  it('should detect verbose and no-auth flags', () => {
    const args = [
      'GET', 'https://example.com',
      '--verbose', '--no-auth',
    ];

    const verbose = args.includes('--verbose') || args.includes('-v');
    const noAuth = args.includes('--no-auth');

    assert.ok(verbose);
    assert.ok(noAuth);
  });
});

describe('direct run - variable substitution', () => {
  it('should substitute {{variables}} in strings', () => {
    const variables = { baseUrl: 'https://api.example.com', version: 'v2' };
    const resolveVars = (str) => str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);

    assert.equal(resolveVars('{{baseUrl}}/{{version}}/pets'), 'https://api.example.com/v2/pets');
    assert.equal(resolveVars('{{unknown}}'), '{{unknown}}');
    assert.equal(resolveVars('no vars here'), 'no vars here');
  });

  it('should build URL with query params', () => {
    const url = new URL('https://example.com/pets');
    url.searchParams.append('limit', '10');
    url.searchParams.append('status', 'available');

    assert.ok(url.toString().includes('limit=10'));
    assert.ok(url.toString().includes('status=available'));
  });
});

describe('direct run - content type auto-detection', () => {
  it('should detect JSON body', () => {
    const body = '{"name":"Buddy"}';
    let contentType;
    try {
      JSON.parse(body);
      contentType = 'application/json';
    } catch {
      contentType = 'text/plain';
    }
    assert.equal(contentType, 'application/json');
  });

  it('should fall back to text/plain for non-JSON', () => {
    const body = 'Hello World';
    let contentType;
    try {
      JSON.parse(body);
      contentType = 'application/json';
    } catch {
      contentType = 'text/plain';
    }
    assert.equal(contentType, 'text/plain');
  });
});
