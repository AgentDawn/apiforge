import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import http from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoContent = readFileSync(
  join(__dirname, '..', '..', '..', 'examples', 'petstore-grpc.proto'),
  'utf-8'
);

// ─── gRPC Proto Parser Tests ─────────────────────────────

test.describe('gRPC Support - Proto Import & UI', () => {

  test('should parse proto file and show services in sidebar', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto file', async () => {
      await page.goto('/');
      await page.evaluate((proto) => {
        loadProto(proto);
      }, protoContent);
    });

    await test.step('Verify: Services shown in sidebar', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('petstore.v1');
      await expect(page.locator('.folder-header', { hasText: 'PetService' })).toBeVisible();
      await expect(page.locator('.folder-header', { hasText: 'StoreService' })).toBeVisible();
    });
  });

  test('should show gRPC methods as endpoints with purple badges', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and expand PetService', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
    });

    await test.step('Verify: Endpoints with GRPC badges', async () => {
      const petFolder = page.locator('.folder', { has: page.locator('.folder-header', { hasText: 'PetService' }) });
      const endpoints = petFolder.locator('.endpoint-item');
      await expect(endpoints.first()).toBeVisible();
      const count = await endpoints.count();
      expect(count).toBe(6);
      await expect(page.locator('.method-grpc').first()).toBeVisible();
      await expect(page.locator('.method-grpc').first()).toHaveText('GRPC');
    });
  });

  test('should show gRPC target server input when proto loaded', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((proto) => { loadProto(proto); }, protoContent);

    await expect(page.getByTestId('grpc-target-bar')).toBeVisible();
    await expect(page.getByTestId('grpc-target')).toBeVisible();
    await expect(page.getByTestId('grpc-tls')).toBeVisible();
  });

  test('should hide gRPC target bar when loading REST spec', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto then REST spec', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); }, protoContent);
      await expect(page.getByTestId('grpc-target-bar')).toBeVisible();

      await page.evaluate(() => {
        loadSpec({
          openapi: '3.0.0',
          info: { title: 'REST API', version: '1.0' },
          paths: { '/health': { get: { summary: 'Health', responses: { '200': { description: 'OK' } } } } },
        });
      });
    });

    await test.step('Verify: gRPC bar hidden', async () => {
      await expect(page.getByTestId('grpc-target-bar')).not.toBeVisible();
    });
  });

  test('should select gRPC endpoint and populate request body', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and click AddPet', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'AddPet' }).click();
    });

    await test.step('Verify: Method, URL, and body populated', async () => {
      await expect(page.getByTestId('method-select')).toHaveValue('GRPC');
      const url = await page.getByTestId('url-input').inputValue();
      expect(url).toContain('petstore.v1.PetService/AddPet');
      const body = await page.getByTestId('body-editor').innerText();
      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('tags');
    });
  });

  test('should show correct fields for different gRPC methods', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
    await page.locator('.folder-header', { hasText: 'PetService' }).click();
    await page.locator('.endpoint-item', { hasText: 'GetPet' }).click();

    const body = await page.getByTestId('body-editor').innerText();
    const parsed = JSON.parse(body);
    expect(parsed).toHaveProperty('id');
    expect(Object.keys(parsed).length).toBe(1);
  });

  test('should show StoreService endpoints', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((proto) => { loadProto(proto); }, protoContent);
    await page.locator('.folder-header', { hasText: 'StoreService' }).click();

    const endpoints = page.locator('.folder-content:not(.hidden) .endpoint-item');
    const count = await endpoints.count();
    expect(count).toBe(3);
  });

  test('should auto-switch to Body tab when selecting gRPC endpoint', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
    await page.locator('.folder-header', { hasText: 'PetService' }).click();
    await page.locator('.endpoint-item', { hasText: 'ListPets' }).click();

    await expect(page.getByTestId('body-editor')).toBeVisible();
  });

  test('should require gRPC target before sending', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and select endpoint', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'GetPet' }).click();
      await page.getByTestId('grpc-target').fill('');
    });

    await test.step('Verify: Alert about missing target', async () => {
      page.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('gRPC server address');
        await dialog.accept();
      });
      await page.getByTestId('send-btn').click();
    });
  });

  test('should attempt gRPC call when target is set', {
    annotation: [
      { type: 'feature', description: 'grpc-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Login and load proto', async () => {
      await page.goto('/');
      const username = 'grpc_' + Math.random().toString(36).slice(2, 8);
      await page.evaluate(async (u) => {
        const resp = await fetch('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: 'password123' }),
        });
        const data = await resp.json();
        localStorage.setItem('apiforge-app-auth', JSON.stringify({ token: data.token, user: data.user }));
      }, username);
      await page.reload();
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
    });

    await test.step('Action: Select endpoint and send', async () => {
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'GetPet' }).click();
      await page.getByTestId('grpc-target').fill('localhost:50051');
      await page.getByTestId('send-btn').click();
    });

    await test.step('Verify: Response received (error expected)', async () => {
      await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
      const status = await page.getByTestId('response-status').textContent();
      expect(status).toMatch(/502|0|Error/);
    });
  });
});

