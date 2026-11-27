import {
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { z } from 'zod';

import { returnToSchema } from '#src/connections/contracts/connections.ts';

const keyInfo = 'dash/connections/connect-state/v1';
const lifetimeSeconds = 600;

const statePayloadSchema = z.object({
  userId: z.uuid(),
  provider: z.string().min(1),
  returnTo: returnToSchema,
  expiresAt: z.number().int(),
  nonce: z.string().min(1),
  targetAccountId: z.string().min(1).optional(),
  installationId: z.string().min(1).optional(),
});

const stateJsonSchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected JSON' });
      return z.NEVER;
    }
  })
  .pipe(statePayloadSchema);

export type ConnectStatePayload = z.infer<typeof statePayloadSchema>;

/** What a state carries besides its expiry and nonce. */
export interface ConnectStateRequest {
  userId: string;
  provider: string;
  returnTo: string;
  /** The account an install link preselects, so a `request` callback knows which one was asked for. */
  targetAccountId?: string;
  /** An installation waiting for the person to authorize, so the callback can record it. */
  installationId?: string;
}

/** The `state` a provider hands back to its callbacks, binding them to the person who started the flow. */
export interface ConnectState {
  issue(request: ConnectStateRequest): string;
  /** The payload when the state is authentic, unexpired and issued to `userId` for `provider`, otherwise null. */
  read(props: {
    token: string;
    userId: string;
    provider: string;
  }): ConnectStatePayload | null;
}

/**
 * A stateless, HMAC-SHA256-signed state, valid for ten minutes. The key is derived with HKDF
 * from Mission Control's auth secret. Binding it to the signed-in person is the CSRF check:
 * a callback started by someone else's browser carries a state issued to someone else.
 */
export class SignedConnectState implements ConnectState {
  private readonly key: Buffer;

  constructor(props: { secret: string }) {
    this.key = Buffer.from(
      hkdfSync('sha256', props.secret, Buffer.alloc(0), keyInfo, 32),
    );
  }

  issue(request: ConnectStateRequest): string {
    const payload: ConnectStatePayload = {
      ...request,
      expiresAt: Math.floor(Date.now() / 1000) + lifetimeSeconds,
      nonce: randomBytes(16).toString('base64url'),
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    return `${body}.${this.sign(body).toString('base64url')}`;
  }

  read(props: {
    token: string;
    userId: string;
    provider: string;
  }): ConnectStatePayload | null {
    const [body, signature, ...rest] = props.token.split('.');
    if (body === undefined || signature === undefined || rest.length > 0) {
      return null;
    }
    const expected = this.sign(body);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }

    const parsed = stateJsonSchema.safeParse(
      Buffer.from(body, 'base64url').toString('utf8'),
    );
    if (
      !parsed.success ||
      parsed.data.userId !== props.userId ||
      parsed.data.provider !== props.provider ||
      parsed.data.expiresAt * 1000 <= Date.now()
    ) {
      return null;
    }
    return parsed.data;
  }

  private sign(body: string): Buffer {
    return createHmac('sha256', this.key).update(body).digest();
  }
}
