import type { ConnectFlow } from '@dash/integrations-core';

import { webhookAcknowledgementSchema } from '#src/connections/contracts/connections.ts';
import { WebhookSignatureRejectedError } from '#src/connections/errors.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';
import { RawBody } from '#src/platform/exposures/raw-body/raw-body.ts';

/** GitHub caps a delivery at 25 MB; Fastify's default limit is 1 MB. */
const webhookBodyLimitBytes = 25 * 1024 * 1024;

/**
 * `POST /integrations/<provider>/webhooks`: verifies the delivery's signature over the exact
 * body bytes, records its id so a redelivery is spotted, and answers 202. Processing the
 * events belongs to the feed (#26), so nothing else happens here yet.
 */
export class WebhookRoutes {
  private readonly provider: string;
  private readonly flow: ConnectFlow;
  private readonly deliveries: WebhookDeliveryRepository;

  constructor(props: {
    provider: string;
    flow: ConnectFlow;
    deliveries: WebhookDeliveryRepository;
  }) {
    this.provider = props.provider;
    this.flow = props.flow;
    this.deliveries = props.deliveries;
  }

  register(app: ZodFastifyInstance): void {
    RawBody.capture(app);
    app.post(
      `/integrations/${this.provider}/webhooks`,
      {
        bodyLimit: webhookBodyLimitBytes,
        schema: { response: { 202: webhookAcknowledgementSchema } },
      },
      async (request, reply) => {
        const delivery = await this.flow.verifyWebhook({
          headers: request.headers,
          body: request.rawBody?.toString('utf8') ?? '',
        });
        if (delivery === null) {
          throw new WebhookSignatureRejectedError();
        }

        const { duplicate } = await this.deliveries.record({
          provider: this.provider,
          delivery,
        });
        return reply
          .code(202)
          .send({ deliveryId: delivery.deliveryId, duplicate });
      },
    );
  }
}
