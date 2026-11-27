import { describe, expect, it } from 'vitest';

import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';
import {
  type ConnectionPresence,
  type InitiativePresence,
  SourcedSetupChecklist,
} from '#src/onboarding/services/setup-checklist/setup-checklist.ts';

class ConnectedProviders implements ConnectionPresence {
  private readonly providers: ReadonlySet<string>;

  constructor(props: { providers: readonly string[] }) {
    this.providers = new Set(props.providers);
  }

  async exists(props: { provider: string }): Promise<boolean> {
    return this.providers.has(props.provider);
  }
}

class StoredInitiatives implements InitiativePresence {
  private readonly stored: boolean;

  constructor(props: { stored: boolean }) {
    this.stored = props.stored;
  }

  async anyInitiative(): Promise<boolean> {
    return this.stored;
  }
}

class Checklist {
  static async done(props: {
    connected: readonly string[];
    initiative?: boolean;
  }): Promise<Record<string, boolean>> {
    const report: SetupChecklistReport = await new SourcedSetupChecklist({
      connections: new ConnectedProviders({ providers: props.connected }),
      initiatives: new StoredInitiatives({ stored: props.initiative ?? false }),
    }).report();
    return Object.fromEntries(report.items.map(({ id, done }) => [id, done]));
  }
}

describe('SourcedSetupChecklist', () => {
  it('leaves both items open for a fresh account', async () => {
    await expect(Checklist.done({ connected: [] })).resolves.toEqual({
      connectGitHub: false,
      createInitiative: false,
    });
  });

  it('ticks off GitHub once any GitHub connection exists', async () => {
    await expect(Checklist.done({ connected: ['github'] })).resolves.toEqual({
      connectGitHub: true,
      createInitiative: false,
    });
  });

  it('ignores connections to other providers', async () => {
    await expect(
      Checklist.done({ connected: ['jira'] }),
    ).resolves.toMatchObject({ connectGitHub: false });
  });

  it('ticks off the first initiative once one is stored', async () => {
    await expect(
      Checklist.done({ connected: ['github'], initiative: true }),
    ).resolves.toEqual({ connectGitHub: true, createInitiative: true });
  });
});
