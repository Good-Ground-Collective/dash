import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const passkeyIdSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

export interface StubPasskey {
  id: string;
  credentialId: string;
  name: string | null;
  createdAt: string;
  deviceType: string;
  backedUp: boolean;
}

export interface PasskeysReply {
  status: number;
  body: object;
}

/** The one person's passkeys, for `MissionControlStub`: listed, renamed and removed as Mission Control's passkey plugin does. */
export class PasskeysStub {
  private passkeys: StubPasskey[] = [];

  get all(): readonly StubPasskey[] {
    return this.passkeys;
  }

  reset(): void {
    this.passkeys = [];
  }

  add(props: { credentialId: string; name: string | null }): StubPasskey {
    const passkey: StubPasskey = {
      id: randomUUID(),
      credentialId: props.credentialId,
      name: props.name,
      createdAt: new Date().toISOString(),
      deviceType: 'multiDevice',
      backedUp: true,
    };
    this.passkeys.push(passkey);
    return passkey;
  }

  knows(credentialId: string): boolean {
    return this.passkeys.some(
      (passkey) => passkey.credentialId === credentialId,
    );
  }

  /** Passkey paths for a signed-in person, or `null` for any other. */
  route(props: { path: string; body: string }): PasskeysReply | null {
    switch (props.path) {
      case '/passkey/list-user-passkeys':
        return { status: 200, body: this.passkeys };
      case '/passkey/update-passkey':
        return this.rename(props.body);
      case '/passkey/delete-passkey':
        return this.remove(props.body);
      default:
        return null;
    }
  }

  private rename(body: string): PasskeysReply {
    const input = passkeyIdSchema.parse(JSON.parse(body || '{}'));
    const passkey = this.passkeys.find(
      (candidate) => candidate.id === input.id,
    );
    if (passkey === undefined) {
      return PasskeysStub.fail(404, 'PASSKEY_NOT_FOUND');
    }
    passkey.name = input.name ?? passkey.name;
    return { status: 200, body: { passkey } };
  }

  private remove(body: string): PasskeysReply {
    const input = passkeyIdSchema.parse(JSON.parse(body || '{}'));
    if (this.passkeys.length <= 1) {
      return PasskeysStub.fail(409, 'LAST_PASSKEY');
    }
    this.passkeys = this.passkeys.filter((passkey) => passkey.id !== input.id);
    return { status: 200, body: { status: true } };
  }

  private static fail(status: number, code: string): PasskeysReply {
    return { status, body: { code, message: code } };
  }
}
