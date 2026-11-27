import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  type InstallationChange,
  type WebhookDelivery,
  type WebhookHeaders,
  webhookPayloadSchema,
} from '@dash/integrations-core';
import { z } from 'zod';

/** A repeated header arrives as an array, which no genuine delivery sends. */
const webhookHeadersSchema = z
  .object({
    'x-hub-signature-256': z.string().regex(/^sha256=[\da-f]{64}$/u),
    'x-github-delivery': z.string().min(1),
    'x-github-event': z.string().min(1),
  })
  .transform((headers) => ({
    signature: headers['x-hub-signature-256'],
    deliveryId: headers['x-github-delivery'],
    event: headers['x-github-event'],
  }));

/** Events about the installation itself rather than activity inside it. */
const lifecycleEvents: ReadonlySet<string> = new Set([
  'installation',
  'installation_repositories',
]);

/** Keyed by `<event>.<action>`. Other installation events leave a recorded connection as it is. */
const installationChanges: ReadonlyMap<string, InstallationChange> = new Map([
  ['installation.deleted', 'removed'],
  ['installation.suspend', 'suspended'],
  ['installation.unsuspend', 'unsuspended'],
  ['installation_repositories.added', 'repositoriesChanged'],
  ['installation_repositories.removed', 'repositoriesChanged'],
]);

/** The fields Dash reads. A malformed one reads as absent rather than failing the delivery. */
const webhookFieldsSchema = z
  .object({
    action: z.string().min(1).optional().catch(undefined),
    installation: z.object({ id: z.number() }).optional().catch(undefined),
  })
  .transform((fields) => ({
    action: fields.action ?? null,
    installationId:
      fields.installation === undefined ? null : String(fields.installation.id),
  }));

const webhookBodySchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a JSON body' });
      return z.NEVER;
    }
  })
  .pipe(webhookPayloadSchema)
  .transform((payload) => ({
    ...webhookFieldsSchema.parse(payload),
    payload,
  }));

/** Checks `X-Hub-Signature-256`, GitHub's HMAC-SHA256 of the body bytes under the webhook secret, before reading the body. */
export class GithubWebhooks {
  private readonly secret: string;

  constructor(props: { secret: string }) {
    this.secret = props.secret;
  }

  async verify(props: {
    headers: WebhookHeaders;
    body: Uint8Array;
  }): Promise<WebhookDelivery | null> {
    const headers = webhookHeadersSchema.safeParse(props.headers);
    if (
      !headers.success ||
      !this.signed({ body: props.body, signature: headers.data.signature })
    ) {
      return null;
    }

    const body = webhookBodySchema.safeParse(
      Buffer.from(props.body).toString('utf8'),
    );
    const { event } = headers.data;
    const { action, installationId, payload } = body.success
      ? body.data
      : { action: null, installationId: null, payload: null };
    return {
      deliveryId: headers.data.deliveryId,
      event,
      action,
      installationId,
      installationLifecycle: lifecycleEvents.has(event),
      installationChange:
        installationChanges.get(`${event}.${action ?? ''}`) ?? null,
      payload,
    };
  }

  private signed(props: { body: Uint8Array; signature: string }): boolean {
    const expected = createHmac('sha256', this.secret)
      .update(props.body)
      .digest();
    const given = Buffer.from(props.signature.slice('sha256='.length), 'hex');
    return timingSafeEqual(expected, given);
  }
}
