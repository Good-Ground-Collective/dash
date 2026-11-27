import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { MissionControlEndpoint } from '#lib/api/mission-control-endpoint.ts';
import { MissionControlError } from '#lib/api/mission-control-error.ts';
import { reportedCharacterHueSchema } from '#lib/theme/character-hue.ts';

describe('MissionControlEndpoint', () => {
  it('resolves paths under a base URL with a path prefix', () => {
    const endpoint = new MissionControlEndpoint({
      baseUrl: 'https://h.test/base',
    });

    expect(endpoint.url('api/auth/x').href).toBe(
      'https://h.test/base/api/auth/x',
    );
  });

  it.each(['ftp://h.test', 'not a url'])('refuses %s', (baseUrl) => {
    expect(() => new MissionControlEndpoint({ baseUrl })).toThrow(ZodError);
  });

  it('rejects a 2xx answer whose body is not JSON', async () => {
    const endpoint = new MissionControlEndpoint({ baseUrl: 'https://h.test' });

    await expect(
      endpoint.read({
        path: 'api/auth/get-session',
        response: new Response('<html>proxy</html>', { status: 200 }),
        schema: reportedCharacterHueSchema,
      }),
    ).rejects.toBeInstanceOf(MissionControlError);
  });
});
