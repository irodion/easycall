import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('renders EasyCall heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'EasyCall' })).toBeVisible();
  });

  test('renders Get Started button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });
});
