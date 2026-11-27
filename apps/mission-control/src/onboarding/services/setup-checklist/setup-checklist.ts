import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';

const githubProvider = 'github';

/** Whether Dash can read a provider through any connection that isn't suspended. */
export interface ConnectionPresence {
  exists(props: { provider: string }): Promise<boolean>;
}

export interface SetupChecklist {
  /** Each item's status for `userId`, read fresh so an item ticks off as soon as its condition holds. */
  for(props: { userId: string }): Promise<SetupChecklistReport>;
}

/**
 * The setup checklist home shows. GitHub counts as connected once Dash has any GitHub
 * connection, owned or guest, whoever made it: Dash has one person for now.
 */
export class SourcedSetupChecklist implements SetupChecklist {
  private readonly connections: ConnectionPresence;

  constructor(props: { connections: ConnectionPresence }) {
    this.connections = props.connections;
  }

  async for(): Promise<SetupChecklistReport> {
    const connected = await this.connections.exists({
      provider: githubProvider,
    });

    return { items: [{ id: 'connectGitHub', done: connected }] };
  }
}
