import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseScreenshotArgs } from '../src/commands/screenshot.js';

describe('screenshot - argument parsing', () => {
  it('should parse --url and --output', () => {
    const result = parseScreenshotArgs(['--url', 'http://localhost:3001', '--output', 'test.png']);
    assert.equal(result.url, 'http://localhost:3001');
    assert.equal(result.output, 'test.png');
  });

  it('should parse -o shorthand for output', () => {
    const result = parseScreenshotArgs(['--url', 'http://example.com', '-o', 'out.png']);
    assert.equal(result.output, 'out.png');
  });

  it('should parse multiple --highlight flags', () => {
    const result = parseScreenshotArgs([
      '--url', 'http://localhost:3001',
      '--highlight', '.response-status:red',
      '--highlight', '.response-body:blue',
    ]);
    assert.deepEqual(result.highlights, ['.response-status:red', '.response-body:blue']);
  });

  it('should parse --element', () => {
    const result = parseScreenshotArgs([
      '--url', 'http://localhost:3001',
      '--element', '.response-panel',
    ]);
    assert.equal(result.element, '.response-panel');
  });

  it('should parse --viewport', () => {
    const result = parseScreenshotArgs([
      '--url', 'http://localhost:3001',
      '--viewport', '1920x1080',
    ]);
    assert.equal(result.viewportWidth, 1920);
    assert.equal(result.viewportHeight, 1080);
  });

  it('should use defaults when args are missing', () => {
    const result = parseScreenshotArgs([]);
    assert.equal(result.url, '');
    assert.equal(result.output, 'screenshot.png');
    assert.deepEqual(result.highlights, []);
    assert.equal(result.element, null);
    assert.equal(result.viewportWidth, 1280);
    assert.equal(result.viewportHeight, 720);
  });
});
