const refToken = '(?:rv|pr|run|is|ag|bn|cn|ch|o)\\d+';
const refRun = `(?:${refToken})+`;
const refList = `${refRun}(?:\\s*[,;]\\s*${refRun})*`;
const citedList = `${refRun}(?:(?:\\s*[,;]\\s*(?:and\\s+)?|\\s+and\\s+)${refRun})*`;
const lead = '(?:(?:see|cf\\.?)\\s+)?';
const edge = '(?<![\\p{L}\\p{N}])';
const end = '(?![\\p{L}\\p{N}])';
const bracketedRefs = new RegExp(
  `[ \\t]*(?:\\(\\s*${lead}${citedList}\\s*\\)|\\[\\s*${lead}${citedList}\\s*\\])`,
  'gu',
);
const closingRefs = new RegExp(
  `[ \\t]*[,;][ \\t]*${edge}${citedList}${end}(?=[ \\t]*[)\\]])`,
  'gu',
);
const bareRefs = new RegExp(`${edge}${refList}${end}`, 'gu');

/** Removes the ids the model cites by from the words it writes, wherever it left them: after a full stop, glued to a number or to each other, or in brackets. A bracket pair is removed only whole, and only when nothing but ids (and "see" or "and") is inside it. */
export class BriefingRefTokens {
  static strip(text: string): string {
    return text
      .replace(bracketedRefs, '')
      .replace(closingRefs, '')
      .replace(bareRefs, '')
      .replace(/([[(])[ \t]+/gu, '$1')
      .replace(/[ \t]+([\])])/gu, '$1')
      .replace(/[ \t]{2,}/gu, ' ')
      .replace(/[ \t]+([.,;:!?])/gu, '$1')
      .replace(/^[ \t]+/u, '');
  }
}
