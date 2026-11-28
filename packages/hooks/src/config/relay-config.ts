import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';

import { z } from 'zod';

import { jsonLineSchema } from '#src/contracts/json-line.js';
import {
  RelayConfigExposedError,
  RelayConfigInvalidError,
} from '#src/errors.js';

const absolutePathSchema = z.string().regex(/^\//);

const relaySettingsSchema = z.object({
  apiUrl: z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      const url = new URL(value);
      return url.username === '' && url.password === '';
    }, 'must not carry credentials')
    .describe("Dash's API, such as `https://dash.example.com`."),
  apiKey: z
    .string()
    .regex(/^dash_[\x21-\x7e]+$/)
    .describe(
      'A service account key with `heartbeat:write`, printable ASCII only so it is safe in a header.',
    ),
  reporterName: z
    .string()
    .regex(/^[\w.-]+$/u)
    .max(100)
    .describe(
      'The agent name the key belongs to, such as `seth-laptop`. Heartbeats are reported under it.',
    ),
});

const relayFileSchema = jsonLineSchema.pipe(
  z.looseObject({
    apiUrl: z.string().optional(),
    apiKey: z.string().optional(),
    reporterName: z.string().optional(),
  }),
);

const relayEnvironmentSchema = z.object({
  DASH_API_URL: z.string().min(1).optional(),
  DASH_API_KEY: z.string().min(1).optional(),
  DASH_REPORTER_NAME: z.string().min(1).optional(),
  XDG_CONFIG_HOME: absolutePathSchema.optional().catch(undefined),
  DASH_RELAY_IDLE_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .catch(undefined)
    .describe(
      'How long a drained relay waits for more heartbeats before it exits.',
    ),
});

const relayConfigPropsSchema = relaySettingsSchema.extend({
  idleExitMs: z.int().nonnegative().default(30_000),
});

export type RelayConfigProps = z.input<typeof relayConfigPropsSchema>;

/**
 * Where the relay sends heartbeats and the key it sends them with. It comes from
 * `$XDG_CONFIG_HOME/dash/hooks.json` (falling back to `~/.config/dash/hooks.json`), which must be
 * readable by its owner only, and each `DASH_API_URL`, `DASH_API_KEY` or `DASH_REPORTER_NAME`
 * variable overrides its field. The key stays out of `JSON.stringify` and `console.log` output.
 */
export class RelayConfig {
  readonly apiUrl: string;
  readonly apiKey: string;
  readonly reporterName: string;
  readonly idleExitMs: number;

  constructor(props: RelayConfigProps) {
    const valid = relayConfigPropsSchema.parse(props);

    this.apiUrl = valid.apiUrl;
    this.apiKey = valid.apiKey;
    this.reporterName = valid.reporterName;
    this.idleExitMs = valid.idleExitMs;
  }

  /** The batch ingest route for this reporter. */
  get batchUrl(): string {
    const base = this.apiUrl.replace(/\/+$/, '');
    return `${base}/api/agents/${encodeURIComponent(this.reporterName)}/heartbeats/batch`;
  }

  /** Identifies this URL, reporter and key without revealing the key, so a refused key is remembered until it changes. */
  get fingerprint(): string {
    return createHash('sha256')
      .update(`${this.apiUrl}\n${this.reporterName}\n${this.apiKey}`)
      .digest('hex');
  }

  toJSON() {
    return {
      apiUrl: this.apiUrl,
      reporterName: this.reporterName,
      idleExitMs: this.idleExitMs,
    };
  }

  [inspect.custom]() {
    return this.toJSON();
  }

  /** The configuration file's path for this environment. */
  static configPath(environment: NodeJS.ProcessEnv = process.env): string {
    const configHome =
      relayEnvironmentSchema.parse(environment).XDG_CONFIG_HOME ??
      path.join(homedir(), '.config');
    return path.join(configHome, 'dash', 'hooks.json');
  }

  /** The relay's configuration, or `undefined` when nothing configures it, in which case no relay runs. */
  static async load(
    environment: NodeJS.ProcessEnv = process.env,
  ): Promise<RelayConfig | undefined> {
    const env = relayEnvironmentSchema.parse(environment);
    const configPath = RelayConfig.configPath(environment);
    const file = await RelayConfig.readOwnerOnlyFile(configPath);

    const settings = {
      apiUrl: env.DASH_API_URL ?? file?.apiUrl,
      apiKey: env.DASH_API_KEY ?? file?.apiKey,
      reporterName: env.DASH_REPORTER_NAME ?? file?.reporterName,
    };
    if (Object.values(settings).every((value) => value === undefined)) {
      return undefined;
    }

    const parsed = relaySettingsSchema.safeParse(settings);
    if (!parsed.success) {
      throw new RelayConfigInvalidError({
        configPath,
        fields: [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
        ],
      });
    }
    return new RelayConfig({
      ...parsed.data,
      idleExitMs: env.DASH_RELAY_IDLE_MS,
    });
  }

  /** The file's settings, `undefined` when it doesn't exist. Refuses a file group or others can read. */
  private static async readOwnerOnlyFile(
    configPath: string,
  ): Promise<z.output<typeof relayFileSchema> | undefined> {
    const stats = await stat(configPath).catch(() => undefined);
    if (stats === undefined) {
      return undefined;
    }
    if ((stats.mode & 0o077) !== 0) {
      throw new RelayConfigExposedError({ configPath, mode: stats.mode });
    }

    const parsed = relayFileSchema.safeParse(
      await readFile(configPath, 'utf8'),
    );
    if (!parsed.success) {
      throw new RelayConfigInvalidError({ configPath, fields: ['(file)'] });
    }
    return parsed.data;
  }
}
