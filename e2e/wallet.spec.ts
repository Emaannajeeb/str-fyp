import { test, expect } from '@playwright/test';

test.describe('Wallet Management', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in first (stub)
    await page.goto('/signin');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^\/(?!signin)/, { timeout: 5000 });
  });

  test('should link a wallet (mock)', async ({ page }) => {
    await page.goto('/settings/wallets');

    // Select mock wallet provider
    const providerSelect = page.locator('select').first();
    await providerSelect.selectOption({ label: /Mock/i });

    // Click connect button
    await page.click('button:has-text("Connect")');

    // Wait for success message or wallet to appear
    await expect(page.locator('text=/connected|wallet/i')).toBeVisible({ timeout: 5000 });
  });
});


