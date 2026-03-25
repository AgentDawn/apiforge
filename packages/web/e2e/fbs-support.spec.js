import { test, expect } from '@playwright/test';

const fbsContent = `
namespace MyGame.Sample;

enum Color : byte { Red = 0, Green, Blue = 2 }

table Monster {
  pos:Vec3;
  mana:short = 150;
  hp:short = 100;
  name:string (required);
  friendly:bool = false;
  inventory:[ubyte];
  color:Color = Blue;
  weapons:[Weapon];
}

table Weapon {
  name:string;
  damage:short;
}

table Vec3 {
  x:float;
  y:float;
  z:float;
}

root_type Monster;
`;

// ─── FlatBuffers Parser Tests ─────────────────────────────

test.describe('FlatBuffers Support - Parser', () => {

  test('should parse .fbs file and show tables in sidebar', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'critical' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS file', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => {
        loadFbs(fbs, 'monster.fbs');
      }, fbsContent);
    });

    await test.step('Verify: Tables and Enums shown in sidebar', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('FBS: MyGame');
      await expect(page.locator('.folder-header', { hasText: 'Tables' })).toBeVisible();
      await expect(page.locator('.folder-header', { hasText: 'Enums' })).toBeVisible();
    });
  });

  test('should display table fields with types', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS and click Monster', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => { loadFbs(fbs, 'monster.fbs'); appState.isSpecMode = false; }, fbsContent);
      await page.locator('.folder-header', { hasText: 'Tables' }).click();
      await page.locator('.endpoint-item', { hasText: 'Monster (root)' }).click();
    });

    await test.step('Verify: Monster fields present', async () => {
      const body = await page.getByTestId('body-editor').innerText();
      const parsed = JSON.parse(body);
      expect(parsed).toHaveProperty('pos');
      expect(parsed).toHaveProperty('mana');
      expect(parsed).toHaveProperty('hp');
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('friendly');
      expect(parsed).toHaveProperty('inventory');
      expect(parsed).toHaveProperty('color');
      expect(parsed).toHaveProperty('weapons');
    });
  });

  test('should generate example JSON from table schema', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS and click Monster', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => { loadFbs(fbs, 'monster.fbs'); appState.isSpecMode = false; }, fbsContent);
      await page.locator('.folder-header', { hasText: 'Tables' }).click();
      await page.locator('.endpoint-item', { hasText: 'Monster (root)' }).click();
    });

    await test.step('Verify: Defaults applied correctly', async () => {
      const body = await page.getByTestId('body-editor').innerText();
      const parsed = JSON.parse(body);
      expect(parsed.mana).toBe(150);
      expect(parsed.hp).toBe(100);
      expect(parsed.friendly).toBe(false);
      expect(parsed.name).toBe('string');
      expect(parsed.color).toBe('Blue');
      expect(Array.isArray(parsed.inventory)).toBe(true);
      expect(Array.isArray(parsed.weapons)).toBe(true);
      expect(parsed.pos).toHaveProperty('x');
      expect(parsed.pos).toHaveProperty('y');
      expect(parsed.pos).toHaveProperty('z');
    });
  });

  test('should show enums in sidebar after parsing', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'high' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS file', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => {
        loadFbs(fbs, 'monster.fbs');
      }, fbsContent);
    });

    await test.step('Verify: Enums folder visible with Color enum', async () => {
      const enumsFolder = page.locator('.folder-header', { hasText: 'Enums' });
      await expect(enumsFolder).toBeVisible();
      await enumsFolder.click();
      const enumItem = page.locator('.endpoint-item', { hasText: 'Color' });
      await expect(enumItem).toBeVisible();
    });
  });

  test('should show namespace in collection name', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS file', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => {
        loadFbs(fbs, 'monster.fbs');
      }, fbsContent);
    });

    await test.step('Verify: Collection name contains namespace', async () => {
      await expect(page.getByTestId('collection-name')).toHaveText('FBS: MyGame');
    });
  });

  test('should mark Monster as root type in sidebar', {
    annotation: [
      { type: 'feature', description: 'fbs-support' },
      { type: 'severity', description: 'medium' },
      { type: 'owner', description: 'api' },
    ],
  }, async ({ page }) => {
    await test.step('Setup: Load FBS file', async () => {
      await page.goto('/');
      await page.evaluate((fbs) => {
        loadFbs(fbs, 'monster.fbs');
      }, fbsContent);
    });

    await test.step('Verify: Monster shown as root type in Tables folder', async () => {
      await page.locator('.folder-header', { hasText: 'Tables' }).click();
      const monsterItem = page.locator('.endpoint-item', { hasText: 'Monster (root)' });
      await expect(monsterItem).toBeVisible();
    });
  });
});
