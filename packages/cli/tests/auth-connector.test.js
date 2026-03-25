import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadConnectorConfig,
  loadConnectorToken,
  connectorConfigCommand,
  connectorWhoamiCommand,
  connectorClearCommand,
} from '../src/commands/auth.js';

const testDir = join(tmpdir(), 'apiforge-test-connector-' + Date.now());

describe('auth connector', () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('loadConnectorConfig', () => {
    it('should return null when no config exists', () => {
      const result = loadConnectorConfig(testDir);
      assert.equal(result, null);
    });

    it('should load saved config', () => {
      const config = { searchUrl: 'http://localhost:3002/search', tokenUrl: 'http://localhost:3002/token/{id}' };
      writeFileSync(join(testDir, 'connector.json'), JSON.stringify(config));
      const result = loadConnectorConfig(testDir);
      assert.deepEqual(result, config);
    });
  });

  describe('loadConnectorToken', () => {
    it('should return null when no token exists', () => {
      const result = loadConnectorToken(testDir);
      assert.equal(result, null);
    });

    it('should load saved token', () => {
      const tokenData = { token: 'abc123', user: { email: 'test@test.com' } };
      writeFileSync(join(testDir, 'connector-token.json'), JSON.stringify(tokenData));
      const result = loadConnectorToken(testDir);
      assert.deepEqual(result, tokenData);
    });
  });

  describe('connectorConfigCommand', () => {
    it('should save config with both URLs', async () => {
      await connectorConfigCommand([
        '--search-url', 'http://localhost:3002/search',
        '--token-url', 'http://localhost:3002/token/{id}',
      ], testDir);

      const config = loadConnectorConfig(testDir);
      assert.equal(config.searchUrl, 'http://localhost:3002/search');
      assert.equal(config.tokenUrl, 'http://localhost:3002/token/{id}');
    });

    it('should show config when no args provided and config exists', async () => {
      writeFileSync(
        join(testDir, 'connector.json'),
        JSON.stringify({ searchUrl: 'http://a', tokenUrl: 'http://b' })
      );
      // Should not throw
      await connectorConfigCommand([], testDir);
    });
  });

  describe('connectorClearCommand', () => {
    it('should clear connector token', () => {
      const tokenPath = join(testDir, 'connector-token.json');
      writeFileSync(tokenPath, JSON.stringify({ token: 'x' }));
      assert.ok(existsSync(tokenPath));

      connectorClearCommand([], testDir);
      assert.ok(!existsSync(tokenPath));
    });

    it('should handle missing token gracefully', () => {
      // Should not throw
      connectorClearCommand([], testDir);
    });
  });

  describe('connectorWhoamiCommand', () => {
    it('should show user when token exists', async () => {
      writeFileSync(
        join(testDir, 'connector-token.json'),
        JSON.stringify({ token: 'abc', user: { email: 'me@test.com', name: 'Me', role: 'admin' } })
      );
      // Should not throw
      await connectorWhoamiCommand([], testDir);
    });

    it('should handle no token gracefully', async () => {
      // Should not throw
      await connectorWhoamiCommand([], testDir);
    });
  });

  describe('getToken with connector', () => {
    it('should prefer connector token over auth token', async () => {
      // Import getToken dynamically to test token priority
      const { getToken } = await import('../src/commands/auth.js');

      // Save auth token
      writeFileSync(
        join(testDir, 'auth.json'),
        JSON.stringify({ token: 'auth-token', user: { username: 'u' } })
      );

      // Save connector token
      writeFileSync(
        join(testDir, 'connector-token.json'),
        JSON.stringify({ token: 'connector-token', user: { email: 'u@test.com' } })
      );

      // Clear env to avoid interference
      const saved = process.env.APIFORGE_TOKEN;
      delete process.env.APIFORGE_TOKEN;

      try {
        const token = getToken(testDir);
        assert.equal(token, 'connector-token');
      } finally {
        if (saved !== undefined) process.env.APIFORGE_TOKEN = saved;
      }
    });
  });
});
