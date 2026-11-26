import { describe, expect, it } from 'vitest';

import { newServiceAccountSchema } from '#src/auth/contracts/service-account.ts';

const ciAgent = {
  kind: 'agent',
  name: 'CI reviewer',
  description: 'Runs in GitHub Actions',
  scopes: ['heartbeat:write'],
};

describe('newServiceAccountSchema identifiers', () => {
  it.each(['.', '..', '...'])(
    'refuses %s, which would be read as a path segment',
    (agentName) => {
      const parsed = newServiceAccountSchema.safeParse({
        ...ciAgent,
        agentName,
      });
      expect(parsed.success).toBe(false);
    },
  );

  it.each(['ci-reviewer', 'v1.2', '.hidden', 'a_b'])(
    'accepts %s',
    (agentName) => {
      const parsed = newServiceAccountSchema.safeParse({
        ...ciAgent,
        agentName,
      });
      expect(parsed.success).toBe(true);
    },
  );
});
