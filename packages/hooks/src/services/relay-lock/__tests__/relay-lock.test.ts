import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RelayLock } from '#src/services/relay-lock/relay-lock.js';

let directory: string;
let pidPath: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dash-relay-lock-'));
  pidPath = path.join(directory, 'relay.pid');
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe('RelayLock', () => {
  it('is held from acquire until release', async () => {
    const lock = new RelayLock({ pidPath });

    expect(await lock.acquire()).toBe(true);
    expect(lock.isHeld()).toBe(true);
    await lock.release();
    expect(lock.isHeld()).toBe(false);
  });

  it('is not taken while another live process holds it', async () => {
    await writeFile(pidPath, String(process.ppid));

    expect(await new RelayLock({ pidPath }).acquire()).toBe(false);
  });

  it('is taken over from a relay that died holding it', async () => {
    const deadPid = Number(
      execFileSync(process.execPath, [
        '-e',
        'process.stdout.write(String(process.pid))',
      ]),
    );
    await writeFile(pidPath, String(deadPid));
    const lock = new RelayLock({ pidPath });

    expect(lock.isHeld()).toBe(false);
    expect(await lock.acquire()).toBe(true);
  });
});
