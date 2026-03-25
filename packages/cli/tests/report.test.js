import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReportArgs, generateMarkdownReport } from '../src/commands/report.js';

describe('report - argument parsing', () => {
  it('should parse --format and --output', () => {
    const result = parseReportArgs(['--format', 'json', '--output', 'out.json']);
    assert.equal(result.format, 'json');
    assert.equal(result.output, 'out.json');
  });

  it('should parse -f and -o shorthands', () => {
    const result = parseReportArgs(['-f', 'markdown', '-o', 'report.md']);
    assert.equal(result.format, 'markdown');
    assert.equal(result.output, 'report.md');
  });

  it('should parse --screenshots and --url', () => {
    const result = parseReportArgs(['--screenshots', '--url', 'http://localhost:3001']);
    assert.equal(result.includeScreenshots, true);
    assert.equal(result.url, 'http://localhost:3001');
  });

  it('should use defaults when args are missing', () => {
    const result = parseReportArgs([]);
    assert.equal(result.format, 'markdown');
    assert.equal(result.output, 'report.md');
    assert.equal(result.includeScreenshots, false);
    assert.equal(result.url, '');
  });
});

describe('report - markdown generation', () => {
  it('should generate report with no history', () => {
    const md = generateMarkdownReport([]);
    assert.ok(md.includes('# API Test Report'));
    assert.ok(md.includes('No request history found'));
  });

  it('should generate report with request history', () => {
    const history = [
      { method: 'GET', url: '/api/pets', status: 200, timing: 150 },
      { method: 'POST', url: '/api/pets', status: 201, timing: 300 },
      { method: 'GET', url: '/api/missing', status: 404, timing: 50 },
    ];
    const md = generateMarkdownReport(history);
    assert.ok(md.includes('# API Test Report'));
    assert.ok(md.includes('Total Requests | 3'));
    assert.ok(md.includes('Successful (2xx) | 2'));
    assert.ok(md.includes('Failed | 1'));
    assert.ok(md.includes('GET /api/pets'));
    assert.ok(md.includes('POST /api/pets'));
    assert.ok(md.includes('GET /api/missing'));
  });

  it('should mark successful and failed requests', () => {
    const history = [
      { method: 'GET', url: '/ok', status: 200 },
      { method: 'GET', url: '/fail', status: 500 },
    ];
    const md = generateMarkdownReport(history);
    assert.ok(md.includes('PASS'));
    assert.ok(md.includes('FAIL'));
  });
});
