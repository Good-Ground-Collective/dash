import { z } from 'zod';

import { ConfigError } from '#src/platform/errors.ts';

const productionWebOrigin = 'https://dash.doublel.studio';
const productionCookieDomain = new URL(productionWebOrigin).hostname;

/** The secret `.env.example` ships for local use. It is public, so production refuses it. */
export const developmentAuthSecret =
  'dev-only-placeholder-secret-not-for-deploys';

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

const optionalSecretSchema = z.string().min(1).optional();

/** The registered GitHub App's variables, set all together or not at all. The provider checks the values themselves. */
const githubAppVariables = [
  'GITHUB_APP_ID',
  'GITHUB_APP_SLUG',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
] as const;

export interface GithubAppSettings {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
}

export interface BriefingPrices {
  inputUsdPerMTok: number;
  cachedInputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export interface BriefingSettings {
  apiKey: string;
  model: string;
  prices: BriefingPrices;
  monthlyBudgetUsd: number;
  maxOutputTokens: number;
}

const usdSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/u, 'Expected a decimal number such as 0.10')
  .transform(Number)
  .pipe(z.number().min(0));

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
    BETTER_AUTH_SECRET: z
      .string()
      .min(
        32,
        'Expected at least 32 characters, for example from `openssl rand -base64 32`',
      ),
    BETTER_AUTH_URL: webOriginSchema,
    APP_VERSION: z.string().optional(),
    APP_COMMIT: z.string().optional(),
    GITHUB_APP_ID: optionalSecretSchema,
    GITHUB_APP_SLUG: optionalSecretSchema,
    GITHUB_APP_CLIENT_ID: optionalSecretSchema,
    GITHUB_APP_CLIENT_SECRET: optionalSecretSchema,
    GITHUB_APP_PRIVATE_KEY: optionalSecretSchema,
    GITHUB_WEBHOOK_SECRET: optionalSecretSchema,
    OPENAI_API_KEY: optionalSecretSchema.describe(
      'Turns the AI briefing on. Unset, the briefing is off and production still boots.',
    ),
    BRIEFING_MODEL: z
      .string()
      .min(1)
      .default('gpt-6-luna')
      .describe(
        "The OpenAI model. gpt-6-luna is OpenAI's most efficient model for high-volume tasks, checked 2026-11-27.",
      ),
    BRIEFING_INPUT_USD_PER_MTOK: usdSchema
      .default(0.1)
      .describe(
        'USD per million input tokens. OpenAI has no pricing API, so this is the Standard tier, short context (up to 272K input) estimate from its pricing page, checked 2026-11-27.',
      ),
    BRIEFING_CACHED_INPUT_USD_PER_MTOK: usdSchema
      .default(0.01)
      .describe(
        'USD per million cached input tokens, Standard tier, short context, from the pricing page checked 2026-11-27.',
      ),
    BRIEFING_OUTPUT_USD_PER_MTOK: usdSchema
      .default(0.5)
      .describe(
        'USD per million output tokens, Standard tier, short context, from the pricing page checked 2026-11-27.',
      ),
    BRIEFING_MONTHLY_BUDGET_USD: usdSchema
      .default(100)
      .describe("The briefing's monthly spend budget in USD."),
    BRIEFING_MAX_OUTPUT_TOKENS: z
      .string()
      .regex(/^\d+$/u, 'Expected a positive whole number')
      .transform(Number)
      .pipe(z.number().int().positive())
      .default(4000)
      .describe(
        'The per-run ceiling, sent as max_output_tokens. It includes reasoning tokens.',
      ),
  })
  .refine(
    (env) => {
      const set = githubAppVariables.filter((name) => env[name] !== undefined);
      return set.length === 0 || set.length === githubAppVariables.length;
    },
    {
      message: `Set all of ${githubAppVariables.join(', ')} for the GitHub App, or none of them`,
      path: ['GITHUB_APP_ID'],
    },
  )
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.GITHUB_APP_ID !== undefined,
    {
      message: `Production needs the GitHub App: set ${githubAppVariables.join(', ')}`,
      path: ['GITHUB_APP_ID'],
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      new URL(env.BETTER_AUTH_URL).protocol === 'https:',
    {
      message: 'BETTER_AUTH_URL must use https in production',
      path: ['BETTER_AUTH_URL'],
    },
  )
  .refine(
    (env) => {
      const host = new URL(env.BETTER_AUTH_URL).hostname;
      return (
        env.NODE_ENV !== 'production' ||
        host === productionCookieDomain ||
        host.endsWith(`.${productionCookieDomain}`)
      );
    },
    {
      message: `BETTER_AUTH_URL must be on ${productionCookieDomain} in production, or browsers drop the session cookie`,
      path: ['BETTER_AUTH_URL'],
    },
  )
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      env.BETTER_AUTH_SECRET !== developmentAuthSecret,
    {
      message:
        'BETTER_AUTH_SECRET is the public development placeholder. Generate one, for example with `openssl rand -base64 32`',
      path: ['BETTER_AUTH_SECRET'],
    },
  )
  .transform((env) => ({
    environment: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    devWebOrigin: env.DEV_WEB_ORIGIN,
    authSecret: env.BETTER_AUTH_SECRET,
    authBaseUrl: env.BETTER_AUTH_URL,
    build: {
      version: env.APP_VERSION?.trim() || 'dev',
      commit: env.APP_COMMIT?.trim() || null,
    },
    githubApp:
      env.GITHUB_APP_ID === undefined ||
      env.GITHUB_APP_SLUG === undefined ||
      env.GITHUB_APP_CLIENT_ID === undefined ||
      env.GITHUB_APP_CLIENT_SECRET === undefined ||
      env.GITHUB_APP_PRIVATE_KEY === undefined ||
      env.GITHUB_WEBHOOK_SECRET === undefined
        ? null
        : {
            appId: env.GITHUB_APP_ID,
            slug: env.GITHUB_APP_SLUG,
            clientId: env.GITHUB_APP_CLIENT_ID,
            clientSecret: env.GITHUB_APP_CLIENT_SECRET,
            privateKey: env.GITHUB_APP_PRIVATE_KEY,
            webhookSecret: env.GITHUB_WEBHOOK_SECRET,
          },
    briefing:
      env.OPENAI_API_KEY === undefined
        ? null
        : {
            apiKey: env.OPENAI_API_KEY,
            model: env.BRIEFING_MODEL,
            prices: {
              inputUsdPerMTok: env.BRIEFING_INPUT_USD_PER_MTOK,
              cachedInputUsdPerMTok: env.BRIEFING_CACHED_INPUT_USD_PER_MTOK,
              outputUsdPerMTok: env.BRIEFING_OUTPUT_USD_PER_MTOK,
            },
            monthlyBudgetUsd: env.BRIEFING_MONTHLY_BUDGET_USD,
            maxOutputTokens: env.BRIEFING_MAX_OUTPUT_TOKENS,
          },
  }));

