import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should sign in with email', async ({ page }) => {
    await page.goto('/signin');

    // Fill in email
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');

    // Wait for redirect or success message
    await page.waitForURL(/^\/(?!signin)/, { timeout: 5000 });

    // Should be redirected away from signin page
    expect(page.url()).not.toContain('/signin');
  });
});


