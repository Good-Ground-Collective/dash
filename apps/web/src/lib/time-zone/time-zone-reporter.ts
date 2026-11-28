import { z } from 'zod';
import type { TimeZoneStore } from '#lib/time-zone/time-zone-store.ts';

export const missionControlTimeZoneReporterPropsSchema = z.object({
  store: z.custom<TimeZoneStore>(
    (value) => value instanceof Object && 'save' in value,
  ),
});

export type MissionControlTimeZoneReporterProps = z.input<
  typeof missionControlTimeZoneReporterPropsSchema
>;

/** Keeps the time zone Mission Control holds for the viewer in step with the browser they're using. */
export interface TimeZoneReporter {
  /** Saves `browser` when it differs from `stored`, and answers whether it did. Never rejects: a failure warns and leaves the stored zone. */
  report(props: { stored: string; browser: string }): Promise<boolean>;
}

export class MissionControlTimeZoneReporter implements TimeZoneReporter {
  private readonly store: TimeZoneStore;

  constructor(props: MissionControlTimeZoneReporterProps) {
    this.store = missionControlTimeZoneReporterPropsSchema.parse(props).store;
  }

  async report(props: { stored: string; browser: string }): Promise<boolean> {
    if (props.browser === '' || props.browser === props.stored) return false;

    try {
      await this.store.save(props.browser);
      return true;
    } catch (error) {
      console.warn(
        `Mission Control did not save the time zone ${props.browser}: ${String(error)}`,
      );
      return false;
    }
  }
}
