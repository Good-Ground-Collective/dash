import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { DuplicateProbeNameError } from '#src/health/errors.ts';
import { ProbeHealthCheck } from '#src/health/services/health-check/health-check.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';

class NamedProbe implements HealthProbe {
  readonly name: string;

  constructor(props: { name: string }) {
    this.name = props.name;
  }

  async check(): Promise<void> {}
}

describe('ProbeHealthCheck', () => {
  it('rejects a timeout that is not a positive integer', () => {
    expect(
      () => new ProbeHealthCheck({ probes: [], timeoutMilliseconds: 0 }),
    ).toThrow(ZodError);
  });

  it('rejects two probes with the same name', () => {
    expect(
      () =>
        new ProbeHealthCheck({
          probes: [
            new NamedProbe({ name: 'database' }),
            new NamedProbe({ name: 'database' }),
          ],
        }),
    ).toThrow(DuplicateProbeNameError);
  });
});
