import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const petstoreSpec = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'examples', 'petstore-openapi.json'), 'utf-8')
);

const uniqueId = () => Math.random().toString(36).slice(2, 8);

async function registerAndLogin(request) {
  const username = 'portal_' + uniqueId();
  const resp = await request.post('/auth/register', {
    data: { username, password: 'password123' },
  });
  return resp.json();
}

async function createCollection(request, token, name, spec) {
  const resp = await request.post('/api/collections', {
    headers: { Authorization: 'Bearer ' + token },
    data: { name, spec: JSON.stringify(spec) },
  });
  return resp.json();
}

// ─── Developer Portal Tests ──────────────────────────────

test.describe('Developer Portal - Share & Public Docs', () => {

  let authToken;

  test.beforeAll(async ({ request }) => {
    const data = await registerAndLogin(request);
    authToken = data.token;
  });

  test('should create a share link for a collection', async ({ page, request }) => {
    const col = await createCollection(request, authToken, 'Share Test API', petstoreSpec);

    const resp = await request.post('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    expect(data.shareToken).toBeTruthy();
    expect(data.url).toContain('/docs/');

    // Verify docs page renders in browser
    await page.goto('/docs/' + data.shareToken);
    await expect(page.locator('#docs-title')).toHaveText('Petstore API');
    await expect(page.locator('#docs-app')).toBeVisible();
  });

  test('should access shared docs without authentication', async ({ page, request }) => {
    const col = await createCollection(request, authToken, 'Public Docs API', petstoreSpec);

    // Create share link
    const shareResp = await request.post('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    const { shareToken } = await shareResp.json();

    // Navigate to public docs page (no auth needed)
    await page.goto('/docs/' + shareToken);
    await expect(page.locator('#docs-title')).toHaveText('Petstore API');
    await expect(page.locator('#docs-app')).toBeVisible();

    // Should show endpoints
    const endpoints = page.locator('.endpoint');
    await expect(endpoints.first()).toBeVisible();
    expect(await endpoints.count()).toBeGreaterThan(0);
  });

  test('should return 404 for invalid share token', async ({ page }) => {
    await page.goto('/docs/nonexistent_token_xyz');
    await expect(page.locator('#docs-error')).toBeVisible();
    await expect(page.locator('#docs-loading')).not.toBeVisible();
  });

  test('should revoke a share link', async ({ page, request }) => {
    const col = await createCollection(request, authToken, 'Revoke Test API', petstoreSpec);

    // Create share link
    const shareResp = await request.post('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    const { shareToken } = await shareResp.json();

    // Verify docs page works before revoke
    await page.goto('/docs/' + shareToken);
    await expect(page.locator('#docs-title')).toHaveText('Petstore API');

    // Revoke the share link
    const revokeResp = await request.delete('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    expect(revokeResp.ok()).toBeTruthy();

    // Docs page should now show error
    await page.goto('/docs/' + shareToken);
    await expect(page.locator('#docs-error')).toBeVisible();
  });

  test('should render docs page with spec content', async ({ page, request }) => {
    const col = await createCollection(request, authToken, 'Rendered Docs API', petstoreSpec);

    const shareResp = await request.post('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    const { shareToken } = await shareResp.json();

    // Navigate to docs page
    await page.goto('/docs/' + shareToken);

    // Should show API title
    await expect(page.locator('#docs-title')).toHaveText('Petstore API');
    await expect(page.locator('#docs-app')).toBeVisible();
    await expect(page.locator('#docs-loading')).not.toBeVisible();

    // Should show endpoints
    const endpoints = page.locator('.endpoint');
    await expect(endpoints.first()).toBeVisible();
    expect(await endpoints.count()).toBeGreaterThan(0);

    // Should show method badges
    await expect(page.locator('.endpoint-method').first()).toBeVisible();
  });

  test('should expand endpoint to show details', async ({ page, request }) => {
    const col = await createCollection(request, authToken, 'Detail Docs API', petstoreSpec);

    const shareResp = await request.post('/api/collections/' + col.id + '/share', {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    const { shareToken } = await shareResp.json();

    await page.goto('/docs/' + shareToken);
    await expect(page.locator('#docs-title')).toHaveText('Petstore API');

    // Click first endpoint to expand
    await page.locator('.endpoint-header').first().click();
    await expect(page.locator('.endpoint.open .endpoint-detail').first()).toBeVisible();
  });

  test('should show error for invalid token in docs page', async ({ page }) => {
    await page.goto('/docs/invalid_token_abc');
    await expect(page.locator('#docs-error')).toBeVisible();
    await expect(page.locator('#docs-error')).toContainText('not found');
  });

  test('should show share button in saved collections UI', async ({ page }) => {
    // Login via localStorage
    await page.goto('/');
    await page.evaluate(({ token }) => {
      localStorage.setItem('apiforge-app-auth', JSON.stringify({ token, user: { id: 'x', username: 'test' } }));
    }, { token: authToken });
    await page.reload();

    // Create a collection
    await page.evaluate((specStr) => {
      loadSpec(JSON.parse(specStr));
    }, JSON.stringify(petstoreSpec));
    await page.getByTestId('save-collection-btn').click();
    await expect(page.getByTestId('save-collection-btn')).toHaveText('Saved!');

    // Should show share button
    await expect(page.locator('.saved-collection-share').first()).toBeVisible();
  });
});
