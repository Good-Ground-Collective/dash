import type { BriefingRunning } from '#src/briefing/contracts/briefings.ts';
import type { BriefingWorkflows } from '#src/briefing/services/briefing-workflows/briefing-workflows.ts';

/** Takes one run per person and keeps it in flight until the test finishes it, as the queue does. */
export class FakeBriefingWorkflows implements BriefingWorkflows {
  readonly requests: { userId: string; trigger: 'scheduled' | 'manual' }[] = [];
  private readonly inFlight = new Map<string, BriefingRunning>();
  private nextRun = 1;

  async regenerate(props: {
    userId: string;
    trigger: 'scheduled' | 'manual';
  }): Promise<{ runId: string }> {
    this.requests.push(props);
    const existing = this.inFlight.get(props.userId);
    if (existing !== undefined) {
      return { runId: existing.runId };
    }
    const run = {
      runId: `run-${this.nextRun++}`,
      startedAt: '2026-11-27T09:00:00.000Z',
    };
    this.inFlight.set(props.userId, run);
    return { runId: run.runId };
  }

  async running(props: { userId: string }): Promise<BriefingRunning | null> {
    return this.inFlight.get(props.userId) ?? null;
  }

  finish(userId: string): void {
    this.inFlight.delete(userId);
  }

  registerWorkflows(): void {}

  async activate(): Promise<void> {}
}
