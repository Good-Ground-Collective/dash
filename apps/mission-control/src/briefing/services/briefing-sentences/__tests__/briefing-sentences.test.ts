import { describe, expect, it } from 'vitest';

import { briefingWrittenTextSchema } from '#src/briefing/contracts/briefing-written.ts';
import { BriefingSentences } from '#src/briefing/services/briefing-sentences/briefing-sentences.ts';

class Paragraphs {
  static of(...texts: string[]) {
    return { segments: texts.map((text) => ({ text, url: null })) };
  }
}

describe('BriefingSentences', () => {
  it('counts sentences across segments', () => {
    const { segments } = Paragraphs.of('One ', 'linked', ' sentence. Two.');

    expect(BriefingSentences.count(segments)).toBe(2);
  });

  it('does not split on a ticket number or a version', () => {
    const { segments } = Paragraphs.of('Closed #348 and shipped v1.2 today.');

    expect(BriefingSentences.count(segments)).toBe(1);
  });

  it('cuts after the limit, keeping the text of the last kept segment up to it', () => {
    const { segments } = Paragraphs.of('First. Sec', 'ond. Third.');

    const trimmed = BriefingSentences.trim({ segments, limit: 2 });

    expect(trimmed.map(({ text }) => text)).toEqual(['First. Sec', 'ond.']);
  });

  it('keeps everything that fits', () => {
    const { segments } = Paragraphs.of('One. Two.');

    expect(BriefingSentences.trim({ segments, limit: 3 })).toEqual(segments);
  });
});

describe('briefingWrittenTextSchema limits', () => {
  const framing = Paragraphs.of('One. Two.');
  const action = Paragraphs.of('Review the pull request.');

  it('accepts two to three sentences and up to three one-sentence actions', () => {
    const result = briefingWrittenTextSchema.safeParse({
      opening: framing,
      actions: [action, action, action],
      closing: Paragraphs.of('One. Two. Three.'),
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['a one-sentence opening', { opening: Paragraphs.of('Only one.') }],
    ['a four-sentence closing', { closing: Paragraphs.of('A. B. C. D.') }],
    ['four actions', { actions: [action, action, action, action] }],
    [
      'a two-sentence action',
      { actions: [Paragraphs.of('Do this. Then that.')] },
    ],
  ])('rejects %s', (_name, overrides) => {
    const result = briefingWrittenTextSchema.safeParse({
      opening: framing,
      actions: [],
      closing: framing,
      ...overrides,
    });

    expect(result.success).toBe(false);
  });
});
