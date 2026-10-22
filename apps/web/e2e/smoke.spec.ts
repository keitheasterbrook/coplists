import { expect, test } from '@playwright/test';

test.describe('SETUP-01 smoke', () => {
  test('serves the placeholder page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Coplist' })).toBeVisible();
  });

  test('serves /api/health', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
