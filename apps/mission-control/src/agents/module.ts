import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AgentHeartbeatsRoutes } from '#src/agents/exposures/agent-heartbeats/agent-heartbeats-routes.ts';
import { NeedsYouRoutes } from '#src/agents/exposures/needs-you/needs-you-routes.ts';
import { AgentSessionsRoutes } from '#src/agents/exposures/agent-sessions/agent-sessions-routes.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { AgentSessionRepository } from '#src/agents/repositories/agent-sessions/agent-session-repository.ts';
import type { NeedsYouItemRepository } from '#src/agents/repositories/needs-you-items/needs-you-item-repository.ts';
import { AgentHeartbeatRetentionWorkflows } from '#src/agents/services/agent-heartbeat-retention-workflows/agent-heartbeat-retention-workflows.ts';
import { PublishingAgentSessionWatchdog } from '#src/agents/services/agent-session-watchdog/agent-session-watchdog.ts';
import { AgentSessionWatchdogWorkflows } from '#src/agents/services/agent-session-watchdog-workflows/agent-session-watchdog-workflows.ts';
import {
  type AgentHeartbeats,
  CallerCheckedAgentHeartbeats,
} from '#src/agents/services/agent-heartbeats/agent-heartbeats.ts';
import { RulesNeedsYouTriage } from '#src/agents/services/needs-you-triage/needs-you-triage.ts';
import type { AgentAuthentication } from '#src/auth/exposures/api-key-authentication/api-key-authentication.ts';
import type { Identity } from '#src/auth/services/identity/identity.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';
import type { HttpModule } from '#src/platform/contracts/http-module.ts';
import type { WorkflowModule } from '#src/platform/contracts/workflow-module.ts';

const agentsModulePropsSchema = z.object({
  authentication: z.custom<AgentAuthentication>(),
  identity: z.custom<Pick<Identity, 'session'>>(),
  heartbeatRepository: z.custom<AgentHeartbeatRepository>(),
  sessionRepository: z.custom<AgentSessionRepository>(),
  needsYouRepository: z.custom<NeedsYouItemRepository>(),
  liveEvents: z.custom<LiveEvents>(),
});

/**
 * Agent sessions: `agent.heartbeat` messages that agents send with service account keys, the
 * current state of each session and subagent they keep, and `GET /api/agents/sessions` for
 * signed-in people. Heartbeats that need input open Needs you items, served at `GET /api/needs-you`.
 * Raw heartbeats are kept for 30 days. A working agent that goes quiet is marked stale, then lost.
 */
export class AgentsModule implements HttpModule, WorkflowModule {
  readonly plugin: FastifyPluginAsyncZod;
  readonly heartbeats: AgentHeartbeats;
  private readonly retention: AgentHeartbeatRetentionWorkflows;
  private readonly watchdog: AgentSessionWatchdogWorkflows;

  constructor(input: z.input<typeof agentsModulePropsSchema>) {
    const props = agentsModulePropsSchema.parse(input);
    const triage = new RulesNeedsYouTriage({
      repository: props.needsYouRepository,
      liveEvents: props.liveEvents,
    });
    this.heartbeats = new CallerCheckedAgentHeartbeats({
      repository: props.heartbeatRepository,
      liveEvents: props.liveEvents,
      triage,
    });
    this.retention = new AgentHeartbeatRetentionWorkflows({
      repository: props.heartbeatRepository,
    });
    this.watchdog = new AgentSessionWatchdogWorkflows({
      watchdog: new PublishingAgentSessionWatchdog({
        repository: props.sessionRepository,
        liveEvents: props.liveEvents,
        triage,
      }),
    });

    const heartbeatRoutes = new AgentHeartbeatsRoutes({
      authentication: props.authentication,
      heartbeats: this.heartbeats,
    });
    const sessionRoutes = new AgentSessionsRoutes({
      sessions: props.sessionRepository,
      identity: props.identity,
    });
    const needsYouRoutes = new NeedsYouRoutes({
      items: props.needsYouRepository,
      identity: props.identity,
    });
    this.plugin = async (app) => {
      heartbeatRoutes.register(app);
      sessionRoutes.register(app);
      needsYouRoutes.register(app);
    };
  }

  async activate(): Promise<void> {
    await this.retention.activate();
    await this.watchdog.activate();
  }

  registerWorkflows(): void {
    this.retention.registerWorkflows();
    this.watchdog.registerWorkflows();
  }
}
