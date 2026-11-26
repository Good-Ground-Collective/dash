import type { HealthReport } from '#src/health/contracts/health-report.ts';
import type { HealthProbe } from '#src/platform/contracts/health-probe.ts';

/** Runs every probe concurrently and reports each one, so one failure doesn't hide another. */
export class HealthCheck {
  private readonly probes: readonly HealthProbe[];

  constructor(props: { probes: readonly HealthProbe[] }) {
    this.probes = props.probes;
  }

  async run(): Promise<HealthReport> {
    const results = await Promise.allSettled(
      this.probes.map((probe) => probe.check()),
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
}
