import { describe, expect, it } from 'vitest';

import { appConfig, FakeGithub } from '#src/__tests__/support/fake-github.ts';
import { GithubWebhooks } from '#src/services/github-webhooks/github-webhooks.ts';

const webhooks = new GithubWebhooks({ secret: appConfig.webhookSecret });
const text = JSON.stringify({ action: 'created', installation: { id: 42 } });
const body = Buffer.from(text);
const headers = {
  'x-hub-signature-256': FakeGithub.sign(text),
  'x-github-delivery': 'delivery-1',
  'x-github-event': 'installation',
};

describe('GithubWebhooks', () => {
  it('accepts a delivery signed with the webhook secret', async () => {
    await expect(webhooks.verify({ headers, body })).resolves.toEqual({
      deliveryId: 'delivery-1',
      event: 'installation',
      action: 'created',
      installationId: '42',
      installationLifecycle: true,
      installationChange: null,
      payload: { action: 'created', installation: { id: 42 } },
    });
  });

  it('accepts a delivery that concerns no installation', async () => {
    const ping = JSON.stringify({ zen: 'Keep it logically awesome.' });
    const signed = { ...headers, 'x-hub-signature-256': FakeGithub.sign(ping) };

    await expect(
      webhooks.verify({ headers: signed, body: Buffer.from(ping) }),
    ).resolves.toMatchObject({ installationId: null });
  });

  it('rejects a signature made with another secret', async () => {
    const forged = {
      ...headers,
      'x-hub-signature-256': FakeGithub.sign(text, 'other'),
    };

    await expect(
      webhooks.verify({ headers: forged, body }),
    ).resolves.toBeNull();
  });

  it('rejects a body changed after signing', async () => {
    await expect(
      webhooks.verify({ headers, body: Buffer.from(text.replace('42', '43')) }),
    ).resolves.toBeNull();
  });

  it('rejects a delivery without a signature', async () => {
    const unsigned = { ...headers, 'x-hub-signature-256': undefined };

    await expect(
      webhooks.verify({ headers: unsigned, body }),
    ).resolves.toBeNull();
  });
});

describe('GithubWebhooks lifecycle events', () => {
  it('marks repository changes as installation lifecycle, and activity as not', async () => {
    const changed = {
      ...headers,
      'x-github-event': 'installation_repositories',
    };
    const activity = { ...headers, 'x-github-event': 'pull_request' };

    await expect(
      webhooks.verify({ headers: changed, body }),
    ).resolves.toMatchObject({ installationLifecycle: true });
    await expect(
      webhooks.verify({ headers: activity, body }),
    ).resolves.toMatchObject({ installationLifecycle: false });
  });
});

describe('GithubWebhooks installation changes', () => {
  it.each([
    ['installation', 'deleted', 'removed'],
    ['installation', 'suspend', 'suspended'],
    ['installation', 'unsuspend', 'unsuspended'],
    ['installation_repositories', 'added', 'repositoriesChanged'],
    ['installation_repositories', 'removed', 'repositoriesChanged'],
    ['installation', 'new_permissions_accepted', null],
    ['pull_request', 'opened', null],
  ])('reads %s %s as %s', async (event, action, change) => {
    const changed = JSON.stringify({ action, installation: { id: 42 } });
    const signed = {
      ...headers,
      'x-github-event': event,
      'x-hub-signature-256': FakeGithub.sign(changed),
    };

    await expect(
      webhooks.verify({ headers: signed, body: Buffer.from(changed) }),
    ).resolves.toMatchObject({ action, installationChange: change });
  });
});

describe('GithubWebhooks signatures', () => {
  it('rejects a truncated signature', async () => {
    const truncated = {
      ...headers,
      'x-hub-signature-256': FakeGithub.sign(text).slice(0, 20),
    };

    await expect(
      webhooks.verify({ headers: truncated, body }),
    ).resolves.toBeNull();
  });

  it('checks the signature over the exact bytes, even when they are not valid UTF-8', async () => {
    const bytes = Buffer.concat([body, Buffer.from([0xff])]);
    const signed = {
      ...headers,
      'x-hub-signature-256': FakeGithub.sign(bytes),
    };

    await expect(
      webhooks.verify({ headers: signed, body: bytes }),
    ).resolves.toMatchObject({
      deliveryId: 'delivery-1',
      installationId: null,
    });
    await expect(
      webhooks.verify({
        headers: signed,
        body: Buffer.from(bytes.toString('utf8')),
      }),
    ).resolves.toBeNull();
  });
});
