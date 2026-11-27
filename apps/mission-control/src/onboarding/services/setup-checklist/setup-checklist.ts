import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';

const githubProvider = 'github';

/** Whether Dash can read a provider through any connection that isn't suspended. */
export interface ConnectionPresence {
  exists(props: { provider: string }): Promise<boolean>;
}

/** Whether any connection's tracker has given Dash an initiative, in any status. */
export interface InitiativePresence {
  anyInitiative(): Promise<boolean>;
}

export interface SetupChecklist {
  /** Each item's status, read fresh so an item ticks off as soon as its condition holds. */
  report(): Promise<SetupChecklistReport>;
}

/**
 * The setup checklist home shows. GitHub counts as connected once Dash has any GitHub
 * connection, owned or guest, whoever made it, and the first initiative as made once any
 * read stored one: Dash has one person for now.
 */
export class SourcedSetupChecklist implements SetupChecklist {
  private readonly connections: ConnectionPresence;
  private readonly initiatives: InitiativePresence;

  constructor(props: {
    connections: ConnectionPresence;
    initiatives: InitiativePresence;
  }) {
    this.connections = props.connections;
    this.initiatives = props.initiatives;
  }

  async report(): Promise<SetupChecklistReport> {
    const [connected, initiative] = await Promise.all([
      this.connections.exists({ provider: githubProvider }),
      this.initiatives.anyInitiative(),
    ]);

    return {
      items: [
        { id: 'connectGitHub', done: connected },
        { id: 'createInitiative', done: initiative },
      ],
    };
  }
}
