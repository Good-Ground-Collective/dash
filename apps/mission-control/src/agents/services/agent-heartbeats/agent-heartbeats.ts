import type {
  AgentHeartbeat,
  AgentHeartbeatBody,
} from '#src/agents/contracts/agent-heartbeat.ts';
import { AgentMismatchError } from '#src/agents/errors.ts';
import type { AgentHeartbeatRepository } from '#src/agents/repositories/agent-heartbeats/agent-heartbeat-repository.ts';
import type { AgentCaller } from '#src/auth/contracts/service-account.ts';

export interface AgentHeartbeats {
  /** Records that `agentName` is alive. An agent key may report only as itself; a bench key reports for agents on its bench. */
  report(props: {
    caller: AgentCaller;
    agentName: string;
    body: AgentHeartbeatBody;
  }): Promise<AgentHeartbeat>;
}

export class CallerCheckedAgentHeartbeats implements AgentHeartbeats {
  private readonly repository: AgentHeartbeatRepository;

  constructor(props: { repository: AgentHeartbeatRepository }) {
    this.repository = props.repository;
  }

  async report(props: {
    caller: AgentCaller;
    agentName: string;
    body: AgentHeartbeatBody;
  }): Promise<AgentHeartbeat> {
    const { account } = props.caller;
    if (account.kind === 'agent' && account.agentName !== props.agentName) {
      throw new AgentMismatchError({
        own: account.agentName,
        named: props.agentName,
      });
    }

    const sentAt = props.body?.sentAt;
    return this.repository.record({
      agentName: props.agentName,
      benchId: account.kind === 'bench' ? account.benchId : null,
      reportedBy: props.caller.principalId,
      sentAt: sentAt === undefined ? null : new Date(sentAt),
    });
  }
}
