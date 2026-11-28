import { vi } from 'vitest';
import type { z } from 'zod';

import {
  adaId,
  ConnectionsHarness,
  fixedNow,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { globexProfile } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import {
  accountsResponseSchema,
  type ConnectableAccount,
  organizationLookupResponseSchema,
} from '#src/connections/contracts/connections.ts';

/** globex as the account list shows it once Ada has asked its owners, at `fixedNow`. */
export const globexRequested = {
  account: { ...globexProfile, role: null },
  install: { state: 'requested', requestedAt: fixedNow.toISOString() },
};

/** Ada's reads of the account list and organisation lookups, over a harness the test file stops. */
export class InstallRequestReads {
  readonly running: ConnectionsHarness[] = [];

  /** A harness where Ada has authorized the app and sees no installations. */
  async linked(): Promise<ConnectionsHarness> {
    const harness = new ConnectionsHarness();
    this.running.push(harness);
    await harness.link({ userId: adaId });
    harness.flow.visible = [];
    return harness;
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      this.running.splice(0).map(async (harness) => harness.stop()),
    );
  }

  static async lookUp(
    harness: ConnectionsHarness,
    login: string,
  ): Promise<z.output<typeof organizationLookupResponseSchema>> {
    const response = await (
      await harness.start()
    ).inject({
      url: `/integrations/github/accounts/lookup?login=${login}&returnTo=/setup/github`,
      headers: ConnectionsHarness.cookie(adaId),
    });
    return organizationLookupResponseSchema.parse(response.json());
  }

  static async read(harness: ConnectionsHarness) {
    const response = await (
      await harness.start()
    ).inject({
      url: '/integrations/github/accounts?returnTo=/setup/github',
      headers: ConnectionsHarness.cookie(adaId),
    });
    const answer = accountsResponseSchema.parse(response.json());
    if (answer.status !== 'linked') {
      throw new Error(`Expected linked accounts, got ${answer.status}`);
    }
    return answer;
  }

  static async listed(
    harness: ConnectionsHarness,
  ): Promise<ConnectableAccount[]> {
    return (await InstallRequestReads.read(harness)).accounts;
  }

  /** Looks globex up, then comes back from the provider's install page with a request, `lateByMs` after the lookup. */
  static async requestGlobex(
    harness: ConnectionsHarness,
    props: { lateByMs?: number } = {},
  ) {
    const lookedUp = await InstallRequestReads.lookUp(harness, 'globex');
    vi.setSystemTime(Date.now() + (props.lateByMs ?? 0));
    const installUrl =
      lookedUp.status === 'found' &&
      lookedUp.entry.install.state === 'requestable'
        ? lookedUp.entry.install.installUrl
        : '';
    return (await harness.start()).inject({
      url: `/integrations/github/setup?setup_action=request&state=${ConnectionsHarness.stateOf(installUrl)}`,
      headers: ConnectionsHarness.cookie(adaId),
    });
  }
}
