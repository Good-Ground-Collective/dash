import { readFileSync, statSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { uptime } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { FileLock } from '#src/services/file-lock/file-lock.js';

const relayLockPropsSchema = z.object({
  pidPath: z.string().min(1),
});

export type RelayLockProps = z.input<typeof relayLockPropsSchema>;

const pidSchema = z.coerce.number().int().positive();

/**
 * Keeps to one relay per state directory. The running relay's process ID sits in a pid file; a
 * file naming a process that has exited is taken over. Taking or releasing it happens under a short
 * `FileLock`, so two relays started at once can't both win.
 */
export class RelayLock {
  private readonly pidPath: string;

  constructor(props: RelayLockProps) {
    const valid = relayLockPropsSchema.parse(props);

    this.pidPath = valid.pidPath;
  }

  /** `true` when this process now holds the lock; `false` when another live relay does. */
  async acquire(): Promise<boolean> {
    return this.guard().hold(async () => {
      const holder = this.holder();
      if (
        holder !== undefined &&
        holder !== process.pid &&
        RelayLock.isAlive(holder)
      ) {
        return false;
      }

      const temporary = `${this.pidPath}.${process.pid}.tmp`;
      await mkdir(path.dirname(this.pidPath), { recursive: true });
      await writeFile(temporary, String(process.pid));
      await rename(temporary, this.pidPath);
      return true;
    });
  }

  async release(): Promise<void> {
    await this.guard().hold(async () => {
      if (this.holder() === process.pid) {
        await rm(this.pidPath, { force: true });
      }
    });
  }

  /** Whether a live relay holds the lock. Synchronous and cheap, for a hook deciding whether to start one. */
  isHeld(): boolean {
    const holder = this.holder();
    return holder !== undefined && RelayLock.isAlive(holder);
  }

  /** The pid file's process ID, `undefined` when there is none or it was written before this boot. */
  private holder(): number | undefined {
    let text: string;
    try {
      if (statSync(this.pidPath).mtimeMs < Date.now() - uptime() * 1000) {
        return undefined;
      }
      text = readFileSync(this.pidPath, 'utf8');
    } catch {
      return undefined;
    }
    const parsed = pidSchema.safeParse(text.trim());
    return parsed.success ? parsed.data : undefined;
  }

  private guard(): FileLock {
    return new FileLock({ lockPath: `${this.pidPath}.lock` });
  }

  /** Signal 0 checks that the process exists without touching it. `EPERM` means another user's process, so not our relay. */
  private static isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
