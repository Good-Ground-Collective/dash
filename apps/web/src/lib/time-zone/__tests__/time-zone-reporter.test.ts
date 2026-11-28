import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TimeZoneStore } from '#lib/time-zone/time-zone-store.ts';
import { MissionControlTimeZoneReporter } from '#lib/time-zone/time-zone-reporter.ts';

class RecordingStore implements TimeZoneStore {
  readonly saved: string[] = [];
  private readonly failure: Error | null;

  constructor(props: { failure?: Error } = {}) {
    this.failure = props.failure ?? null;
  }

  async save(timeZone: string): Promise<void> {
    this.saved.push(timeZone);
    if (this.failure !== null) throw this.failure;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MissionControlTimeZoneReporter', () => {
  it('saves the browser’s zone when it differs from the stored one', async () => {
    const store = new RecordingStore();
    const reporter = new MissionControlTimeZoneReporter({ store });

    const saved = await reporter.report({
      stored: 'America/New_York',
      browser: 'Europe/London',
    });

    expect(saved).toBe(true);
    expect(store.saved).toEqual(['Europe/London']);
  });

  it.each([
    ['matches the stored zone', 'America/New_York'],
    ['reports no zone', ''],
  ])('sends nothing when the browser %s', async (_label, browser) => {
    const store = new RecordingStore();
    const reporter = new MissionControlTimeZoneReporter({ store });

    const saved = await reporter.report({
      stored: 'America/New_York',
      browser,
    });

    expect(saved).toBe(false);
    expect(store.saved).toEqual([]);
  });

  it('warns and resolves when Mission Control refuses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const reporter = new MissionControlTimeZoneReporter({
      store: new RecordingStore({ failure: new Error('offline') }),
    });

    const saved = await reporter.report({
      stored: 'America/New_York',
      browser: 'Europe/London',
    });

    expect(saved).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
  });
});
