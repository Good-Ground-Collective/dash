/** Fits harness text into a heartbeat field's limit, measured by `String.length` as the standards schema measures it. */
export class TextTrimmer {
  static readonly ELLIPSIS = '…';

  /**
   * Keeps the start of `text` and ends it with `…` when it is longer than `limit`, never splitting
   * a surrogate pair. Empty text gives `undefined`, since heartbeat text fields can't be empty.
   */
  static trim(text: string | undefined, limit: number): string | undefined {
    if (text === undefined || text === '') {
      return undefined;
    }
    if (text.length <= limit) {
      return text;
    }

    let end = limit - TextTrimmer.ELLIPSIS.length;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd8_00 && last <= 0xdb_ff) {
      end -= 1;
    }

    return text.slice(0, end) + TextTrimmer.ELLIPSIS;
  }
}
