import { describe, expect, it } from 'vitest';

import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';
import {
  type ConnectionPresence,
  type PasskeyCounter,
  SourcedSetupChecklist,
} from '#src/onboarding/services/setup-checklist/setup-checklist.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';

class CountedPasskeys implements PasskeyCounter {
  readonly asked: string[] = [];
  private readonly counts: ReadonlyMap<string, number>;

  constructor(counts: Record<string, number>) {
    this.counts = new Map(Object.entries(counts));
  }

  async passkeyCount(props: { userId: string }): Promise<number> {
    this.asked.push(props.userId);
    return this.counts.get(props.userId) ?? 0;
  }
}

class ConnectedProviders implements ConnectionPresence {
  private readonly providers: ReadonlySet<string>;

  constructor(providers: readonly string[]) {
    this.providers = new Set(providers);
  }

  async exists(props: { provider: string }): Promise<boolean> {
    return this.providers.has(props.provider);
  }
}

class Checklist {
  static for(props: {
    passkeys: number;
    connected: readonly string[];
  }): Promise<SetupChecklistReport> {
    return new SourcedSetupChecklist({
      passkeys: new CountedPasskeys({ [adaId]: props.passkeys }),
      connections: new ConnectedProviders(props.connected),
    }).for({ userId: adaId });
  }
}

describe('SourcedSetupChecklist', () => {
  it('leaves everything open for a fresh account', async () => {
    await expect(
      Checklist.for({ passkeys: 1, connected: [] }),
    ).resolves.toEqual({
      items: [
        { id: 'connectGitHub', done: false },
        { id: 'secondPasskey', done: false },
      ],
    });
  });

  it('ticks off GitHub once any GitHub connection exists', async () => {
    await expect(
      Checklist.for({ passkeys: 1, connected: ['github'] }),
    ).resolves.toMatchObject({
      items: [{ id: 'connectGitHub', done: true }, { done: false }],
    });
  });

  it('ignores connections to other providers', async () => {
    await expect(
      Checklist.for({ passkeys: 1, connected: ['jira'] }),
    ).resolves.toMatchObject({
      items: [{ id: 'connectGitHub', done: false }, {}],
    });
  });

  it('ticks off the second passkey at two or more', async () => {
    for (const passkeys of [2, 3]) {
      await expect(
        Checklist.for({ passkeys, connected: [] }),
      ).resolves.toMatchObject({
        items: [{}, { id: 'secondPasskey', done: true }],
      });
    }
  });

  it('counts the asking person’s passkeys', async () => {
    const passkeys = new CountedPasskeys({ [adaId]: 2 });
    const checklist = new SourcedSetupChecklist({
      passkeys,
      connections: new ConnectedProviders([]),
    });

    await checklist.for({ userId: adaId });

    expect(passkeys.asked).toEqual([adaId]);
  });
});
