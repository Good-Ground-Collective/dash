import { z } from 'zod';

import { SessionNotFreshError } from '#src/auth/errors.ts';

/** How long after a passkey sign-in a session may change credentials: passkeys, service accounts and their keys. */
export const freshSessionSeconds = 15 * 60;

export const freshSessionSettingsSchema = z.object({
  maxAgeSeconds: z.number().int().positive(),
});

export interface FreshSession {
  /** Rejects with `SessionNotFreshError` unless the session started within the window. */
  assert(props: { createdAt: Date | string }): void;
}

export class MaxAgeFreshSession implements FreshSession {
  private readonly maxAgeSeconds: number;

  constructor(props: z.input<typeof freshSessionSettingsSchema>) {
    this.maxAgeSeconds = freshSessionSettingsSchema.parse(props).maxAgeSeconds;
  }

  assert(props: { createdAt: Date | string }): void {
    const age = Date.now() - new Date(props.createdAt).getTime();
    if (age >= this.maxAgeSeconds * 1000) {
      throw new SessionNotFreshError({
        freshMinutes: Math.round(this.maxAgeSeconds / 60),
      });
    }
  }
}
