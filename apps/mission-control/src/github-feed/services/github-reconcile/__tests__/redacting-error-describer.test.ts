import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RedactingErrorDescriber } from '#src/github-feed/services/github-reconcile/redacting-error-describer.ts';

class ProviderError extends Error {
  override name = 'ProviderError';
  readonly status = 502;
  readonly code = 'ECONNRESET';
}

describe('RedactingErrorDescriber', () => {
  const describer = new RedactingErrorDescriber();

  it('names the error class with its code and status', () => {
    expect(describer.describe(new ProviderError('bad gateway'))).toBe(
      'ProviderError [code ECONNRESET, status 502]: bad gateway',
    );
  });

  it('names the class of the cause', () => {
    const error = new Error('read failed', { cause: new TypeError('x') });

    expect(describer.describe(error)).toBe(
      'Error: read failed (caused by TypeError)',
    );
  });

  it('lists where a validation error failed without the rejected values', () => {
    const parsed = z
      .object({ repo: z.object({ id: z.number() }) })
      .safeParse({ repo: { id: 'secret-value' } });
    const error = parsed.error ?? new Error('expected a validation error');

    const described = describer.describe(error);

    expect(described).toBe('ZodError: repo.id invalid_type');
    expect(described).not.toContain('secret-value');
  });

  it('keeps only a bounded first line of the message', () => {
    const described = describer.describe(
      new Error(`${'a'.repeat(500)}\nsecond line`),
    );

    expect(described).not.toContain('second line');
    expect(described.length).toBeLessThan(260);
  });

  it.each([
    ['ghs_abc123DEF', 'installation token'],
    ['ghp_abc123DEF', 'personal token'],
    ['gho_abc123DEF', 'oauth token'],
    ['ghu_abc123DEF', 'user token'],
    ['ghr_abc123DEF', 'refresh token'],
    ['github_pat_11ABC_def456', 'fine-grained token'],
    ['token abc123secret', 'token header'],
    ['Bearer abc123secret', 'bearer header'],
  ])('redacts %s', (secret, label) => {
    const described = describer.describe(
      new Error(`request with ${label} ${secret} rejected`),
    );

    expect(described).toContain('[redacted]');
    expect(described).not.toContain('abc123');
    expect(described).not.toContain('def456');
  });

  it('drops request URLs', () => {
    const described = describer.describe(
      new Error('fetch https://api.github.com/app/installations/1 failed'),
    );

    expect(described).toBe('Error: fetch [url] failed');
  });
});
