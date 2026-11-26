import { expect, test } from '@playwright/test';

test('answers the healthcheck while Mission Control is unreachable', async ({
  request,
}) => {
  const response = await request.get('/healthz');

  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('ok');
  expect(response.headers()['cache-control']).toBe('no-store');
});
