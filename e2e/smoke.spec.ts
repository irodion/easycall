import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('renders role selection page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    // Wait for the app to render — either a button (RoleSelector) or loading indicator
    await page.locator('button, .loading').first().waitFor({ timeout: 10_000 });
  });

  test('page title is accessible', async ({ page }) => {
    await page.goto('/');
    // Check the page has a proper structure
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
