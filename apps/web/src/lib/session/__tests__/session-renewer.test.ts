import { describe, expect, it } from 'vitest';
import type { MissionControl, Viewer } from '#lib/api/mission-control.ts';
import { MissionControlSessionRenewer } from '#lib/session/session-renewer.ts';

class CountingMissionControl implements MissionControl {
  calls = 0;
  private readonly respond: () => Promise<Viewer | null>;

  constructor(props: { respond: () => Promise<Viewer | null> }) {
    this.respond = props.respond;
  }

  getViewer = async (): Promise<Viewer | null> => {
    this.calls += 1;
    return this.respond();
  };
}

describe('MissionControlSessionRenewer', () => {
  it('asks Mission Control for the session so it renews the cookie', async () => {
    const missionControl = new CountingMissionControl({
      respond: async () => ({
        id: 'u1',
        name: 'Ada',
        email: 'ada@example.com',
        theme: 'characters',
        colorMode: null,
      }),
    });

    await new MissionControlSessionRenewer({ missionControl }).renew();

    expect(missionControl.calls).toBe(1);
  });

  it('resolves quietly when Mission Control is unreachable', async () => {
    const missionControl = new CountingMissionControl({
      respond: () => Promise.reject(new TypeError('fetch failed')),
    });

    await expect(
      new MissionControlSessionRenewer({ missionControl }).renew(),
    ).resolves.toBeUndefined();
  });

  it('refuses props without a Mission Control client', () => {
    // SAFETY: the empty object is deliberately not a MissionControl, to exercise prop validation.
    const missionControl = {} as never;
    expect(
      () => new MissionControlSessionRenewer({ missionControl }),
    ).toThrow();
  });
});
