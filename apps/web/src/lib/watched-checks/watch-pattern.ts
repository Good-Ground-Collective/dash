/** A watch rule's pattern: a check name to match exactly, or a prefix ending in `*`. Mission Control matches the same way. */
export class WatchPattern {
  /** Whether `pattern` covers the check named `checkName`. */
  static matches(props: { pattern: string; checkName: string }): boolean {
    if (props.pattern.endsWith('*')) {
      return props.checkName.startsWith(props.pattern.slice(0, -1));
    }
    return props.checkName === props.pattern;
  }

  /** What the rule covers, in words. */
  static meaning(pattern: string): string {
    if (!pattern.endsWith('*')) {
      return 'Exact check name';
    }
    const prefix = pattern.slice(0, -1);
    return prefix === '' ? 'Every check' : `Check name starts with “${prefix}”`;
  }
}
