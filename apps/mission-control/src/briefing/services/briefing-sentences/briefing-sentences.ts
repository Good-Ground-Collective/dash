const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Counts and cuts the sentences of text that is split into segments, so a briefing part can be held to its length. */
export class BriefingSentences {
  static count(segments: readonly { text: string }[]): number {
    return BriefingSentences.sentencesOf(segments).length;
  }

  /** Whether the segments hold between `min` and `max` sentences, both included. */
  static isWithin(props: {
    segments: readonly { text: string }[];
    min: number;
    max: number;
  }): boolean {
    const count = BriefingSentences.count(props.segments);
    return count >= props.min && count <= props.max;
  }

  /** The segments cut after their `limit`th sentence, or as they are when they hold no more. */
  static trim<T extends { text: string }>(props: {
    segments: readonly T[];
    limit: number;
  }): T[] {
    const sentences = BriefingSentences.sentencesOf(props.segments);
    const last = sentences[props.limit - 1];
    if (last === undefined || sentences.length <= props.limit) {
      return [...props.segments];
    }

    const end = last.start + last.text.length;
    const kept: T[] = [];
    let offset = 0;
    for (const segment of props.segments) {
      const room = end - offset;
      offset += segment.text.length;
      if (room <= 0) break;
      const text = segment.text.slice(0, room);
      if (text.trim() !== '') kept.push({ ...segment, text });
    }
    return kept;
  }

  private static sentencesOf(
    segments: readonly { text: string }[],
  ): { start: number; text: string }[] {
    const joined = segments.map(({ text }) => text).join('');
    return [...segmenter.segment(joined)]
      .map(({ index, segment }) => ({
        start: index,
        text: segment.trimEnd(),
      }))
      .filter(({ text }) => text.trim() !== '');
  }
}
