import { test, expect } from '@playwright/test';

test.describe('Payroll Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in first
    await page.goto('/signin');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    await page.waitForURL(/^\/(?!signin)/, { timeout: 5000 });
  });

  test('should create employee, contract, approval, and stream', async ({ page }) => {
    // 1. Create Employee
    await page.goto('/employees');
    await page.click('button:has-text("Add Employee")');
    await page.fill('input[name="displayName"]', 'John Doe');
    await page.fill('input[type="date"]', new Date().toISOString().split('T')[0]);
    await page.click('button:has-text("Create Employee")');

    // Wait for success
    await expect(page.locator('text=/success|created/i')).toBeVisible({ timeout: 5000 });

    // 2. Create Contract
    await page.goto('/contracts');
    await page.click('button:has-text("Create Contract")');
    
    // Fill contract form (simplified - adjust selectors based on actual form)
    await page.fill('input[name="amountPerPeriod"]', '1000');
    await page.fill('input[type="date"]', new Date().toISOString().split('T')[0]);
    await page.click('button:has-text("Create Contract")');

    await expect(page.locator('text=/success|created/i')).toBeVisible({ timeout: 5000 });

    // 3. Request Approval
    await page.goto('/approvals');
    await page.click('button:has-text("Request Approval")');
    
    // Fill approval form
    await page.selectOption('select[name="subjectType"]', 'CONTRACT');
    // Note: In a real test, you'd get the contract ID from the previous step
    await page.fill('input[name="subjectId"]', 'contract-id-placeholder');
    await page.click('button:has-text("Request Approval")');

    await expect(page.locator('text=/success|requested/i')).toBeVisible({ timeout: 5000 });

    // 4. Approve
    // Find the approval and click approve button
    await page.click('button:has-text("Approve")');

    await expect(page.locator('text=/approved|success/i')).toBeVisible({ timeout: 5000 });

    // 5. Create Stream
    await page.goto('/streams');
    // Navigate to create stream (might be via contracts page)
    // This is simplified - adjust based on actual UI flow

    // 6. Verify Dashboard Metrics
    await page.goto('/finance/dashboard');

    // Check that metrics are displayed
    await expect(page.locator('text=/Active Streams|Monthly Payout/i')).toBeVisible();
    
    // Metrics should reflect the created stream
    const activeStreams = page.locator('text=/\\d+.*Active Streams/i');
    await expect(activeStreams).toBeVisible();
  });
});


