import { describe, expect, it } from 'vitest';

import {
  changeUrl,
  SampleSnapshot,
} from '#src/briefing/__tests__/support/sample-snapshot.ts';
import { BriefingRefLinks } from '#src/briefing/services/briefing-ref-links/briefing-ref-links.ts';

class Compositions {
  static of(segments: { text: string; ref: string | null }[]) {
    const paragraph = { segments };
    return { opening: paragraph, actions: [], closing: paragraph };
  }
}

describe('BriefingRefLinks citation ids', () => {
  it.each([
    ['waiting on #348.pr1ag2', 'waiting on #348.'],
    ['by the closest deadline.o8', 'by the closest deadline.'],
    [
      'and the sources show no errors.cn1cn2',
      'and the sources show no errors.',
    ],
  ])('never renders the id left in %s', (leaked, clean) => {
    const { opening } = BriefingRefLinks.attach({
      composition: Compositions.of([{ text: leaked, ref: null }]),
      snapshot: SampleSnapshot.build(),
    });

    expect(opening.segments).toEqual([{ text: clean, url: null }]);
  });

  it('drops a segment that held nothing but ids', () => {
    const { opening } = BriefingRefLinks.attach({
      composition: Compositions.of([
        { text: 'Epic closed', ref: 'ch1' },
        { text: 'ch1', ref: null },
      ]),
      snapshot: SampleSnapshot.build(),
    });

    expect(opening.segments).toEqual([{ text: 'Epic closed', url: changeUrl }]);
  });

  it('links the cited words to the item that changed', () => {
    const { opening, unknownRefs } = BriefingRefLinks.attach({
      composition: Compositions.of([{ text: 'Wire the card', ref: 'ch1' }]),
      snapshot: SampleSnapshot.build(),
    });

    expect(opening.segments[0]?.url).toBe(changeUrl);
    expect(unknownRefs).toBe(0);
  });
});
