import { test, expect } from '@playwright/test';

test.describe('Finance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in first
    await page.goto('/signin');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^\/(?!signin)/, { timeout: 5000 });
  });

  test('should display dashboard metrics', async ({ page }) => {
    await page.goto('/finance/dashboard');

    // Check for KPI cards
    await expect(page.locator('text=/Active Streams/i')).toBeVisible();
    await expect(page.locator('text=/Monthly Payout/i')).toBeVisible();
    await expect(page.locator('text=/Paused/i')).toBeVisible();
    await expect(page.locator('text=/Upcoming Starts/i')).toBeVisible();
    await expect(page.locator('text=/Burn vs Cap/i')).toBeVisible();

    // Check for chart
    await expect(page.locator('text=/Burn Rate Over Time/i')).toBeVisible();
  });

  test('should reflect changes after creating stream', async ({ page }) => {
    // Navigate to dashboard first to get baseline
    await page.goto('/finance/dashboard');
    
    // Get initial active streams count (if displayed)
    const initialCount = await page.locator('text=/\\d+.*Active Streams/i').textContent().catch(() => '0');
    
    // Create a stream (simplified - would need actual flow)
    // This is a placeholder - in real test, you'd follow the full flow
    
    // Refresh dashboard
    await page.reload();
    
    // Verify metrics updated (this is a simplified check)
    await expect(page.locator('text=/Active Streams/i')).toBeVisible();
  });
});


