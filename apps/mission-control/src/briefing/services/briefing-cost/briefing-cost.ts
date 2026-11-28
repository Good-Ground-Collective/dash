import type {
  BriefingPrices,
  BriefingTokens,
} from '#src/briefing/contracts/briefing-written.ts';

const microUsdPerUsd = 1_000_000;
const tokensPerMillion = 1_000_000;

/** Prices a run in integer micro-USD. A rate of USD per million tokens is micro-USD per token, so nothing is divided until the final rounding up. */
export class BriefingCost {
  /** `reasoning` is already inside `output`, so it adds nothing here. */
  static price(props: {
    tokens: BriefingTokens;
    prices: BriefingPrices;
  }): number {
    const { tokens, prices } = props;
    const uncachedInput = Math.max(tokens.input - tokens.cachedInput, 0);
    const scaledMicroUsd =
      uncachedInput * BriefingCost.rate(prices.inputUsdPerMTok) +
      tokens.cachedInput * BriefingCost.rate(prices.cachedInputUsdPerMTok) +
      tokens.output * BriefingCost.rate(prices.outputUsdPerMTok);
    return Math.ceil(scaledMicroUsd / tokensPerMillion);
  }

  /** The most a run can cost: every input token uncached, and the whole output ceiling used. */
  static ceiling(props: {
    inputTokens: number;
    maxOutputTokens: number;
    prices: BriefingPrices;
  }): number {
    return BriefingCost.price({
      tokens: {
        input: props.inputTokens,
        cachedInput: 0,
        output: props.maxOutputTokens,
        reasoning: 0,
      },
      prices: props.prices,
    });
  }

  private static rate(usdPerMTok: number): number {
    return Math.round(usdPerMTok * microUsdPerUsd);
  }
}
