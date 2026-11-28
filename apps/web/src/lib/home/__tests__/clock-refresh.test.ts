import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockRefresh } from '#lib/home/clock-refresh.ts';

class FakeTab extends EventTarget {
  visibilityState = 'visible';

  show(): void {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  hide(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

describe('ClockRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes on every interval', () => {
    const refresh = vi.fn();
    new ClockRefresh({
      refresh,
      intervalMs: 1000,
      visibility: new FakeTab(),
    }).start();

    vi.advanceTimersByTime(3000);

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('defaults to a minute between refreshes', () => {
    const refresh = vi.fn();
    new ClockRefresh({ refresh, visibility: new FakeTab() }).start();

    vi.advanceTimersByTime(59_999);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the tab becomes visible but not when it hides', () => {
    const refresh = vi.fn();
    const tab = new FakeTab();
    new ClockRefresh({ refresh, visibility: tab }).start();

    tab.hide();
    expect(refresh).not.toHaveBeenCalled();
    tab.show();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops refreshing and releases the listener once stopped', () => {
    const refresh = vi.fn();
    const tab = new FakeTab();
    const stop = new ClockRefresh({ refresh, visibility: tab }).start();

    stop();
    vi.advanceTimersByTime(300_000);
    tab.show();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('rejects props without a refresh handler', () => {
    expect(
      () =>
        new ClockRefresh({
          // @ts-expect-error a string is deliberately not a function, to exercise prop validation.
          refresh: 'nope',
          visibility: new FakeTab(),
        }),
    ).toThrow();
  });
});