// ─── Proto Parser Unit Tests (via browser) ───────────────

test.describe('gRPC Support - Proto Parser (via UI)', () => {

  test('should parse services and show correct method count in sidebar', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto file', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); }, protoContent);
    });

    await test.step('Verify: Package name shown in collection', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('petstore.v1');
    });

    await test.step('Verify: PetService has 6 methods', async () => {
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      const petFolder = page.locator('.folder', { has: page.locator('.folder-header', { hasText: 'PetService' }) });
      const endpoints = petFolder.locator('.endpoint-item');
      await expect(endpoints).toHaveCount(6);
    });

    await test.step('Verify: StoreService has 3 methods', async () => {
      await page.locator('.folder-header', { hasText: 'StoreService' }).click();
      const storeFolder = page.locator('.folder', { has: page.locator('.folder-header', { hasText: 'StoreService' }) });
      const endpoints = storeFolder.locator('.endpoint-item');
      await expect(endpoints).toHaveCount(3);
    });
  });

  test('should show correct request fields when selecting AddPet method', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and click AddPet', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'AddPet' }).click();
    });

    await test.step('Verify: Body editor contains Pet message fields', async () => {
      const body = await page.getByTestId('body-editor').innerText();
      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('tags');
      expect(Array.isArray(parsed.tags)).toBe(true);
    });
  });

  test('should show GetPet with only id field in body', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and click GetPet', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'GetPet' }).click();
    });

    await test.step('Verify: Body has only id field', async () => {
      const body = await page.getByTestId('body-editor').innerText();
      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('id');
      expect(Object.keys(parsed).length).toBe(1);
    });
  });

  test('should show WatchPets as streaming endpoint in sidebar', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
    });

    await test.step('Verify: WatchPets endpoint visible in sidebar', async () => {
      const watchPets = page.locator('.endpoint-item', { hasText: 'WatchPets' });
      await expect(watchPets).toBeVisible();
    });
  });

  test('should show all 9 endpoints across both services with GRPC method', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto and expand all folders', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.folder-header', { hasText: 'StoreService' }).click();
    });

    await test.step('Verify: 9 total endpoints with GRPC badges', async () => {
      const allEndpoints = page.locator('.endpoint-item');
      await expect(allEndpoints).toHaveCount(9);
      // Each endpoint-item should contain a GRPC method badge
      const grpcBadgesInEndpoints = page.locator('.endpoint-item .method-grpc');
      const count = await grpcBadgesInEndpoints.count();
      expect(count).toBe(9);
    });

    await test.step('Verify: AddPet populates correct URL path', async () => {
      await page.locator('.endpoint-item', { hasText: 'AddPet' }).click();
      await expect(page.getByTestId('method-select')).toHaveValue('GRPC');
      const url = await page.getByTestId('url-input').inputValue();
      expect(url).toContain('petstore.v1.PetService/AddPet');
    });
  });

  test('should populate correct gRPC target bar and collection title', {
    annotation: [
      { type: 'feature', description: 'grpc-proto-parser' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load proto', async () => {
      await page.goto('/');
      await page.evaluate((proto) => { loadProto(proto); }, protoContent);
    });

    await test.step('Verify: Collection title shows package name', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('petstore.v1');
    });

    await test.step('Verify: gRPC target bar visible', async () => {
      await expect(page.getByTestId('grpc-target-bar')).toBeVisible();
      await expect(page.getByTestId('grpc-target')).toBeVisible();
    });
  });
});

// ─── NestJS gRPC Server for Live Call Tests ───────────────

const NESTJS_DIR = join(__dirname, '..', '..', '..', 'examples', 'nestjs-sample');
const NESTJS_PORT = 3002;

