import { describe, expect, it } from 'vitest';

import { appConfig, FakeGithub } from '#src/__tests__/support/fake-github.ts';
import { GithubWebhooks } from '#src/services/github-webhooks/github-webhooks.ts';

describe('GithubWebhooks', () => {
  const webhooks = new GithubWebhooks({ secret: appConfig.webhookSecret });
  const body = JSON.stringify({ action: 'created', installation: { id: 42 } });
  const headers = {
    'x-hub-signature-256': FakeGithub.sign(body),
    'x-github-delivery': 'delivery-1',
    'x-github-event': 'installation',
  };

  it('accepts a delivery signed with the webhook secret', async () => {
    await expect(webhooks.verify({ headers, body })).resolves.toEqual({
      deliveryId: 'delivery-1',
      event: 'installation',
      installationId: '42',
    });
  });

  it('accepts a delivery that concerns no installation', async () => {
    const ping = JSON.stringify({ zen: 'Keep it logically awesome.' });
    const signed = { ...headers, 'x-hub-signature-256': FakeGithub.sign(ping) };

    await expect(
      webhooks.verify({ headers: signed, body: ping }),
    ).resolves.toMatchObject({ installationId: null });
  });

  it('rejects a signature made with another secret', async () => {
    const forged = {
      ...headers,
      'x-hub-signature-256': FakeGithub.sign(body, 'other'),
    };

    await expect(
      webhooks.verify({ headers: forged, body }),
    ).resolves.toBeNull();
  });

  it('rejects a body changed after signing', async () => {
    await expect(
      webhooks.verify({ headers, body: body.replace('42', '43') }),
    ).resolves.toBeNull();
  });

  it('rejects a delivery without a signature', async () => {
    const unsigned = { ...headers, 'x-hub-signature-256': undefined };

    await expect(
      webhooks.verify({ headers: unsigned, body }),
    ).resolves.toBeNull();
  });
});
