import { describe, expect, it } from 'vitest';

import type { Heartbeat } from '#src/heartbeat/contracts/heartbeat.ts';
import type { HeartbeatRecorder } from '#src/heartbeat/services/heartbeat-recorder/heartbeat-recorder.ts';
import { HeartbeatWorkflows } from '#src/heartbeat/services/heartbeat-workflows/heartbeat-workflows.ts';
import { WorkflowRuntimeError } from '#src/platform/errors.ts';

class FixedRecorder implements HeartbeatRecorder {
  async record(props: { firedAt: Date }): Promise<Heartbeat> {
    return {
      id: '00000000-0000-4000-8000-000000000000',
      firedAt: props.firedAt.toISOString(),
      recordedAt: props.firedAt.toISOString(),
    };
  }
}

describe('HeartbeatWorkflows', () => {
  it('refuses to activate before its workflows are registered', async () => {
    const workflows = new HeartbeatWorkflows({
      recorder: new FixedRecorder(),
    });

    await expect(workflows.activate()).rejects.toThrow(WorkflowRuntimeError);
  });
});
