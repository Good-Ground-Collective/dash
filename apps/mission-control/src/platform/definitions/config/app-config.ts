import { z } from 'zod';

import { ConfigError } from '#src/platform/errors.ts';

const productionWebOrigin = 'https://dash.doublel.studio';

export const appConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/u }),
  DEV_WEB_ORIGIN: z.url().default('http://localhost:5173'),
});

export type LogLevel = z.infer<typeof appConfigSchema>['LOG_LEVEL'];

export type Environment = z.infer<typeof appConfigSchema>['NODE_ENV'];

/** Typed settings parsed once from the environment at boot. */
export class AppConfig {
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly environment: Environment;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly port: number;

  constructor(props: z.infer<typeof appConfigSchema>) {
    this.environment = props.NODE_ENV;
    this.host = props.HOST;
    this.port = props.PORT;
    this.logLevel = props.LOG_LEVEL;
    this.databaseUrl = props.DATABASE_URL;
    this.corsOrigins =
      props.NODE_ENV === 'development'
        ? [productionWebOrigin, props.DEV_WEB_ORIGIN]
        : [productionWebOrigin];
  }

  /** Parses `env`, throwing a `ConfigError` that lists every problem so boot fails fast. */
  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const parsed = appConfigSchema.safeParse(env);
    if (!parsed.success) {
      throw new ConfigError({ details: z.prettifyError(parsed.error) });
    }
    return new AppConfig(parsed.data);
  }
}
