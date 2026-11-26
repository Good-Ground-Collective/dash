import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/*/repositories/*/*-table.ts',
  out: './drizzle',
});
