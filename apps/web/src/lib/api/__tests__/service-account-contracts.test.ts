import { describe, expect, it } from 'vitest';
import { serviceAccountListSchema } from '#lib/api/service-account-contracts.ts';

describe('serviceAccountListSchema', () => {
  it('drops scopes this build doesn’t know instead of failing the list', () => {
    const list = serviceAccountListSchema.parse({
      serviceAccounts: [
        {
          id: 'a1',
          kind: 'bench',
          name: 'Studio Mac',
          benchId: 'studio-mac',
          agentName: null,
          description: 'The desk machine',
          scopes: ['heartbeat:write', 'traces:write'],
          createdAt: '2026-11-26T18:00:00.000Z',
          keys: [
            {
              id: 'k1',
              start: 'dash_dev_AbCdEf',
              scopes: ['traces:write', 'telemetry:write'],
              createdAt: '2026-11-26T18:00:00.000Z',
              expiresAt: null,
              lastUsedAt: null,
            },
          ],
        },
      ],
    });

    expect(list.serviceAccounts[0]?.scopes).toEqual(['heartbeat:write']);
    expect(list.serviceAccounts[0]?.keys[0]?.scopes).toEqual([
      'telemetry:write',
    ]);
  });
});
