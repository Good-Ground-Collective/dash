import type { ConnectFlow } from '@dash/integrations-core';
import { z } from 'zod';

import { webhookAcknowledgementSchema } from '#src/connections/contracts/connections.ts';
import { WebhookSignatureRejectedError } from '#src/connections/errors.ts';
import type { ConnectionRepository } from '#src/connections/repositories/connections/connection-repository.ts';
import type { WebhookDeliveryRepository } from '#src/connections/repositories/webhook-deliveries/webhook-delivery-repository.ts';
import type { ZodFastifyInstance } from '#src/platform/contracts/http-module.ts';

/**
 * GitHub caps a delivery at 25 MB, but the events the App subscribes to describe one pull
 * request, issue, check suite, run or project item, and stay far below 1 MB. The largest is
 * an `installation` event listing an account's repositories, at a few hundred bytes each, so
 * 5 MB still covers ten thousand of them. Anything larger is answered 413 before it is read.
 */
const webhookBodyLimitBytes = 5 * 1024 * 1024;

/** A delivery without a body reaches the handler without one, and fails the signature check. */
const rawBodySchema = z.instanceof(Buffer).catch(Buffer.alloc(0));

/**
 * `POST /integrations/<provider>/webhooks`: checks the delivery's signature over the exact body
 * bytes before anything parses them, records its id so a redelivery is spotted, and answers
 * 202. Only deliveries for an installation Dash has a connection for are stored; the App is
 * public, so any account can install it and send deliveries. Processing the events belongs
 * to the feed, so nothing else happens here yet.
 */
export class WebhookRoutes {
  private readonly provider: string;
  private readonly flow: ConnectFlow;
  private readonly connections: ConnectionRepository;
  private readonly deliveries: WebhookDeliveryRepository;

  constructor(props: {
    provider: string;
    flow: ConnectFlow;
    connections: ConnectionRepository;
    deliveries: WebhookDeliveryRepository;
  }) {
    this.provider = props.provider;
    this.flow = props.flow;
    this.connections = props.connections;
    this.deliveries = props.deliveries;
  }

  /** Registers the route in its own scope, whose only body parser keeps the bytes as a `Buffer`. */
  register(app: ZodFastifyInstance): void {
    void app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer', bodyLimit: webhookBodyLimitBytes },
        (_request, body, done) => {
          done(null, body);
        },
      );
      this.route(scope);
    });
  }

  private route(scope: ZodFastifyInstance): void {
    scope.post(
      `/integrations/${this.provider}/webhooks`,
      {
        bodyLimit: webhookBodyLimitBytes,
        schema: { response: { 202: webhookAcknowledgementSchema } },
      },
      async (request, reply) => {
        const delivery = await this.flow.verifyWebhook({
          headers: request.headers,
          body: rawBodySchema.parse(request.body),
        });
        if (delivery === null) {
          throw new WebhookSignatureRejectedError();
        }

        const known =
          delivery.installationId !== null &&
          (await this.connections.hasInstallation({
            provider: this.provider,
            installationId: delivery.installationId,
          }));
        if (!known) {
          return reply
            .code(202)
            .send({ deliveryId: delivery.deliveryId, status: 'ignored' });
        }
        const { duplicate } = await this.deliveries.record({
          provider: this.provider,
          delivery,
        });
        return reply.code(202).send({
          deliveryId: delivery.deliveryId,
          status: duplicate ? 'duplicate' : 'recorded',
        });
      },
    );
  }
}
