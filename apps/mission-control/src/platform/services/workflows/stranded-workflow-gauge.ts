import type { HealthGauge } from '#src/platform/contracts/health-gauge.ts';
import type { StrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

/** How many queued workflows a deploy has stranded, for `/healthz`. Zero is the normal answer; it is informational and never fails health. It shares the runtime's recovery, so it reports exactly what the sweep would move. Listing the queued workflows on every probe is cheap: inputs and outputs are not loaded, and the queues hold few workflows. The unregistered-work gauge lists them too, so each `/healthz` probe scans twice, and the two numbers can come from different snapshots. */
export class StrandedWorkflowGauge implements HealthGauge {
  readonly name = 'strandedWorkflows';
  private readonly recovery: StrandedWorkflowRecovery;

  constructor(props: { recovery: StrandedWorkflowRecovery }) {
    this.recovery = props.recovery;
  }

  async read(): Promise<number> {
    return this.recovery.count();
  }
}
