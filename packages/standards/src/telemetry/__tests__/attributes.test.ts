import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  dashAttributes,
  genAiAttributes,
  genAiSemconvVersion,
} from '#src/telemetry/attributes.js';
import pinnedRelease from '#src/telemetry/semconv-v1.45.0.json' with { type: 'json' };

const pinned = z
  .object({ semconvVersion: z.string(), attributes: z.array(z.string()) })
  .parse(pinnedRelease);

describe('genAiAttributes', () => {
  it('is checked against the pinned release', () => {
    expect(pinned.semconvVersion).toBe(genAiSemconvVersion);
  });

  it.each(Object.values(genAiAttributes))(
    'names %s, which the pinned release defines',
    (name) => {
      expect(pinned.attributes).toContain(name);
    },
  );
});

describe('dashAttributes', () => {
  it.each(Object.values(dashAttributes))(
    'keeps %s in the dash namespace',
    (name) => {
      expect(name).toMatch(/^dash\./);
    },
  );
});
