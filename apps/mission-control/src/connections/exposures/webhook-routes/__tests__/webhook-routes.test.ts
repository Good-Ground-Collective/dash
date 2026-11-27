import { afterEach, describe, expect, it } from 'vitest';

import { ConnectionsHarness } from '#src/connections/__tests__/support/connections-harness.ts';

const harness = new ConnectionsHarness();
const payload = '{ "action": "created",  "installation": { "id": 42 } }';

afterEach(async () => {
  harness.deliveries.deliveries.splice(0);
  await harness.stop();
});

class Deliveries {
  static async send(props: {
    signature: string;
    delivery: string;
  }): Promise<{ statusCode: number; body: unknown }> {
    const app = await harness.start();
    const response = await app.inject({
      method: 'POST',
      url: '/integrations/github/webhooks',
      headers: {
        'content-type': 'application/json',
        'x-signature': props.signature,
        'x-delivery': props.delivery,
      },
      payload,
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
      body: { deliveryId: 'delivery-1', duplicate: false },
    });
    expect(harness.deliveries.deliveries).toEqual([
      {
        provider: 'github',
        deliveryId: 'delivery-1',
        event: 'installation',
        installationId: '42',
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
      body: { deliveryId: 'd-2', duplicate: true },
    });
    expect(harness.deliveries.deliveries).toHaveLength(1);
  });

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
});
