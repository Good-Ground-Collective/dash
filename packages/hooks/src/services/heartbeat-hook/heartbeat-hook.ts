import type { AgentHeartbeat } from '@good-ground-collective/agentic-communication-standards';
import { z } from 'zod';

import { HooksConfig } from '#src/config/hooks-config.js';
import { HookEventNames } from '#src/contracts/hook-event-names.js';
import { hookInputSchema } from '#src/contracts/hook-input.js';
import { jsonLineSchema } from '#src/contracts/json-line.js';
import { HeartbeatMapper } from '#src/services/heartbeat-mapper/heartbeat-mapper.js';
import { FileHookLog, type HookLog } from '#src/services/hook-log/hook-log.js';
import { OutboxRetention } from '#src/services/outbox-retention/outbox-retention.js';
import {
  FileSessionLedger,
  type SessionLedger,
} from '#src/services/session-ledger/session-ledger.js';

const hookStdinSchema = jsonLineSchema.pipe(hookInputSchema);

const claudeCodeHeartbeatHookPropsSchema = z.object({
  config: z.instanceof(HooksConfig),
});

export type ClaudeCodeHeartbeatHookProps = z.input<
  typeof claudeCodeHeartbeatHookPropsSchema
>;

/** One hook invocation: a subcommand naming the event, the hook's stdin, and the time it ran. */
export interface HookInvocation {
  command: string | undefined;
  stdin: string;
  now: Date;
}

/** Turns one Claude Code hook invocation into at most one heartbeat in the outbox. */
export interface HeartbeatHook {
  /** Never rejects: any failure goes to the hook log, so the agent's turn carries on. */
  handle(invocation: HookInvocation): Promise<AgentHeartbeat | undefined>;
}

export class ClaudeCodeHeartbeatHook implements HeartbeatHook {
  private readonly config: HooksConfig;
  private readonly ledger: SessionLedger;
  private readonly log: HookLog;

  constructor(props: ClaudeCodeHeartbeatHookProps) {
    const { config } = claudeCodeHeartbeatHookPropsSchema.parse(props);

    this.config = config;
    this.ledger = new FileSessionLedger({ config });
    this.log = new FileHookLog({ logPath: config.logPath });
  }

  async handle(
    invocation: HookInvocation,
  ): Promise<AgentHeartbeat | undefined> {
    try {
      return await this.write(invocation);
    } catch (cause) {
      this.log.failure({
        event: invocation.command ?? '',
        cause,
        now: invocation.now,
      });
      return undefined;
    }
  }

  private async write(
    invocation: HookInvocation,
  ): Promise<AgentHeartbeat | undefined> {
    const event = HookEventNames.fromCommand(invocation.command);
    const input = hookStdinSchema.parse(invocation.stdin.trim());

    if (event === 'SessionStart') {
      await OutboxRetention.prune(this.config, invocation.now);
    }

    const plan = HeartbeatMapper.plan({
      event,
      input,
      machine: this.config.machine,
    });
    return plan === undefined
      ? undefined
      : this.ledger.record(plan, invocation.now);
  }
}
