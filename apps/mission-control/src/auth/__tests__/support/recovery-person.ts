import type { PasskeyBrowser } from '#src/auth/__tests__/support/passkey-browser.ts';
import { PasskeyIdentity } from '#src/auth/__tests__/support/passkey-identity.ts';
import {
  type RecoveryCodeSet,
  recoveryCodeSetSchema,
  type RecoveryCodeStatus,
  recoveryCodeStatusSchema,
  recoveryEnrolmentSchema,
} from '#src/auth/contracts/recovery.ts';

/** The first person, signed in on one browser, with recovery helpers around Dash's endpoints. */
export class RecoveryPerson {
  readonly fixture = new PasskeyIdentity();
  readonly email = 'ada@example.com';

  async signedIn(): Promise<PasskeyBrowser> {
    return this.fixture.firstPerson();
  }

  async generate(browser: PasskeyBrowser): Promise<RecoveryCodeSet> {
    const response = await browser.post('/recovery-codes/generate', '{}');
    if (!response.ok) {
      throw new Error(`Generate failed: ${await response.text()}`);
    }
    return recoveryCodeSetSchema.parse(await response.json());
  }

  async confirm(browser: PasskeyBrowser, setId: string): Promise<Response> {
    return browser.post('/recovery-codes/confirm', JSON.stringify({ setId }));
  }

  async status(browser: PasskeyBrowser): Promise<RecoveryCodeStatus> {
    const response = await browser.get('/recovery-codes/status');
    return recoveryCodeStatusSchema.parse(await response.json());
  }

  /** Generates and confirms a set, returning its codes. */
  async savedCodes(browser: PasskeyBrowser): Promise<string[]> {
    const set = await this.generate(browser);
    const confirmed = await this.confirm(browser, set.setId);
    if (!confirmed.ok) {
      throw new Error(`Confirm failed: ${await confirmed.text()}`);
    }
    return set.codes;
  }

  async redeem(
    browser: PasskeyBrowser,
    props: { code: string; email?: string },
  ): Promise<Response> {
    return browser.post(
      '/recovery/redeem',
      JSON.stringify({ email: props.email ?? this.email, code: props.code }),
    );
  }

  /** Redeems a code on a new device and registers that device's passkey, as `/recover` does. */
  async recover(
    browser: PasskeyBrowser,
    props: { code: string; email?: string },
  ): Promise<Response> {
    const redeemed = await this.redeem(browser, props);
    if (!redeemed.ok) {
      return redeemed;
    }
    const { enrolment } = recoveryEnrolmentSchema.parse(await redeemed.json());
    return browser.registerPasskey({ context: enrolment, createSession: true });
  }
}
