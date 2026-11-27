import { describe, expect, it } from 'vitest';

import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';
import {
  type ConnectionPresence,
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

class Checklist {
  static for(props: {
    connected: readonly string[];
  }): Promise<SetupChecklistReport> {
    return new SourcedSetupChecklist({
      connections: new ConnectedProviders({ providers: props.connected }),
    }).report();
  }
}

describe('SourcedSetupChecklist', () => {
  it('leaves GitHub open for a fresh account', async () => {
    await expect(Checklist.for({ connected: [] })).resolves.toEqual({
      items: [{ id: 'connectGitHub', done: false }],
    });
  });

  it('ticks off GitHub once any GitHub connection exists', async () => {
    await expect(Checklist.for({ connected: ['github'] })).resolves.toEqual({
      items: [{ id: 'connectGitHub', done: true }],
    });
  });

  it('ignores connections to other providers', async () => {
    await expect(Checklist.for({ connected: ['jira'] })).resolves.toEqual({
      items: [{ id: 'connectGitHub', done: false }],
    });
  });
});
