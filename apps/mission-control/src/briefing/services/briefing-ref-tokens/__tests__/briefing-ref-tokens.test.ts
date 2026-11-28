import { describe, expect, it } from 'vitest';

import { BriefingRefTokens } from '#src/briefing/services/briefing-ref-tokens/briefing-ref-tokens.ts';

describe('BriefingRefTokens', () => {
  it.each([
    ['waiting on #348.pr1ag2', 'waiting on #348.'],
    ['the closest deadline.o8', 'the closest deadline.'],
    ['sources show no errors.cn1cn2', 'sources show no errors.'],
    ['the card is ready [pr1] today', 'the card is ready today'],
    ['two items (o1, o2) moved', 'two items moved'],
    ['The card (see pr1) is ready.', 'The card is ready.'],
    ['Done (pr1 and pr2).', 'Done.'],
    ['Done [pr1, pr2 and pr3].', 'Done.'],
    ['The card (pr1 is ready) today', 'The card (is ready) today'],
    ['merged ch3 and is4 today', 'merged and today'],
    ['(due Friday, o3) soon', '(due Friday) soon'],
    ['[due Friday; o3 and o4] soon', '[due Friday] soon'],
    ['(see o1) today', 'today'],
  ])('removes the ids from %s', (leaked, clean) => {
    expect(BriefingRefTokens.strip(leaked)).toBe(clean);
  });

  it('leaves ordinary words and numbers alone', () => {
    const text =
      'Version 2 of the console is live, so run 5 tests, not pr or ag, on #348 and Go1.';

    expect(BriefingRefTokens.strip(text)).toBe(text);
  });
});
