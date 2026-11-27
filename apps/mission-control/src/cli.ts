import { BreakGlassCommand } from '#src/auth/exposures/break-glass-command/break-glass-command.ts';
import { DrizzleAuthStore } from '#src/auth/repositories/auth-store/auth-store.ts';
import { BetterAuthIdentity } from '#src/auth/services/identity/identity.ts';
import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

const config = AppConfig.fromEnvironment();
const database = new PostgresDatabase({ url: config.databaseUrl });

try {
  const identity = new BetterAuthIdentity({
    storage: new DrizzleAuthStore({ database }).storage,
    secret: config.authSecret,
    baseUrl: config.authBaseUrl,
    webOrigin: config.webOrigin,
    trustedOrigins: config.corsOrigins,
    cookieDomain: config.authCookieDomain,
    secureCookies: config.secureCookies,
  });
  process.exitCode = await new BreakGlassCommand({
    identity,
    stdout: process.stdout,
    stderr: process.stderr,
  }).run(process.argv.slice(2));
} finally {
  await database.close();
}
