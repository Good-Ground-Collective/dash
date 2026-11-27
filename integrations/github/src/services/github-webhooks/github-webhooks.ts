import type { WebhookDelivery, WebhookHeaders } from '@dash/integrations-core';
import { verify } from '@octokit/webhooks-methods';
import { z } from 'zod';

/** A repeated header arrives as an array, which no genuine delivery sends. */
const webhookHeadersSchema = z.object({
  'x-hub-signature-256': z.string().min(1),
  'x-github-delivery': z.string().min(1),
  'x-github-event': z.string().min(1),
});

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

/** Checks `X-Hub-Signature-256`, GitHub's HMAC-SHA256 of the body under the webhook secret. */
export class GithubWebhooks {
  private readonly secret: string;

  constructor(props: { secret: string }) {
    this.secret = props.secret;
  }

  async verify(props: {
    headers: WebhookHeaders;
    body: string;
  }): Promise<WebhookDelivery | null> {
    const headers = webhookHeadersSchema.safeParse(props.headers);
    if (
      !headers.success ||
      !(await verify(
        this.secret,
        props.body,
        headers.data['x-hub-signature-256'],
      ))
    ) {
      return null;
    }

    const body = webhookBodySchema.safeParse(props.body);
    const installationId = body.success
      ? body.data.installation?.id
      : undefined;
    return {
      deliveryId: headers.data['x-github-delivery'],
      event: headers.data['x-github-event'],
      installationId:
        installationId === undefined ? null : String(installationId),
    };
  }
}
