import { test, expect } from '@playwright/test';

test.describe('Theme System', () => {

  test.beforeEach(async ({ page }) => {
    // Clear any saved theme preference so each test starts clean
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('apiforge-theme'));
    await page.reload();
  });

  // ─── 1. Default dark theme ────────────────────────────────
  test('should default to dark theme', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Verify: Dark theme is default', async () => {
      const html = page.locator('html');
      await expect(html).not.toHaveClass(/theme-light/);
      await expect(html).not.toHaveClass(/theme-midnight/);
      const picker = page.locator('[data-testid="theme-select"]');
      await expect(picker).toHaveValue('dark');
      const bgColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      );
      expect(bgColor).toBe('#1e1e2e');
    });
  });

  // ─── 2. Switch to light theme ─────────────────────────────
  test('should switch to light theme', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select light theme', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('light');
    });

    await test.step('Verify: Light theme applied', async () => {
      const html = page.locator('html');
      await expect(html).toHaveClass(/theme-light/);
      await expect(html).not.toHaveClass(/theme-midnight/);
      const bgColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      );
      expect(bgColor).toBe('#f5f5fa');
    });
  });

  // ─── 3. Switch to midnight theme ──────────────────────────
  test('should switch to midnight theme', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select midnight theme', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('midnight');
    });

    await test.step('Verify: Midnight theme applied', async () => {
      const html = page.locator('html');
      await expect(html).toHaveClass(/theme-midnight/);
      await expect(html).not.toHaveClass(/theme-light/);
      const bgColor = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
      );
      expect(bgColor).toBe('#0d0f1a');
    });
  });

  // ─── 4. Persist preference across reload ──────────────────
  test('should persist theme preference across reload', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select light theme', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('light');
      await expect(page.locator('html')).toHaveClass(/theme-light/);
    });

    await test.step('Verify: Theme persists after reload', async () => {
      await page.reload();
      await expect(page.locator('html')).toHaveClass(/theme-light/);
      await expect(page.locator('[data-testid="theme-select"]')).toHaveValue('light');
    });
  });

  // ─── 5. Midnight persists across reload ───────────────────
  test('should persist midnight theme across reload', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Select midnight and reload', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('midnight');
      await page.reload();
    });

    await test.step('Verify: Midnight theme persists', async () => {
      await expect(page.locator('html')).toHaveClass(/theme-midnight/);
      await expect(page.locator('[data-testid="theme-select"]')).toHaveValue('midnight');
    });
  });

  // ─── 6. Theme applies to major UI areas ───────────────────
  test('should apply theme variables to all major UI areas', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Switch to light theme', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('light');
    });

    await test.step('Verify: Theme applied to sidebar, topbar, and body', async () => {
      const sidebar = page.locator('.sidebar');
      await expect(sidebar).toBeVisible();
      const sidebarBg = await sidebar.evaluate(el =>
        getComputedStyle(el).backgroundColor
      );
      expect(sidebarBg).toBe('rgb(245, 245, 250)');

      const topbar = page.locator('.topbar');
      await expect(topbar).toBeVisible();
      const topbarBg = await topbar.evaluate(el =>
        getComputedStyle(el).backgroundColor
      );
      expect(topbarBg).toBe('rgb(255, 255, 255)');

      const bodyBg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor
      );
      expect(bodyBg).toBe('rgb(232, 233, 239)');
    });
  });

  // ─── 7. Can switch back to dark from light ────────────────
  test('should switch back to dark from light', {
    annotation: [
      { type: 'feature', description: 'themes' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'ui' },
    ],
  }, async ({ page }) => {
    await test.step('Action: Switch to light then back to dark', async () => {
      const picker = page.locator('[data-testid="theme-select"]');
      await picker.selectOption('light');
      await expect(page.locator('html')).toHaveClass(/theme-light/);
      await picker.selectOption('dark');
    });

    await test.step('Verify: Dark theme restored', async () => {
      await expect(page.locator('html')).not.toHaveClass(/theme-light/);
      await expect(page.locator('html')).not.toHaveClass(/theme-midnight/);
      await expect(page.locator('[data-testid="theme-select"]')).toHaveValue('dark');
    });
  });

});
