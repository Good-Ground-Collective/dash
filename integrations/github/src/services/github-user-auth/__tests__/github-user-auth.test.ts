import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrantRevokedError } from '@dash/integrations-core';

import { GithubOAuthError } from '#src/errors.ts';
import {
  appConfig,
  FakeGithub,
  redirectUrl,
  tokenUrl,
} from '#src/__tests__/support/fake-github.ts';

afterEach(() => {
  vi.useRealTimers();
});

const expiringToken = {
  access_token: 'ghu_access',
  expires_in: 28_800,
  refresh_token: 'ghr_refresh',
  refresh_token_expires_in: 15_897_600,
  token_type: 'bearer',
};

describe('GithubConnectFlow authorizeUser', () => {
  it('exchanges the code and reads who authorized', async () => {
    const flow = new FakeGithub().withUserToken(expiringToken).flow();

    await expect(
      flow.authorizeUser({ code: 'the-code', redirectUrl }),
    ).resolves.toEqual({
      account: {
        provider: 'github',
        externalId: '583231',
        url: 'https://github.com/octocat',
        login: 'octocat',
        kind: 'user',
      },
      grant: {
        accessToken: 'ghu_access',
        accessTokenExpiresAt: '2026-11-26T20:00:00.000Z',
        refreshToken: 'ghr_refresh',
        refreshTokenExpiresAt: '2027-05-29T12:00:00.000Z',
      },
    });
  });

  it('sends the client credentials and reads the user with the new token', async () => {
    const github = new FakeGithub().withUserToken(expiringToken);

    await github.flow().authorizeUser({ code: 'the-code', redirectUrl });

    const [exchange] = github.callsTo({ method: 'POST', url: tokenUrl });
    const [user] = github.callsTo({
      method: 'GET',
      url: 'https://api.github.com/user',
    });
    expect(exchange?.body).toEqual({
      client_id: appConfig.clientId,
      client_secret: appConfig.clientSecret,
      code: 'the-code',
      redirect_uri: redirectUrl,
    });
    expect(user?.authorization).toBe('Bearer ghu_access');
  });

  it('keeps a token that never expires without expiry times', async () => {
    const github = new FakeGithub().withUserToken({
      access_token: 'ghu_forever',
    });

    const { grant } = await github
      .flow()
      .authorizeUser({ code: 'c', redirectUrl });

    expect(grant).toEqual({
      accessToken: 'ghu_forever',
      accessTokenExpiresAt: null,
      refreshToken: null,
      refreshTokenExpiresAt: null,
    });
  });
});

describe('GithubConnectFlow authorizeUser refusals', () => {
  it('raises GitHub’s refusal, which arrives as a 200', async () => {
    const github = new FakeGithub().withUserToken({
      error: 'bad_verification_code',
      error_description: 'The code passed is incorrect or expired.',
    });

    await expect(
      github.flow().authorizeUser({ code: 'stale', redirectUrl }),
    ).rejects.toThrow(GithubOAuthError);
  });
});

describe('GithubConnectFlow refreshGrant', () => {
  it('trades the refresh token for a new grant', async () => {
    const github = new FakeGithub().withUserToken({
      access_token: 'ghu_new',
      expires_in: 60,
      refresh_token: 'ghr_new',
      refresh_token_expires_in: 120,
    });

    const grant = await github.flow().refreshGrant({ refreshToken: 'ghr_old' });

    expect(grant).toMatchObject({
      accessToken: 'ghu_new',
      accessTokenExpiresAt: '2026-11-26T12:01:00.000Z',
    });
    expect(github.callsTo({ method: 'POST', url: tokenUrl })[0]?.body).toEqual({
      client_id: appConfig.clientId,
      client_secret: appConfig.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: 'ghr_old',
    });
  });

  it('reports a refused refresh token as a revoked grant', async () => {
    const github = new FakeGithub().withUserToken({
      error: 'bad_refresh_token',
      error_description: 'The refresh token passed is incorrect or expired.',
    });

    await expect(
      github.flow().refreshGrant({ refreshToken: 'ghr_spent' }),
    ).rejects.toThrow(GrantRevokedError);
  });

  it('keeps other refusals as OAuth errors', async () => {
    const github = new FakeGithub().withUserToken({
      error: 'incorrect_client_credentials',
    });

    await expect(
      github.flow().refreshGrant({ refreshToken: 'ghr_old' }),
    ).rejects.toThrow(GithubOAuthError);
  });
});
