import type { Passkey } from '#lib/api/mission-control.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';

const messages: ReadonlyMap<string, string> = new Map([
  [
    'SETUP_TOKEN_REJECTED',
    'That setup token isn’t the current one. Copy the newest one from Mission Control’s log.',
  ],
  ['SETUP_CLOSED', 'Setup is already done. Sign in with your passkey instead.'],
  [
    'LAST_PASSKEY',
    'This is your only passkey. Add another before removing it.',
  ],
  [
    'SESSION_NOT_FRESH',
    'Confirm it’s you with a passkey to change your passkeys.',
  ],
  ['PASSKEY_NOT_FOUND', 'That passkey isn’t registered with Dash.'],
  [
    'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
    'This device already has a passkey for Dash.',
  ],
  ['ERROR_CEREMONY_ABORTED', 'The passkey prompt was cancelled.'],
  ['ERROR_PASSKEY_AUTOFILL_INPUT_NOT_FOUND', 'Passkey autofill isn’t ready.'],
]);

const createdFormat = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/** What the passkey pages say about errors and passkeys. */
export class PasskeyWording {
  /** A sentence for the person, from Mission Control's or the browser's error code. */
  explain(cause: unknown): string {
    if (!(cause instanceof PasskeyAuthError)) {
      return 'Something went wrong. Try again.';
    }
    const error = cause;
    if (
      error.code === 'NotAllowedError' ||
      error.code === 'ERROR_NOT_ALLOWED'
    ) {
      return 'The passkey prompt was closed or timed out. Try again.';
    }
    return messages.get(error.code) ?? error.message;
  }

  /** True for errors that only mean the person dismissed or replaced a prompt. */
  isCancellation(cause: unknown): boolean {
    return (
      cause instanceof PasskeyAuthError &&
      ['ERROR_CEREMONY_ABORTED', 'AbortError'].includes(cause.code)
    );
  }

  label(passkey: Passkey): string {
    const name = passkey.name?.trim();
    return name === undefined || name === '' ? 'Unnamed passkey' : name;
  }

  detail(passkey: Passkey): string {
    const reach = passkey.backedUp
      ? 'Synced across your devices'
      : 'On one device';
    return `Added ${createdFormat.format(passkey.createdAt)} · ${reach}`;
  }
}

export const passkeyWording = new PasskeyWording();
