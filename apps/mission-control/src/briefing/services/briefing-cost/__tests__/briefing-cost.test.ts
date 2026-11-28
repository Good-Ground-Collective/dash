import { describe, expect, it } from 'vitest';

import { BriefingCost } from '#src/briefing/services/briefing-cost/briefing-cost.ts';

const prices = {
  inputUsdPerMTok: 0.1,
  cachedInputUsdPerMTok: 0.01,
  outputUsdPerMTok: 0.5,
};

describe('BriefingCost', () => {
  it('prices uncached input, cached input and output at their own rates', () => {
    const costMicroUsd = BriefingCost.price({
      tokens: {
        input: 1_000_000,
        cachedInput: 400_000,
        output: 200_000,
        reasoning: 0,
      },
      prices,
    });

    expect(costMicroUsd).toBe(60_000 + 4_000 + 100_000);
  });

  it('counts reasoning tokens once, inside output', () => {
    const tokens = { input: 0, cachedInput: 0, output: 1_000_000 };

    expect(
      BriefingCost.price({ tokens: { ...tokens, reasoning: 900_000 }, prices }),
    ).toBe(BriefingCost.price({ tokens: { ...tokens, reasoning: 0 }, prices }));
  });

  it('rounds a fraction of a micro-dollar up to a whole one', () => {
    const costMicroUsd = BriefingCost.price({
      tokens: { input: 1, cachedInput: 0, output: 0, reasoning: 0 },
      prices,
    });

    expect(costMicroUsd).toBe(1);
  });

  it('does not round an exact cost up through floating point error', () => {
    const costMicroUsd = BriefingCost.price({
      tokens: { input: 3_000_000, cachedInput: 0, output: 0, reasoning: 0 },
      prices: { ...prices, inputUsdPerMTok: 0.1 },
    });

    expect(costMicroUsd).toBe(300_000);
  });

  it('bounds a run by uncached input and the whole output ceiling', () => {
    const costMicroUsd = BriefingCost.ceiling({
      inputTokens: 1_000_000,
      maxOutputTokens: 4_000,
      prices,
    });

    expect(costMicroUsd).toBe(100_000 + 2_000);
  });
});
