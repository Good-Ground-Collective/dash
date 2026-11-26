import { describe, expect, it } from 'vitest';
import { Liveness } from '#lib/server/liveness.ts';

describe('Liveness', () => {
  it('answers ok as uncached plain text', async () => {
    const response = new Liveness().respond();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
  });
});
