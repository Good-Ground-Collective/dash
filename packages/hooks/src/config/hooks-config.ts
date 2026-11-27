import { homedir, hostname } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

const absolutePathSchema = z.string().regex(/^\//);

const environmentSchema = z.object({
  DASH_STATE_DIR: absolutePathSchema
    .optional()
    .catch(undefined)
    .describe('Overrides the whole state directory: outbox, sessions and log.'),
  XDG_STATE_HOME: absolutePathSchema
    .optional()
    .catch(undefined)
    .describe('The XDG base directory for state; ignored unless absolute.'),
  DASH_OUTBOX_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(7)
    .catch(7)
    .describe('How many days an untouched session outbox file is kept.'),
});

const hooksConfigPropsSchema = z.object({
  stateDirectory: z
    .string()
    .min(1)
    .describe(
      'Holds `outbox/`, `sessions/` and `hooks.log`. Defaults to `$XDG_STATE_HOME/dash`.',
    ),
  outboxRetentionDays: z.int().positive().default(7),
  sessionRetentionDays: z
    .int()
    .positive()
    .default(180)
    .describe(
      'Session counters outlive the outbox so a session resumed weeks later keeps counting up.',
    ),
  livenessIntervalMs: z
    .int()
    .nonnegative()
    .default(60_000)
    .describe(
      'The least time between two `working` liveness heartbeats from tool calls in one session.',
    ),
  machine: z.string().min(1).max(256).optional(),
});

export type HooksConfigProps = z.input<typeof hooksConfigPropsSchema>;

/** Where the hooks keep their state and how long they keep it. */
export class HooksConfig {
  readonly stateDirectory: string;
  readonly outboxRetentionDays: number;
  readonly sessionRetentionDays: number;
  readonly livenessIntervalMs: number;
  readonly machine: string | undefined;

  constructor(props: HooksConfigProps) {
    const valid = hooksConfigPropsSchema.parse(props);

    this.stateDirectory = valid.stateDirectory;
    this.outboxRetentionDays = valid.outboxRetentionDays;
    this.sessionRetentionDays = valid.sessionRetentionDays;
    this.livenessIntervalMs = valid.livenessIntervalMs;
    this.machine = valid.machine;
  }

  /** One JSONL file per session, appended to by the hooks and read by the relay. */
  get outboxDirectory(): string {
    return path.join(this.stateDirectory, 'outbox');
  }

  /** One small JSON file per session holding its `seq` counter, kept apart so the relay never reads it. */
  get sessionsDirectory(): string {
    return path.join(this.stateDirectory, 'sessions');
  }

  get logPath(): string {
    return path.join(this.stateDirectory, 'hooks.log');
  }

  /** Reads the process environment; a value that doesn't parse falls back to its default rather than failing the hook. */
  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
  ): HooksConfig {
    const env = environmentSchema.parse(environment);
    const stateHome =
      env.XDG_STATE_HOME ?? path.join(homedir(), '.local', 'state');

    return new HooksConfig({
      stateDirectory: env.DASH_STATE_DIR ?? path.join(stateHome, 'dash'),
      outboxRetentionDays: env.DASH_OUTBOX_RETENTION_DAYS,
      machine: hostname().slice(0, 256) || undefined,
    });
  }
}
