/** Keeps provider and agent text short enough for the snapshot. */
export class BriefingText {
  /** `value` as it is when it fits in `limit` characters, otherwise cut to fit with an ellipsis. */
  static cap(value: string, limit: number): string {
    return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
  }

  static capped(
    value: string | null | undefined,
    limit: number,
  ): string | null {
    return value === null || value === undefined
      ? null
      : BriefingText.cap(value, limit);
  }
}
