import { describe, expect, it } from 'vitest';

import { TextTrimmer } from '#src/services/text-trimmer/text-trimmer.js';

describe('TextTrimmer', () => {
  it('leaves text within the limit untouched', () => {
    expect(TextTrimmer.trim('  hello  ', 9)).toBe('  hello  ');
  });

  it('keeps the start and ends with an ellipsis at exactly the limit', () => {
    const trimmed = TextTrimmer.trim('abcdefghij', 5);

    expect(trimmed).toBe('abcd…');
    expect(trimmed).toHaveLength(5);
  });

  it('never splits a surrogate pair', () => {
    const trimmed = TextTrimmer.trim('ab😀😀😀', 4);

    expect(trimmed).toBe('ab…');
    expect(trimmed?.isWellFormed()).toBe(true);
  });

  it('treats empty text as absent', () => {
    expect(TextTrimmer.trim('', 10)).toBeUndefined();
    expect(TextTrimmer.trim(undefined, 10)).toBeUndefined();
  });
});
