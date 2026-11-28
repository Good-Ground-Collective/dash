import { describe, expect, it } from 'vitest';
import type { ConnectableAccount } from '#lib/api/github-account-contracts.ts';
import { HttpGithubAccounts } from '#lib/api/github-accounts.ts';
import { OrganizationRequestFlow } from '#lib/connections/organization-request-flow.ts';

/** Sample accounts as Mission Control gives them. */
class Sample {
  static organisation(login: string, externalId: string): ConnectableAccount {
    return {
      account: {
        externalId,
        login,
        kind: 'organization',
        url: `https://github.com/${login}`,
        avatarUrl: null,
        role: null,
      },
      install: {
        state: 'requestable',
        installUrl: `https://github.com/apps/dash/installations/new/permissions?target_id=${externalId}`,
      },
    };
  }
}

/** A flow over a Mission Control that answers every lookup with `answer`. */
class Harness {
  readonly logins: string[] = [];
  readonly flow: OrganizationRequestFlow;

  constructor(props: { answer: () => Response }) {
    const accounts = new HttpGithubAccounts({
      baseUrl: 'https://api.example.test',
      fetch: async (input) => {
        this.logins.push(
          new URL(String(input)).searchParams.get('login') ?? '',
        );
        return props.answer();
      },
    });
    this.flow = new OrganizationRequestFlow({
      accounts,
      returnTo: '/setup/github',
    });
  }
}

describe('OrganizationRequestFlow.lookUp', () => {
  it('finds an organisation to add to the list', async () => {
    const globex = Sample.organisation('globex', '7070');
    const harness = new Harness({
      answer: () => Response.json({ status: 'found', entry: globex }),
    });

    await expect(
      harness.flow.lookUp({ login: 'globex', listed: [] }),
    ).resolves.toEqual({ kind: 'found', entry: globex });
  });

  it('says when GitHub has no such organisation', async () => {
    const harness = new Harness({
      answer: () => Response.json({ status: 'missing' }),
    });

    await expect(
      harness.flow.lookUp({ login: 'nobody', listed: [] }),
    ).resolves.toEqual({
      kind: 'problem',
      message: 'GitHub has no organisation called nobody.',
    });
  });

  it('doesn’t look up a login the list already shows', async () => {
    const harness = new Harness({
      answer: () => Response.json({ status: 'missing' }),
    });

    const outcome = await harness.flow.lookUp({
      login: 'GLOBEX',
      listed: [Sample.organisation('globex', '7070')],
    });

    expect(outcome).toEqual({
      kind: 'problem',
      message: 'globex is already in the list.',
    });
    expect(harness.logins).toEqual([]);
  });

  it('explains a login that can’t be one without calling', async () => {
    const harness = new Harness({
      answer: () => Response.json({ status: 'missing' }),
    });

    await expect(
      harness.flow.lookUp({ login: '  ', listed: [] }),
    ).resolves.toEqual({
      kind: 'problem',
      message: 'Enter an organisation’s login, such as acme.',
    });
    expect(harness.logins).toEqual([]);
  });
});

describe('OrganizationRequestFlow.lookUp refusals', () => {
  it('starts the list over when GitHub needs authorizing again', async () => {
    const harness = new Harness({
      answer: () =>
        Response.json({
          status: 'authorize',
          authorizeUrl: 'https://github.com/login/oauth/authorize',
        }),
    });

    await expect(
      harness.flow.lookUp({ login: 'globex', listed: [] }),
    ).resolves.toEqual({
      kind: 'authorize',
      authorizeUrl: 'https://github.com/login/oauth/authorize',
    });
  });

  it('reads a 401 as signed out and any other failure as a problem to retry', async () => {
    const signedOut = new Harness({
      answer: () =>
        Response.json({ code: 'SIGN_IN_REQUIRED' }, { status: 401 }),
    });
    const failing = new Harness({
      answer: () =>
        Response.json({ code: 'PROVIDER_UNAVAILABLE' }, { status: 502 }),
    });

    await expect(
      signedOut.flow.lookUp({ login: 'globex', listed: [] }),
    ).resolves.toEqual({ kind: 'signed-out' });
    await expect(
      failing.flow.lookUp({ login: 'globex', listed: [] }),
    ).resolves.toMatchObject({ kind: 'problem', message: /Try again/u });
  });
});

describe('OrganizationRequestFlow.withLookedUp', () => {
  it('adds looked-up rows after the list, leaving out any the list now has', () => {
    const acme = Sample.organisation('acme', '9919');
    const globex = Sample.organisation('globex', '7070');
    const installedGlobex: ConnectableAccount = {
      ...globex,
      install: { state: 'requested', requestedAt: '2026-11-26T12:00:00Z' },
    };

    expect(
      OrganizationRequestFlow.withLookedUp({
        accounts: [acme],
        lookedUp: [globex],
      }),
    ).toEqual([acme, globex]);
    expect(
      OrganizationRequestFlow.withLookedUp({
        accounts: [acme, installedGlobex],
        lookedUp: [globex],
      }),
    ).toEqual([acme, installedGlobex]);
  });
});
