import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const stubSetupToken = 'stub-setup-token';

const setupCheckSchema = z.object({ token: z.string() });
const setupBeginSchema = setupCheckSchema.extend({
  name: z.string(),
  email: z.string(),
});

export interface SetupStubPerson {
  id: string;
  name: string;
  email: string;
}

export interface SetupStubAnswer {
  status: number;
  body: object;
}

/** Mission Control's setup token for the e2e tests: one fixed token, checked and begun in memory. */
export class SetupStub {
  /** Who a begun setup will create once their passkey registers. */
  pending: SetupStubPerson | null = null;

  reset(): void {
    this.pending = null;
  }

  /** Like Mission Control, checks the token without spending it. */
  check(props: { body: string; signedUp: boolean }): SetupStubAnswer {
    const input = setupCheckSchema.parse(JSON.parse(props.body || '{}'));
    return (
      this.refuse({ token: input.token, signedUp: props.signedUp }) ?? {
        status: 200,
        body: { valid: true },
      }
    );
  }

  begin(props: { body: string; signedUp: boolean }): SetupStubAnswer {
    const input = setupBeginSchema.parse(JSON.parse(props.body || '{}'));
    const refused = this.refuse({
      token: input.token,
      signedUp: props.signedUp,
    });
    if (refused !== null) return refused;
    this.pending = { id: randomUUID(), name: input.name, email: input.email };
    return { status: 200, body: { enrolment: 'setup-enrolment:stub' } };
  }

  private refuse(props: {
    token: string;
    signedUp: boolean;
  }): SetupStubAnswer | null {
    if (props.signedUp) {
      return SetupStub.fail({ status: 403, code: 'SETUP_CLOSED' });
    }
    if (props.token !== stubSetupToken) {
      return SetupStub.fail({ status: 401, code: 'SETUP_TOKEN_REJECTED' });
    }
    return null;
  }

  private static fail(props: {
    status: number;
    code: string;
  }): SetupStubAnswer {
    return {
      status: props.status,
      body: { code: props.code, message: props.code },
    };
  }
}
