import { agentHeartbeat } from '#src/messages/agent-heartbeat.js';
import { benchCommand } from '#src/messages/bench-command.js';
import { benchCommandResult } from '#src/messages/bench-command-result.js';
import { benchConfig } from '#src/messages/bench-config.js';
import { benchHarnesses } from '#src/messages/bench-harnesses.js';
import { benchInfo } from '#src/messages/bench-info.js';
import { benchMetrics } from '#src/messages/bench-metrics.js';
import { benchProcesses } from '#src/messages/bench-processes.js';
import { examplePing } from '#src/messages/example.js';

/** Every message kind with its current schema and version. The JSON Schema generator walks this list. */
export const messageRegistry = [
  examplePing,
  agentHeartbeat,
  benchInfo,
  benchMetrics,
  benchProcesses,
  benchHarnesses,
  benchConfig,
  benchCommand,
  benchCommandResult,
] as const;

export type RegisteredMessage = (typeof messageRegistry)[number];
