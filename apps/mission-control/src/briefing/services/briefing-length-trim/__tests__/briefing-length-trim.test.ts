import { describe, expect, it } from 'vitest';

import { BriefingLengthTrim } from '#src/briefing/services/briefing-length-trim/briefing-length-trim.ts';

class Drafts {
  static paragraph(text: string) {
    return { segments: [{ text, url: null }] };
  }
}

describe('BriefingLengthTrim', () => {
  it('cuts too many actions and sentences back to the limits', () => {
    const { paragraph } = Drafts;

    const trimmed = BriefingLengthTrim.of({
      opening: paragraph('One. Two. Three. Four. Five.'),
      actions: [
        paragraph('First. And more.'),
        paragraph('Second.'),
        paragraph('Third.'),
        paragraph('Fourth.'),
        paragraph('Fifth.'),
      ],
      closing: paragraph('Alpha. Beta. Gamma. Delta.'),
      unknownRefs: 2,
    });

    expect(trimmed.opening.segments[0]?.text).toBe('One. Two. Three.');
    expect(trimmed.actions.map(({ segments }) => segments[0]?.text)).toEqual([
      'First.',
      'Second.',
      'Third.',
    ]);
    expect(trimmed.closing.segments[0]?.text).toBe('Alpha. Beta. Gamma.');
    expect(trimmed.unknownRefs).toBe(2);
  });

  it('leaves a draft inside the limits as it is', () => {
    const { paragraph } = Drafts;
    const draft = {
      opening: paragraph('One. Two.'),
      actions: [paragraph('Do it.')],
      closing: paragraph('Soon. Maybe.'),
      unknownRefs: 0,
    };

    expect(BriefingLengthTrim.of(draft)).toEqual(draft);
  });
});
