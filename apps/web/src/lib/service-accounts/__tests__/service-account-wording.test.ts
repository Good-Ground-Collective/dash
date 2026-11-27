import { describe, expect, it } from 'vitest';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import type {
  ApiKeySummary,
  ServiceAccount,
} from '#lib/api/service-account-contracts.ts';
import { serviceAccountWording } from '#lib/service-accounts/service-account-wording.ts';

const now = new Date('2026-11-26T18:00:00Z');

class Samples {
  static key(overrides: Partial<ApiKeySummary> = {}): ApiKeySummary {
    return {
      id: 'k1',
      start: 'dash_live_AbCdEf',
      scopes: ['heartbeat:write'],
      createdAt: new Date('2026-11-01T00:00:00Z'),
      expiresAt: null,
      lastUsedAt: null,
      ...overrides,
    };
  }

  static account(keys: ApiKeySummary[]): ServiceAccount {
    return {
      id: 'a1',
      kind: 'bench',
      name: 'Studio Mac',
      benchId: 'studio-mac',
      agentName: null,
      description: 'The desk machine',
      hue: 'teal',
      scopes: ['heartbeat:write'],
      createdAt: new Date('2026-11-01T00:00:00Z'),
      keys,
    };
  }
}

const key = Samples.key.bind(Samples);
const account = Samples.account.bind(Samples);

describe('ServiceAccountWording', () => {
  it('says how long ago a key was used', () => {
    const minutesAgo = (minutes: number): Date =>
      new Date(now.getTime() - minutes * 60_000);

    expect(serviceAccountWording.used(null, now)).toBe('Never used');
    expect(serviceAccountWording.used(minutesAgo(0.5), now)).toBe(
      'Used just now',
    );
    expect(serviceAccountWording.used(minutesAgo(4), now)).toBe(
      'Used 4 minutes ago',
    );
    expect(serviceAccountWording.used(minutesAgo(120), now)).toBe(
      'Used 2 hours ago',
    );
    expect(serviceAccountWording.used(minutesAgo(60 * 24), now)).toBe(
      'Used yesterday',
    );
    expect(serviceAccountWording.used(minutesAgo(60 * 24 * 45), now)).toBe(
      'Last used Oct 12, 2026',
    );
  });
});

describe('ServiceAccountWording accounts and errors', () => {
  it('takes an account’s latest use across its keys', () => {
    const latest = new Date('2026-11-26T17:00:00Z');

    expect(
      serviceAccountWording.lastUsed(
        account([
          key({ lastUsedAt: new Date('2026-11-20T00:00:00Z') }),
          key({ id: 'k2', lastUsedAt: latest }),
          key({ id: 'k3' }),
        ]),
      ),
    ).toEqual(latest);
    expect(serviceAccountWording.lastUsed(account([key()]))).toBeNull();
  });

  it('describes expiry', () => {
    expect(serviceAccountWording.expiry(key(), now)).toBe('Never expires');
    expect(
      serviceAccountWording.expiry(
        key({ expiresAt: new Date('2027-02-24T12:00:00Z') }),
        now,
      ),
    ).toBe('Expires Feb 24, 2027');
    expect(
      serviceAccountWording.expiry(
        key({ expiresAt: new Date('2026-11-01T00:00:00Z') }),
        now,
      ),
    ).toBe('Expired');
  });

  it('explains known codes and passes others through', () => {
    expect(
      serviceAccountWording.explain(
        new MissionControlError({
          path: 'x',
          status: 403,
          code: 'SESSION_NOT_FRESH',
        }),
      ),
    ).toBe('Confirm it’s you with a passkey to change service accounts.');
    expect(
      serviceAccountWording.explain(
        new MissionControlError({
          path: 'x',
          status: 409,
          code: 'SERVICE_ACCOUNT_TAKEN',
          message: 'A service account for “studio-mac” already exists.',
        }),
      ),
    ).toBe('A service account for “studio-mac” already exists.');
  });
});
