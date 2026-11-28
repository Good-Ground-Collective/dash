const refToken = '(?:rv|pr|run|is|ag|bn|cn|ch|o)\\d+';
const refRun = `(?:${refToken})+`;
const refList = `${refRun}(?:\\s*[,;]\\s*${refRun})*`;
const wrappedRefs = new RegExp(
  `(?<![\\p{L}\\p{N}])([\\[(]?)${refList}([\\])]?)(?![\\p{L}\\p{N}])`,
  'gu',
);

/** Removes the ids the model cites by from the words it writes, wherever it left them: after a full stop, glued to a number or to each other, or in brackets. */
export class BriefingRefTokens {
  static strip(text: string): string {
    return text
      .replace(wrappedRefs, '')
      .replace(/[ \t]{2,}/gu, ' ')
      .replace(/[ \t]+([.,;:!?])/gu, '$1');
  }
}
