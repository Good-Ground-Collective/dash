import type { HealthGauge } from '#src/platform/contracts/health-gauge.ts';
import type { StrandedWorkflowRecovery } from '#src/platform/services/workflows/stranded-workflow-recovery.ts';

/** How many queued workflows from another version this version cannot run, for `/healthz`. They are never moved and the sweep only warns about them every 15 minutes, so this makes them visible between warnings. Zero is the normal answer; it is informational and never fails health. */
export class UnregisteredStrandedWorkflowGauge implements HealthGauge {
  readonly name = 'unregisteredStrandedWorkflows';
  private readonly recovery: StrandedWorkflowRecovery;

  constructor(props: { recovery: StrandedWorkflowRecovery }) {
    this.recovery = props.recovery;
  }

  async read(): Promise<number> {
    return this.recovery.countUnregistered();
  }
}
