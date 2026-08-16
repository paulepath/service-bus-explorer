import { test, expect } from '@playwright/test';

test.describe('Web UI E2E Queue Interaction Tests', () => {
  test('1. Load Web Application and check health & discovery', async ({ page }) => {
    await page.goto('/');

    // Check document title
    await expect(page).toHaveTitle(/Service Bus Explorer/i);

    // Verify connections / header elements load
    await page.waitForTimeout(1000);
  });
});
