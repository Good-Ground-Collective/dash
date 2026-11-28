import { DBOS } from '@dbos-inc/dbos-sdk';

import type { HealthGauge } from '#src/platform/contracts/health-gauge.ts';

/** Whether this container holds the "latest" application version, for `/healthz`: 1 when it does, 0 when it does not. Only the container holding it enqueues the schedules and moves stranded work, so 0 after a failed deploy or a restart that left the marker with a newer version means work has stopped; it is informational and never fails health. */
export class LatestVersionGauge implements HealthGauge {
  readonly name = 'holdsLatestVersion';

  async read(): Promise<number> {
    const latest = await DBOS.getLatestApplicationVersion();
    return latest.versionName === DBOS.applicationVersion ? 1 : 0;
  }
}
