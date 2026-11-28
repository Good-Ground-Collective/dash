import { setTimeout as sleep } from 'node:timers/promises';

/** The time a relay reads and the waits it makes between polls and retries. */
export interface RelayClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

/** The wall clock and real timers. */
export class SystemRelayClock implements RelayClock {
  now(): number {
    return Date.now();
  }

  async sleep(ms: number): Promise<void> {
    await sleep(ms);
  }
}
