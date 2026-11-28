import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { jsonLineSchema } from '#src/contracts/json-line.js';

const relayHaltFileSchema = jsonLineSchema.pipe(
  z.looseObject({ fingerprint: z.string() }),
);

/**
 * Remembers that Mission Control refused a key, by the configuration's fingerprint, so neither the
 * hooks nor a relay started by hand try that key again. Changing the key, URL or reporter name
 * changes the fingerprint and lifts the halt.
 */
export class RelayHalt {
  static async record(props: {
    haltPath: string;
    fingerprint: string;
    status: number;
    now: Date;
  }): Promise<void> {
    await mkdir(path.dirname(props.haltPath), { recursive: true });
    await writeFile(
      props.haltPath,
      JSON.stringify({
        fingerprint: props.fingerprint,
        status: props.status,
        haltedAt: props.now.toISOString(),
      }),
    );
  }

  static isHalted(haltPath: string, fingerprint: string): boolean {
    let text: string;
    try {
      text = readFileSync(haltPath, 'utf8');
    } catch {
      return false;
    }
    const parsed = relayHaltFileSchema.safeParse(text);
    return parsed.success && parsed.data.fingerprint === fingerprint;
  }
}
