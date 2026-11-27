import type { SetupChecklistReport } from '#src/onboarding/contracts/setup-checklist.ts';

/** The provider the checklist asks you to connect. */
const githubProvider = 'github';

/** A second passkey gets you in when the first device is lost. */
const passkeysWanted = 2;

/** How many passkeys a person has. */
export interface PasskeyCounter {
  passkeyCount(props: { userId: string }): Promise<number>;
}

/** Whether Dash reads a provider through any connection. */
export interface ConnectionPresence {
  exists(props: { provider: string }): Promise<boolean>;
}

export interface SetupChecklist {
  /** Each item's status for `userId`, read fresh so an item ticks off as soon as its condition holds. */
  for(props: { userId: string }): Promise<SetupChecklistReport>;
}

/**
 * The setup checklist home shows. GitHub counts as connected once Dash has any GitHub
 * connection, owned or guest, whoever made it: Dash has one person for now. The second passkey
 * is the signed-in person's own.
 */
export class SourcedSetupChecklist implements SetupChecklist {
  private readonly passkeys: PasskeyCounter;
  private readonly connections: ConnectionPresence;

  constructor(props: {
    passkeys: PasskeyCounter;
    connections: ConnectionPresence;
  }) {
    this.passkeys = props.passkeys;
    this.connections = props.connections;
  }

  async for(props: { userId: string }): Promise<SetupChecklistReport> {
    const [connected, passkeys] = await Promise.all([
      this.connections.exists({ provider: githubProvider }),
      this.passkeys.passkeyCount({ userId: props.userId }),
    ]);
    return {
      items: [
        { id: 'connectGitHub', done: connected },
        { id: 'secondPasskey', done: passkeys >= passkeysWanted },
      ],
    };
  }
}
