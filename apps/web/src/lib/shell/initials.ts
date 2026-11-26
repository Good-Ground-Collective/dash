/** Up to two initials for an avatar, taken from the first and last words of a name. */
export class Initials {
  static of(name: string): string {
    const words = name
      .trim()
      .split(/\s+/u)
      .filter((word) => word.length > 0);
    const first = words.at(0)?.at(0) ?? '';
    const last = words.length > 1 ? (words.at(-1)?.at(0) ?? '') : '';
    return `${first}${last}`.toUpperCase();
  }
}
