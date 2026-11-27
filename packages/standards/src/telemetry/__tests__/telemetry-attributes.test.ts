import { describe, expect, it } from 'vitest';

import { dashAttributes, genAiAttributes } from '#src/telemetry/attributes.js';
import { telemetryAttributesSchema } from '#src/telemetry/telemetry-attributes.js';

describe('telemetryAttributesSchema', () => {
  it('has a key for every attribute constant and nothing else', () => {
    expect([...telemetryAttributesSchema.keyof().options].sort()).toEqual(
      [
        ...Object.values(genAiAttributes),
        ...Object.values(dashAttributes),
      ].sort(),
    );
  });

  it('parses a partial attribute set and drops keys it does not know', () => {
    const parsed = telemetryAttributesSchema.parse({
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.usage.input_tokens': 1200,
      'dash.usage.cost_usd': 0.042,
      'gen_ai.usage.prompt_tokens': 1200,
    });

    expect(parsed).toEqual({
      'gen_ai.provider.name': 'anthropic',
      'gen_ai.usage.input_tokens': 1200,
      'dash.usage.cost_usd': 0.042,
    });
  });
});
