import { describe, expect, it } from 'vitest';

import { AgentSessionWatchdogNotRegisteredError } from '#src/agents/errors.ts';
import type { AgentSessionWatchdog } from '#src/agents/services/agent-session-watchdog/agent-session-watchdog.ts';
import { AgentSessionWatchdogWorkflows } from '#src/agents/services/agent-session-watchdog-workflows/agent-session-watchdog-workflows.ts';

class IdleWatchdog implements AgentSessionWatchdog {
  async sweep(): Promise<number> {
    return 0;
  }
}

describe('AgentSessionWatchdogWorkflows', () => {
  it('refuses to activate before its workflow is registered', async () => {
    const workflows = new AgentSessionWatchdogWorkflows({
      watchdog: new IdleWatchdog(),
    });

    await expect(workflows.activate()).rejects.toThrow(
      AgentSessionWatchdogNotRegisteredError,
    );
  });
});
