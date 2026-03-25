import { test, expect } from '@playwright/test';

test.describe('Admin Page', () => {

  test('should hide Register button by default on main page', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-login-btn')).toBeVisible();
    await expect(page.getByTestId('app-register-btn')).not.toBeVisible();
  });

  test('should show admin page at /admin route', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveTitle('APIForge Admin');
    await expect(page.locator('.admin-header h1')).toHaveText('APIForge Admin');
  });

  test('should show login form on admin page', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('admin-username')).toBeVisible();
    await expect(page.getByTestId('admin-password')).toBeVisible();
    await expect(page.getByTestId('admin-login-btn')).toBeVisible();
  });

  test('should have link back to main app', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/admin');
    const backLink = page.locator('.admin-header a[href="/"]');
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveText('Back to APIForge');
  });

  test('should hide admin panel before login', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('#admin-login-section')).toBeVisible();
    await expect(page.locator('#admin-panel')).not.toBeVisible();
  });

  test('should return config with allowRegistration false by default', {
    annotation: [
      { type: 'feature', description: 'admin' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'auth' },
    ],
  }, async ({ request }) => {
    const resp = await request.get('/config');
    expect(resp.ok()).toBeTruthy();
    const config = await resp.json();
    expect(config).toHaveProperty('allowRegistration', false);
  });
});
