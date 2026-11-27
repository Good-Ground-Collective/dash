import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  adaId,
  ConnectionsHarness,
} from '#src/connections/__tests__/support/connections-harness.ts';
import { acmeInstallation } from '#src/connections/__tests__/support/fake-connect-flow.ts';

const harness = new ConnectionsHarness();
const payload = '{ "action": "created",  "installation": { "id": 42 } }';

beforeEach(async () => {
  await harness.connections.saveOwned({
    provider: 'github',
    connectedBy: adaId,
    installation: acmeInstallation,
  });
});

afterEach(async () => {
  harness.deliveries.deliveries.splice(0);
  harness.connections.owned.clear();
  await harness.stop();
});

class Deliveries {
  static async send(props: {
    signature: string;
    delivery: string;
    body?: string;
    event?: string;
  }): Promise<{ statusCode: number; body: unknown }> {
    const app = await harness.start();
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/github/webhooks',
      headers: {
        'content-type': 'application/json',
        'x-signature': props.signature,
        'x-delivery': props.delivery,
        'x-event': props.event ?? 'installation',
      },
      payload: props.body ?? payload,
    });
    return { statusCode: response.statusCode, body: response.json() };
  }
}

describe('ConnectionsModule webhooks', () => {
  it('verifies the signature over the exact body and records the delivery', async () => {
    const response = await Deliveries.send({
      signature: `signed:${payload}`,
      delivery: 'delivery-1',
    });

    expect(response).toEqual({
      statusCode: 202,
      body: { deliveryId: 'delivery-1', status: 'recorded' },
    });
    expect(harness.deliveries.deliveries).toEqual([
      {
        provider: 'github',
        deliveryId: 'delivery-1',
        event: 'installation',
        action: 'created',
        installationId: '42',
        installationLifecycle: true,
        installationChange: null,
        payload: { action: 'created', installation: { id: 42 } },
        dispatchPending: false,
        receivedAt: expect.any(Date),
      },
    ]);
  });

  it('acknowledges a redelivery once more without recording it twice', async () => {
    await Deliveries.send({ signature: `signed:${payload}`, delivery: 'd-2' });

    const again = await Deliveries.send({
      signature: `signed:${payload}`,
      delivery: 'd-2',
    });

    expect(again).toEqual({
      statusCode: 202,
      body: { deliveryId: 'd-2', status: 'duplicate' },
    });
    expect(harness.deliveries.deliveries).toHaveLength(1);
  });

  it('acknowledges activity for an installation Dash has no connection for without storing it', async () => {
    const stranger = '{ "action": "opened", "installation": { "id": 7 } }';

    const response = await Deliveries.send({
      signature: `signed:${stranger}`,
      delivery: 'd-4',
      body: stranger,
      event: 'pull_request',
    });

    expect(response).toEqual({
      statusCode: 202,
      body: { deliveryId: 'd-4', status: 'ignored' },
    });
    expect(harness.deliveries.deliveries).toEqual([]);
  });
});

describe('ConnectionsModule installation events', () => {
  it('records an installation event before Dash has a connection for it', async () => {
    const approved = '{ "action": "created", "installation": { "id": 7 } }';

    const response = await Deliveries.send({
      signature: `signed:${approved}`,
      delivery: 'd-7',
      body: approved,
    });

    expect(response).toEqual({
      statusCode: 202,
      body: { deliveryId: 'd-7', status: 'recorded' },
    });
    expect(harness.deliveries.deliveries).toMatchObject([
      { deliveryId: 'd-7', installationId: '7' },
    ]);
  });
});

describe('ConnectionsModule webhook rejections', () => {
  it('rejects a bad signature and records nothing', async () => {
    const response = await Deliveries.send({
      signature: 'signed:something else',
      delivery: 'd-3',
    });

    expect(response).toMatchObject({
      statusCode: 401,
      body: { code: 'WEBHOOK_SIGNATURE_REJECTED' },
    });
    expect(harness.deliveries.deliveries).toEqual([]);
  });

  it('checks the signature before parsing, so malformed JSON with a bad signature is a 401', async () => {
    const response = await Deliveries.send({
      signature: 'signed:something else',
      delivery: 'd-5',
      body: '{"action":',
    });

    expect(response).toMatchObject({
      statusCode: 401,
      body: { code: 'WEBHOOK_SIGNATURE_REJECTED' },
    });
  });

  it('refuses a body over the limit before reading it', async () => {
    const oversized = `{"padding":"${'x'.repeat(5 * 1024 * 1024)}"}`;

    const response = await Deliveries.send({
      signature: `signed:${oversized}`,
      delivery: 'd-6',
      body: oversized,
    });

    expect(response.statusCode).toBe(413);
    expect(harness.deliveries.deliveries).toEqual([]);
  });
});