export type Environment = z.infer<typeof environmentSchema>;

/** Typed settings parsed once from the environment at boot. */
export class AppConfig {
  /** Service account keys start `dash_live_` in production and `dash_dev_` elsewhere, so a key shows where it works. */
  readonly apiKeyPrefix: 'dash_live_' | 'dash_dev_';
  readonly authBaseUrl: string;
  /** Set in production so the session cookie reaches the web app's server on the parent domain. Host-only elsewhere. */
  readonly authCookieDomain: string | undefined;
  readonly authSecret: string;
  /** The release tag and commit `bin/image` bakes in. Unset, the version is `dev` and the commit null. */
  readonly build: { version: string; commit: string | null };
  /** The AI briefing's OpenAI settings, or null when `OPENAI_API_KEY` is unset and the briefing is off. */
  readonly briefing: BriefingSettings | null;
  readonly corsOrigins: readonly string[];
  readonly databaseUrl: string;
  readonly environment: Environment;
  /** The GitHub App, or null outside production when it isn't configured. */
  readonly githubApp: GithubAppSettings | null;
  readonly host: string;
  readonly logLevel: LogLevel;
  readonly port: number;
  readonly secureCookies: boolean;
  /** The web app's origin, where passkey ceremonies run: production's, or `DEV_WEB_ORIGIN` in development. */
  readonly webOrigin: string;

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
    this.authSecret = config.authSecret;
    this.authBaseUrl = config.authBaseUrl;
    this.build = config.build;
    this.githubApp = config.githubApp;
    this.briefing = config.briefing;
    this.secureCookies = config.environment === 'production';
    this.apiKeyPrefix =
      config.environment === 'production' ? 'dash_live_' : 'dash_dev_';
    this.authCookieDomain =
      config.environment === 'production' ? productionCookieDomain : undefined;
    this.webOrigin =
      config.environment === 'development'
        ? config.devWebOrigin
        : productionWebOrigin;
    this.corsOrigins =
      config.environment === 'development'
        ? [productionWebOrigin, config.devWebOrigin]
        : [productionWebOrigin];
  }

  static fromEnvironment(): AppConfig {
    return new AppConfig(process.env);
  }
}
