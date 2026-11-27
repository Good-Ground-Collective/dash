import { describe, expect, it } from 'vitest';
import type { PasskeyAuth } from '#lib/auth/passkey-auth.ts';
import { PasskeyAuthError } from '#lib/auth/passkey-auth-error.ts';
import { passkeyWording } from '#lib/auth/passkey-wording.ts';
import { SetupFlow } from '#lib/auth/setup-flow.ts';

class FakeSetup implements Pick<PasskeyAuth, 'checkSetupToken' | 'setUp'> {
  readonly checked: string[] = [];
  readonly begun: { token: string; name: string; email: string }[] = [];
  checkFails: PasskeyAuthError | null = null;
  setUpFails: PasskeyAuthError | null = null;

  async checkSetupToken(props: { token: string }): Promise<void> {
    this.checked.push(props.token);
    if (this.checkFails !== null) throw this.checkFails;
  }

  async setUp(props: {
    token: string;
    name: string;
    email: string;
  }): Promise<void> {
    this.begun.push(props);
    if (this.setUpFails !== null) throw this.setUpFails;
  }
}

const rejected = new PasskeyAuthError({
  code: 'SETUP_TOKEN_REJECTED',
  status: 401,
});
const closed = new PasskeyAuthError({ code: 'SETUP_CLOSED', status: 403 });

class Harness {
  readonly auth = new FakeSetup();
  readonly flow = new SetupFlow({ auth: this.auth, wording: passkeyWording });
}

describe('SetupFlow token step', () => {
  it('starts on the token step', () => {
    expect(SetupFlow.start()).toEqual({ step: 'token', error: null });
  });

  it('moves to the account step with the trimmed token once it checks out', async () => {
    const { auth, flow } = new Harness();

    const next = await flow.checkToken({ token: '  abc123 \n' });

    expect(auth.checked).toEqual(['abc123']);
    expect(next).toEqual({ step: 'account', token: 'abc123', error: null });
  });

  it('stays on the token step with the reason when the token is wrong', async () => {
    const { auth, flow } = new Harness();
    auth.checkFails = rejected;

    const next = await flow.checkToken({ token: 'guess' });

    expect(next).toEqual({
      step: 'token',
      error: passkeyWording.explain(rejected),
    });
    expect(auth.begun).toEqual([]);
  });
});

describe('SetupFlow once someone else has finished setup', () => {
  it('closes from the token step', async () => {
    const { auth, flow } = new Harness();
    auth.checkFails = closed;

    expect(await flow.checkToken({ token: 'abc123' })).toEqual({
      step: 'closed',
    });
  });

  it('closes from the account step', async () => {
    const { auth, flow } = new Harness();
    auth.setUpFails = closed;

    const next = await flow.createAccount({
      token: 'abc123',
      name: 'Ada',
      email: 'ada@example.com',
    });

    expect(next).toEqual({ step: 'closed' });
  });
});

describe('SetupFlow account step', () => {
  it('creates the account with the checked token and trimmed details', async () => {
    const { auth, flow } = new Harness();

    const next = await flow.createAccount({
      token: 'abc123',
      name: ' Ada Lovelace ',
      email: ' ada@example.com ',
    });

    expect(next).toEqual({ step: 'done' });
    expect(auth.begun).toEqual([
      { token: 'abc123', name: 'Ada Lovelace', email: 'ada@example.com' },
    ]);
  });

  it('returns to the token step when begin rejects the token', async () => {
    const { auth, flow } = new Harness();
    auth.setUpFails = rejected;

    const next = await flow.createAccount({
      token: 'abc123',
      name: 'Ada',
      email: 'ada@example.com',
    });

    expect(next).toEqual({
      step: 'token',
      error: passkeyWording.explain(rejected),
    });
  });

  it('stays on the account step for any other failure, keeping the token', async () => {
    const { auth, flow } = new Harness();
    auth.setUpFails = new PasskeyAuthError({
      code: 'NotAllowedError',
      status: 0,
    });

    const next = await flow.createAccount({
      token: 'abc123',
      name: 'Ada',
      email: 'ada@example.com',
    });

    expect(next).toEqual({
      step: 'account',
      token: 'abc123',
      error: 'The passkey prompt was closed or timed out. Try again.',
    });
  });
});
