import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeConnectFlow } from '#src/connections/__tests__/support/fake-connect-flow.ts';
import {
  InMemoryConnectionRepository,
  InMemoryLinkedAccountRepository,
} from '#src/connections/__tests__/support/in-memory-connections.ts';
import {
  AccountLinkedElsewhereError,
  AccountNotLinkedError,
} from '#src/connections/errors.ts';
import { OwnedConnections } from '#src/connections/services/owned-connections/owned-connections.ts';
import { AesGcmTokenCipher } from '#src/connections/services/token-cipher/token-cipher.ts';

const adaId = '00000000-0000-4000-8000-00000000000a';
const graceId = '00000000-0000-4000-8000-00000000000b';
const redirectUrl = 'http://localhost:3000/integrations/github/callback';

class Subject {
  readonly flow = new FakeConnectFlow();
  readonly linkedAccounts = new InMemoryLinkedAccountRepository();
  readonly owned: OwnedConnections;

  constructor(props: { now: string }) {
    Subject.setClock(props.now);
    this.owned = this.build();
  }

  build(props: { secret?: string } = {}): OwnedConnections {
    return new OwnedConnections({
      provider: 'github',
      flow: this.flow,
      connections: new InMemoryConnectionRepository(),
      linkedAccounts: this.linkedAccounts,
      cipher: new AesGcmTokenCipher({
        secret: props.secret ?? 'test-secret-that-is-at-least-32-characters',
      }),
    });
  }

  static setClock(now: string): void {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('OwnedConnections userGrant', () => {
  it('returns the stored token while it is fresh', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });

    await expect(
      subject.owned.userGrant({ userId: adaId }),
    ).resolves.toMatchObject({ accessToken: 'access-1' });
    expect(subject.flow.refreshed).toEqual([]);
  });

  it('refreshes an expired token and keeps the new one', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    Subject.setClock('2026-11-26T21:00:00Z');
    const later = subject.build();

    await expect(later.userGrant({ userId: adaId })).resolves.toMatchObject({
      accessToken: 'access-2',
    });
    await expect(later.userGrant({ userId: adaId })).resolves.toMatchObject({
      accessToken: 'access-2',
    });
    expect(subject.flow.refreshed).toEqual(['refresh-1']);
  });

  it('asks for a new authorization once the refresh token has expired too', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    Subject.setClock('2027-06-01T00:00:00Z');
    const muchLater = subject.build();

    await expect(muchLater.userGrant({ userId: adaId })).resolves.toBeNull();
  });

  it('asks for a new authorization after the auth secret rotates', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    const rotated = subject.build({
      secret: 'a-rotated-secret-that-is-32-characters',
    });

    await expect(rotated.userGrant({ userId: adaId })).resolves.toBeNull();
  });
});

describe('OwnedConnections refused grants', () => {
  it('asks for a new authorization when the provider refuses the refresh token', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    subject.flow.refusesRefresh = true;
    Subject.setClock('2026-11-26T21:00:00Z');

    await expect(
      subject.owned.userGrant({ userId: adaId }),
    ).resolves.toBeNull();
  });

  it('spends the refresh token once when requests arrive together', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    Subject.setClock('2026-11-26T21:00:00Z');

    const grants = await Promise.all([
      subject.owned.userGrant({ userId: adaId }),
      subject.owned.userGrant({ userId: adaId }),
    ]);

    expect(grants.map((grant) => grant?.accessToken)).toEqual([
      'access-2',
      'access-2',
    ]);
    expect(subject.flow.refreshed).toEqual(['refresh-1']);
  });

  it('treats a refused token as unlinked when recording an installation', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: adaId, code: 'good', redirectUrl });
    subject.flow.revoked.add('access-1');

    await expect(
      subject.owned.recordInstallation({ userId: adaId, installationId: '42' }),
    ).rejects.toThrow(AccountNotLinkedError);
  });
});

describe('OwnedConnections link', () => {
  it('refuses a provider account another principal already linked', async () => {
    const subject = new Subject({ now: '2026-11-26T12:00:00Z' });
    await subject.owned.link({ userId: graceId, code: 'good', redirectUrl });

    await expect(
      subject.owned.link({ userId: adaId, code: 'good', redirectUrl }),
    ).rejects.toThrow(AccountLinkedElsewhereError);
  });
});
