import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { z } from 'zod';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';

/** Registration options as Mission Control's passkey plugin sends them. The browser validates the details. */
export const registrationOptionsSchema =
  z.custom<PublicKeyCredentialCreationOptionsJSON>(
    (value) =>
      value instanceof Object && 'challenge' in value && 'user' in value,
  );

/** Authentication options as Mission Control's passkey plugin sends them. */
export const authenticationOptionsSchema =
  z.custom<PublicKeyCredentialRequestOptionsJSON>(
    (value) => value instanceof Object && 'challenge' in value,
  );

/** The browser's passkey prompts. A fake stands in for them in unit tests. */
export interface WebAuthnCeremonies {
  register(props: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON>;
  /** With `autofill`, waits for the person to pick a passkey from the browser's autofill instead of prompting. */
  authenticate(props: {
    options: PublicKeyCredentialRequestOptionsJSON;
    autofill: boolean;
  }): Promise<AuthenticationResponseJSON>;
}

/** `navigator.credentials` through SimpleWebAuthn. A cancelled or failed prompt becomes a `PasskeyAuthError`. */
export class BrowserWebAuthnCeremonies implements WebAuthnCeremonies {
  async register(props: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON> {
    return this.ceremony(async () =>
      startRegistration({ optionsJSON: props.options }),
    );
  }

  async authenticate(props: {
    options: PublicKeyCredentialRequestOptionsJSON;
    autofill: boolean;
  }): Promise<AuthenticationResponseJSON> {
    return this.ceremony(async () =>
      startAuthentication({
        optionsJSON: props.options,
        useBrowserAutofill: props.autofill,
      }),
    );
  }

  private async ceremony<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw error instanceof Error
        ? BrowserWebAuthnCeremonies.failure(error)
        : new PasskeyAuthError({ code: 'CEREMONY_FAILED', status: 0 });
    }
  }

  /**
   * What a cancelled or failed prompt becomes. SimpleWebAuthn passes a `NotAllowedError`, such as
   * a closed prompt, through as its cause, so that name is the code.
   */
  static failure(error: Error): PasskeyAuthError {
    let code = 'CEREMONY_FAILED';
    if (error instanceof WebAuthnError) {
      code =
        error.code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' &&
        error.cause instanceof Error
          ? error.cause.name
          : error.code;
    }
    return new PasskeyAuthError({ code, message: error.message, status: 0 });
  }
}
