#!/usr/bin/env node
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';

/**
 * `dash-strip-types`, run from a workspace package's directory: writes each `src/**\/*.ts`
 * file, tests excluded, to `dist/**\/*.js` with its types erased, because Node won't strip
 * types under `node_modules` in the production image. Import specifiers keep their
 * `#src/….ts` form; the package's `imports` map sends them to `dist` under the `dash-dist`
 * condition.
 */
async function stripPackageTypes() {
  process.removeAllListeners('warning');

  const source = path.resolve('src');
  const output = path.resolve('dist');

  await rm(output, { recursive: true, force: true });

  const entries = await readdir(source, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    const file = path.join(entry.parentPath, entry.name);
    const relative = path.relative(source, file);
    if (
      !entry.isFile() ||
      !entry.name.endsWith('.ts') ||
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.test.ts') ||
      relative.split(path.sep).includes('__tests__')
    ) {
      continue;
    }
    const target = path.join(output, relative.replace(/\.ts$/u, '.js'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      stripTypeScriptTypes(await readFile(file, 'utf8'), { mode: 'strip' }),
    );
  }
}

await stripPackageTypes();
