import { describe, expect, it } from 'vitest';

import { InMemoryLinkedAccountRepository } from '#src/connections/__tests__/support/in-memory-connections.ts';
import {
  adaId,
  FakeActivityFeed,
  GithubFeedFixtures,
} from '#src/github-feed/__tests__/support/github-feed-fixtures.ts';
import {
  ConnectionNotReadableError,
  ViewerNotLinkedError,
} from '#src/github-feed/errors.ts';
import { OwnedGithubSource } from '#src/github-feed/services/owned-github-source/owned-github-source.ts';

class Source {
  readonly feed = new FakeActivityFeed();
  readonly linkedAccounts = new InMemoryLinkedAccountRepository();
  readonly source = new OwnedGithubSource({
    feed: this.feed,
    linkedAccounts: this.linkedAccounts,
  });

  async linked(login: string): Promise<this> {
    await this.linkedAccounts.save({
      userId: adaId,
      account: {
        provider: 'github',
        externalId: '1',
        url: `https://github.com/${login}`,
        login,
        kind: 'user',
      },
      sealedAccessToken: 'sealed',
      accessTokenExpiresAt: null,
      sealedRefreshToken: null,
      refreshTokenExpiresAt: null,
    });
    return this;
  }
}

describe('OwnedGithubSource', () => {
  it('reads the installation for the login the connecting person linked', async () => {
    const { source, feed } = await new Source().linked('ada');

    const snapshot = await source.read(GithubFeedFixtures.target());

    expect(feed.queries).toEqual([
      {
        installationId: '42',
        account: { login: 'acme', kind: 'organization' },
        viewerLogin: 'ada',
        repositories: ['acme/app'],
      },
    ]);
    expect(snapshot.viewerLogin).toBe('ada');
    expect(snapshot.records.issues.map(({ nodeId }) => nodeId)).toEqual([
      'I_5',
    ]);
  });

  it('refuses when the connecting person has no linked GitHub account', async () => {
    const { source, feed } = new Source();

    await expect(source.read(GithubFeedFixtures.target())).rejects.toThrow(
      ViewerNotLinkedError,
    );
    expect(feed.queries).toEqual([]);
  });

  it('refuses a connection without an installation', async () => {
    const { source } = await new Source().linked('ada');

    await expect(
      source.read(GithubFeedFixtures.target({ installationId: null })),
    ).rejects.toThrow(ConnectionNotReadableError);
  });

  it('names the missing connector when nobody made the connection', async () => {
    const { source } = await new Source().linked('ada');

    await expect(
      source.read(GithubFeedFixtures.target({ connectedBy: null })),
    ).rejects.toThrow(/no connecting person/u);
  });
});
