import { z } from 'zod';

import type { HealthReport } from '#src/health/contracts/health-report.ts';
import { DuplicateProbeNameError } from '#src/health/errors.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';

export const probeHealthCheckPropsSchema = z.object({
  timeoutMilliseconds: z.number().int().positive().default(2000),
});

export interface HealthCheck {
  run(): Promise<HealthReport>;
}

/**
 * Runs every probe concurrently, so one failure doesn't hide another, and counts a probe
 * that outlasts `timeoutMilliseconds` as failing so `/healthz` answers promptly.
 */
export class ProbeHealthCheck implements HealthCheck {
  private readonly probes: readonly HealthProbe[];
  private readonly timeoutMilliseconds: number;

  constructor(
    props: { probes: readonly HealthProbe[] } & z.input<
      typeof probeHealthCheckPropsSchema
    >,
  ) {
    const seen = new Set<string>();
    for (const probe of props.probes) {
      if (seen.has(probe.name)) {
        throw new DuplicateProbeNameError({ probeName: probe.name });
      }
      seen.add(probe.name);
    }
    this.probes = props.probes;
    this.timeoutMilliseconds = probeHealthCheckPropsSchema.parse({
      timeoutMilliseconds: props.timeoutMilliseconds,
    }).timeoutMilliseconds;
  }

  async run(): Promise<HealthReport> {
    const results = await Promise.allSettled(
      this.probes.map((probe) => this.withTimeout(probe)),
    );

    const checks = Object.fromEntries(
      this.probes.map((probe, index) => [
        probe.name,
        results[index]?.status === 'fulfilled' ? 'ok' : 'failing',
      ]),
    ) satisfies HealthReport['checks'];

    const healthy = Object.values(checks).every((status) => status === 'ok');
    return { status: healthy ? 'ok' : 'unavailable', checks };
  }

  private async withTimeout(probe: HealthProbe): Promise<void> {
    const signal = AbortSignal.timeout(this.timeoutMilliseconds);
    const timedOut = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });
    await Promise.race([probe.check(), timedOut]);
  }
}
