import { fileURLToPath } from 'node:url';

import { AppConfig } from '#src/platform/definitions/config/app-config.ts';
import { PostgresDatabase } from '#src/platform/services/database/database.ts';

const config = AppConfig.fromEnvironment();
const database = new PostgresDatabase({ url: config.databaseUrl });

try {
  await database.migrate({
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
} finally {
  await database.close();
}
