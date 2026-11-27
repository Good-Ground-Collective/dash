import { createHmac, timingSafeEqual } from 'node:crypto';

import type { WebhookDelivery, WebhookHeaders } from '@dash/integrations-core';
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
  .pipe(z.object({ installation: z.object({ id: z.number() }).optional() }));

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
    const installationId = body.success
      ? body.data.installation?.id
      : undefined;
    return {
      deliveryId: headers.data.deliveryId,
      event: headers.data.event,
      installationId:
        installationId === undefined ? null : String(installationId),
      installationLifecycle: lifecycleEvents.has(headers.data.event),
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