function waitForNestJSServer(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.request({ hostname: 'localhost', port, path: '/api/v1/pets', method: 'GET', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`NestJS server did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(check, 500);
        }
      });
      req.end();
    };
    check();
  });
}

test.describe('gRPC Support - Live gRPC Calls (NestJS Server)', () => {
  let nestProcess;
  let nestAvailable = false;

  test.beforeAll(async () => {
    try {
      await waitForNestJSServer(NESTJS_PORT, 2000);
      nestAvailable = true;
    } catch {
      try {
        nestProcess = spawn('npx', ['ts-node', '-r', 'tsconfig-paths/register', 'src/main.ts'], {
          cwd: NESTJS_DIR,
          stdio: 'pipe',
          shell: true,
        });
        nestProcess.stderr.on('data', (d) => {
          const msg = d.toString();
          if (msg.includes('Error') && !msg.includes('DeprecationWarning')) {
            console.error('[NestJS stderr]', msg);
          }
        });
        await waitForNestJSServer(NESTJS_PORT, 30000);
        nestAvailable = true;
      } catch (err) {
        console.warn('Could not start NestJS gRPC server:', err.message);
        nestAvailable = false;
      }
    }
  });

  test.afterAll(async () => {
    if (nestProcess) {
      nestProcess.kill();
      nestProcess = null;
    }
  });

  async function setupNestGrpc(page) {
    test.skip(!nestAvailable, 'NestJS gRPC server is not available');
    await page.goto('/');
    const username = 'grpc_nest_' + Math.random().toString(36).slice(2, 8);
    await page.evaluate(async (u) => {
      const resp = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: 'password123' }),
      });
      const data = await resp.json();
      localStorage.setItem('apiforge-app-auth', JSON.stringify({ token: data.token, user: data.user }));
    }, username);
    await page.reload();
    await page.evaluate((proto) => { loadProto(proto); appState.isSpecMode = false; }, protoContent);
    await page.getByTestId('grpc-target').fill('localhost:' + NESTJS_PORT);
  }

  test('should call GetPet on NestJS gRPC server', {
    annotation: [
      { type: 'feature', description: 'grpc-live' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure gRPC', async () => {
      await setupNestGrpc(page);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'GetPet' }).click();
    });

    await test.step('Action: Send GetPet request', async () => {
      await page.evaluate(() => window.bodyEditor.setValue('{"id": "1"}'));
      await page.getByTestId('send-btn').click();
    });

    await test.step('Verify: Response received', async () => {
      await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
      const status = await page.getByTestId('response-status').textContent();
      expect(status).toContain('200');
      const body = await page.getByTestId('response-body').textContent();
      expect(body).toContain('Buddy');
      expect(body).toContain('PET_STATUS_AVAILABLE');
    });
  });

  test('should call AddPet on NestJS gRPC server', {
    annotation: [
      { type: 'feature', description: 'grpc-live' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Configure gRPC', async () => {
      await setupNestGrpc(page);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'AddPet' }).click();
    });

    await test.step('Action: Send AddPet request', async () => {
      await page.evaluate(() => window.bodyEditor.setValue('{"name": "Charlie", "status": "PET_STATUS_AVAILABLE", "tags": ["cute"]}'));
      await page.getByTestId('send-btn').click();
    });

    await test.step('Verify: Pet created', async () => {
      await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
      const status = await page.getByTestId('response-status').textContent();
      expect(status).toContain('200');
      const body = await page.getByTestId('response-body').textContent();
      expect(body).toContain('Charlie');
    });
  });

  test('should call ListPets on NestJS gRPC server', {
    annotation: [
      { type: 'feature', description: 'grpc-live' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await setupNestGrpc(page);
    await page.locator('.folder-header', { hasText: 'PetService' }).click();
    await page.locator('.endpoint-item', { hasText: 'ListPets' }).click();
    await page.getByTestId('send-btn').click();

    await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
    const body = await page.getByTestId('response-body').textContent();
    expect(body).toContain('Buddy');
    expect(body).toContain('Max');
  });

  test('should call PlaceOrder on NestJS gRPC server', {
    annotation: [
      { type: 'feature', description: 'grpc-live' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await setupNestGrpc(page);
    await page.locator('.folder-header', { hasText: 'StoreService' }).click();
    await page.locator('.endpoint-item', { hasText: 'PlaceOrder' }).click();

    await page.evaluate(() => window.bodyEditor.setValue('{"pet_id": "1", "quantity": 1}'));
    await page.getByTestId('send-btn').click();

    await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
    const status = await page.getByTestId('response-status').textContent();
    expect(status).toContain('200');
    const body = await page.getByTestId('response-body').textContent();
    expect(body).toContain('ORDER_STATUS_PLACED');
  });

  test('should return different pets from NestJS server state', {
    annotation: [
      { type: 'feature', description: 'grpc-live' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Add a pet then list', async () => {
      await setupNestGrpc(page);
      await page.locator('.folder-header', { hasText: 'PetService' }).click();
      await page.locator('.endpoint-item', { hasText: 'AddPet' }).click();
      await page.evaluate(() => window.bodyEditor.setValue('{"name": "Luna", "status": "PET_STATUS_PENDING", "tags": ["new"]}'));
      await page.getByTestId('send-btn').click();
      await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
    });

    await test.step('Action: List pets', async () => {
      await page.locator('.endpoint-item', { hasText: 'ListPets' }).click();
      await page.getByTestId('send-btn').click();
      await expect(page.getByTestId('response-status')).toBeVisible({ timeout: 10000 });
    });

    await test.step('Verify: New pet in list', async () => {
      const body = await page.getByTestId('response-body').textContent();
      expect(body).toContain('Luna');
    });
  });
});
