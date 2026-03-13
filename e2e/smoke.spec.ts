import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('renders role selection page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    // Wait for either the loading spinner or the role selector to appear
    await page.waitForSelector('.loading-spinner, [role="button"]', { timeout: 5000 });
  });

  test('page title is accessible', async ({ page }) => {
    await page.goto('/');
    // Check the page has a proper structure
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
