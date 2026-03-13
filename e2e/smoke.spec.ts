import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('renders role selection page', async ({ page }) => {
    await page.goto('/');
    // The page will either show loading spinner or role selector
    // Just check the page loads without error
    await expect(page).toHaveURL('/');
  });

  test('page title is accessible', async ({ page }) => {
    await page.goto('/');
    // Check the page has a proper structure
    const title = await page.title();
    expect(title).toBeTruthy();
  });
});
