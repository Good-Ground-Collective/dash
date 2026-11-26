import { z } from 'zod';
import type { MissionControl } from '#lib/api/mission-control.ts';

export const missionControlSessionRenewerPropsSchema = z.object({
  missionControl: z.custom<MissionControl>(
    (value) => value instanceof Object && 'getViewer' in value,
  ),
});

export type MissionControlSessionRenewerProps = z.input<
  typeof missionControlSessionRenewerPropsSchema
>;

/**
 * Keeps the browser's session cookie sliding. Mission Control renews the
 * cookie on get-session, but SvelteKit drops Set-Cookie from cross-origin
 * server fetches, so the renewal has to come from the browser.
 */
export interface SessionRenewer {
  /** Never rejects: a failed renewal leaves the current cookie in place. */
  renew(): Promise<void>;
}

export class MissionControlSessionRenewer implements SessionRenewer {
  private readonly missionControl: MissionControl;

  constructor(props: MissionControlSessionRenewerProps) {
    this.missionControl =
      missionControlSessionRenewerPropsSchema.parse(props).missionControl;
  }

  renew = async (): Promise<void> => {
    try {
      await this.missionControl.getViewer();
    } catch {
      return;
    }
  };
}
