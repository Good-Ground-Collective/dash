import { z } from 'zod';

const visibilitySourceSchema = z.custom<VisibilitySource>(
  (value) => value instanceof EventTarget && 'visibilityState' in value,
);

const refreshHandlerSchema = z.custom<() => void>(
  (value) => value instanceof Function,
);

export const clockRefreshPropsSchema = z.object({
  refresh: refreshHandlerSchema.describe('Called whenever the time is stale.'),
  intervalMs: z.number().int().positive().default(60_000),
  visibility: visibilitySourceSchema.describe(
    'Where the tab’s visibility is read, normally `document`.',
  ),
});

export type ClockRefreshProps = z.input<typeof clockRefreshPropsSchema>;

/** The slice of `document` the refresh listens to. */
export interface VisibilitySource {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Keeps time-relative copy current in a tab left open: refreshes every interval and when the tab comes back into view. */
export class ClockRefresh {
  private readonly props: z.output<typeof clockRefreshPropsSchema>;

  constructor(props: ClockRefreshProps) {
    this.props = clockRefreshPropsSchema.parse(props);
  }

  /** Begins refreshing and returns the function that stops it. */
  start(): () => void {
    const { refresh, intervalMs, visibility } = this.props;
    const onVisible = (): void => {
      if (visibility.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(refresh, intervalMs);
    visibility.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      visibility.removeEventListener('visibilitychange', onVisible);
    };
  }
}
