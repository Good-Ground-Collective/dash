import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { ConnectPaths } from '#src/connections/services/connect-paths/connect-paths.ts';

describe('ConnectPaths', () => {
  it('builds the routes, callback and default return path for a provider', () => {
    const paths = new ConnectPaths({
      provider: 'github',
      baseUrl: 'https://api.example.com/',
    });

    expect({ ...paths }).toEqual({
      provider: 'github',
      prefix: '/integrations/github',
      callbackUrl: 'https://api.example.com/integrations/github/callback',
      defaultReturnTo: '/setup/github',
    });
  });

  it.each([
    { provider: 'github', baseUrl: 'not a url' },
    { provider: 'github', baseUrl: 'ftp://api.example.com' },
    { provider: 'Git Hub', baseUrl: 'https://api.example.com' },
  ])('rejects $provider at $baseUrl', (props) => {
    expect(() => new ConnectPaths(props)).toThrow(ZodError);
  });
});
