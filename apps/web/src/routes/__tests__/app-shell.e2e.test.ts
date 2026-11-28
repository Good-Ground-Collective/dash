import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('renders the shell in light mode by default', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      'characters',
    );
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');

    await expect(page.getByRole('link', { name: 'Dash' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
    for (const label of ['Objectives', 'Benches']) {
      await expect(nav.locator('li', { hasText: label })).toHaveText(
        `${label} (not built yet)`,
      );
    }
    await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /^Good (morning|afternoon|evening)$/u,
    );
    await expect(
      page.getByRole('button', { name: 'Needs you, 0 waiting' }),
    ).toBeVisible();
  });

  test('renders dark mode from the mode cookie during server rendering', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'dash-mode', value: 'dark', url: baseURL ?? '' },
    ]);
    const response = await page.request.get('/');

    expect(await response.text()).toContain('data-mode="dark"');
  });

  test('still renders when Mission Control is unreachable with a session cookie', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: 'stale', url: baseURL ?? '' },
    ]);
    await page.goto('/');

    await expect(page.getByRole('img', { name: 'Signed out' })).toBeVisible();
  });

  test('opens the search dialog and the needs-you panel', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Needs you/u }).click();
    await expect(page.getByText('Nothing needs you right now.')).toBeVisible();
  });
});

test('links the feed page from the primary nav', async ({ page }) => {
  await page.goto('/');

  await expect(
    page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'GitHub' }),
  ).toHaveAttribute('href', '/github');
});
