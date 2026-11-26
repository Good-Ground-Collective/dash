import { z } from 'zod';

import { ConfigError } from '#src/platform/errors.ts';

const productionWebOrigin = 'https://dash.doublel.studio';

export const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

export type LogLevel = z.infer<typeof logLevelSchema>;

export const environmentSchema = z.enum(['development', 'test', 'production']);

export const postgresUrlSchema = z.url({ protocol: /^postgres(ql)?$/u });

export const webOriginSchema = z
  .url({ protocol: /^https?$/u })
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message:
      'Expected a bare origin such as https://example.com, with no path or trailing slash',
  });

export const appConfigSchema = z
  .object({
    NODE_ENV: environmentSchema,
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z
      .string()
      .regex(/^\d+$/u, 'Expected a port number')
      .transform(Number)
      .pipe(z.number().int().min(0).max(65_535))
      .default(3000),
    LOG_LEVEL: logLevelSchema.default('info'),
    DATABASE_URL: postgresUrlSchema,
    DEV_WEB_ORIGIN: webOriginSchema.default('http://localhost:5173'),
  })
  .transform((env) => ({
    environment: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    devWebOrigin: env.DEV_WEB_ORIGIN,
  }));

export type Environment = z.infer<typeof environmentSchema>;

/** Typed settings parsed once from the environment at boot. */
export class AppConfig {
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly environment: Environment;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly port: number;

  /** Parses `env`, throwing a `ConfigError` that lists every problem so boot fails fast. */
  constructor(env: NodeJS.ProcessEnv) {
    const parsed = appConfigSchema.safeParse(env);
    if (!parsed.success) {
      throw new ConfigError({ details: z.prettifyError(parsed.error) });
    }
    const config = parsed.data;

    this.environment = config.environment;
    this.host = config.host;
    this.port = config.port;
    this.logLevel = config.logLevel;
    this.databaseUrl = config.databaseUrl;
    this.corsOrigins =
      config.environment === 'development'
        ? [productionWebOrigin, config.devWebOrigin]
        : [productionWebOrigin];
  }

  static fromEnvironment(): AppConfig {
    return new AppConfig(process.env);
  }
}
