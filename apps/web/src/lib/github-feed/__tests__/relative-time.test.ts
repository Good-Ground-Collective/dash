import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelativeTime } from '#lib/github-feed/relative-time.ts';

const now = new Date('2026-11-27T12:00:00Z');
class Clock {
  static ago(seconds: number): Date {
    return new Date(now.getTime() - seconds * 1000);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RelativeTime.since', () => {
  it.each([
    [0, 'just now'],
    [59, 'just now'],
    [60, '1 minute ago'],
    [5 * 60 + 30, '5 minutes ago'],
    [2 * 60 * 60, '2 hours ago'],
    [26 * 60 * 60, 'yesterday'],
    [3 * 24 * 60 * 60, '3 days ago'],
    [15 * 24 * 60 * 60, '2 weeks ago'],
    [400 * 24 * 60 * 60, 'last year'],
  ])('reads %i seconds ago as “%s”', (seconds, words) => {
    expect(RelativeTime.since(Clock.ago(seconds))).toBe(words);
  });

  it('reads a time in the future as just now', () => {
    expect(RelativeTime.since(Clock.ago(-120))).toBe('just now');
  });

  it('moves on as the clock does', () => {
    const when = Clock.ago(0);
    vi.advanceTimersByTime(3 * 60 * 1000);

    expect(RelativeTime.since(when)).toBe('3 minutes ago');
  });
});

describe('RelativeTime.olderThan', () => {
  it('is true only past the given minutes', () => {
    expect(
      RelativeTime.olderThan({ when: Clock.ago(60 * 60), minutes: 60 }),
    ).toBe(false);
    expect(
      RelativeTime.olderThan({ when: Clock.ago(60 * 60 + 1), minutes: 60 }),
    ).toBe(true);
  });
});
