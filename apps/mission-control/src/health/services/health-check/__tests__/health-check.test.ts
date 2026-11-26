import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { ProbeHealthCheck } from '#src/health/services/health-check/health-check.ts';

describe('ProbeHealthCheck', () => {
  it('rejects a timeout that is not a positive integer', () => {
    expect(
      () => new ProbeHealthCheck({ probes: [], timeoutMilliseconds: 0 }),
    ).toThrow(ZodError);
  });
});
