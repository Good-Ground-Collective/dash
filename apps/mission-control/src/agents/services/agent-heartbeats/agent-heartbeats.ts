import { z } from 'zod';

import type {
  AgentHeartbeatBatchItem,
  AgentHeartbeatBatchResult,
  AgentHeartbeatMessage,
  AgentHeartbeatReport,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { AgentMismatchError } from '#src/agents/errors.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { AgentCaller } from '#src/auth/contracts/service-account.ts';
import type { LiveEvents } from '#src/live/services/live-events/live-events.ts';

const callerCheckedAgentHeartbeatsPropsSchema = z.object({
  repository: z.custom<AgentHeartbeatRepository>(),
  liveEvents: z.custom<LiveEvents>(),
});

export interface AgentHeartbeats {
  /** Stores a heartbeat for `agentName` and moves its session state forward. An agent key may report only as itself. A bench key may report any agent name, including one that also has an agent account: agents aren't registered to benches yet, and the stored `benchId` tells the two apart. */
  report(props: {
    caller: AgentCaller;
    agentName: string;
    message: AgentHeartbeatMessage;
  }): Promise<AgentHeartbeatReport>;
  /** Stores each valid heartbeat in order, as `report` does, and answers one result per item. The caller check applies to the whole batch. */
  reportBatch(props: {
    caller: AgentCaller;
    agentName: string;
    items: AgentHeartbeatBatchItem[];
  }): Promise<AgentHeartbeatBatchResult[]>;
}

/** Publishes `agent.session.updated` each time a heartbeat moves a session or subagent forward. */
export class CallerCheckedAgentHeartbeats implements AgentHeartbeats {
  private readonly repository: AgentHeartbeatRepository;
  private readonly liveEvents: LiveEvents;

  constructor(props: z.input<typeof callerCheckedAgentHeartbeatsPropsSchema>) {
    const parsed = callerCheckedAgentHeartbeatsPropsSchema.parse(props);
    this.repository = parsed.repository;
    this.liveEvents = parsed.liveEvents;
  }

  async report(props: {
    caller: AgentCaller;
    agentName: string;
    message: AgentHeartbeatMessage;
  }): Promise<AgentHeartbeatReport> {
    CallerCheckedAgentHeartbeats.checkCaller(props);
    return this.store(props);
  }

  async reportBatch(props: {
    caller: AgentCaller;
    agentName: string;
    items: AgentHeartbeatBatchItem[];
  }): Promise<AgentHeartbeatBatchResult[]> {
    CallerCheckedAgentHeartbeats.checkCaller(props);

    const results: AgentHeartbeatBatchResult[] = [];
    for (const item of props.items) {
      results.push(
        item.valid
          ? await this.store({ ...props, message: item.message })
          : { outcome: 'invalid', issues: item.issues },
      );
    }
    return results;
  }

  private async store(props: {
    caller: AgentCaller;
    agentName: string;
    message: AgentHeartbeatMessage;
  }): Promise<AgentHeartbeatReport> {
    const { account } = props.caller;
    const recorded = await this.repository.record({
      agentName: props.agentName,
      benchId: account.kind === 'bench' ? account.benchId : null,
      reportedBy: props.caller.principalId,
      message: props.message,
    });

    if (recorded.session !== null) {
      this.liveEvents.publish({
        type: 'agent.session.updated',
        data: z.json().parse(recorded.session),
      });
    }
    return { outcome: recorded.outcome, heartbeat: recorded.heartbeat };
  }

  private static checkCaller(props: {
    caller: AgentCaller;
    agentName: string;
  }): void {
    const { account } = props.caller;
    if (account.kind === 'agent' && account.agentName !== props.agentName) {
      throw new AgentMismatchError({
        own: account.agentName,
        named: props.agentName,
      });
    }
  }
}
