export interface NavItem {
  label: string;
  href: string;
  available: boolean;
}

export const navItems: readonly NavItem[] = [
  { label: 'Home', href: '/', available: true },
  { label: 'Objectives', href: '/objectives', available: false },
  { label: 'Agents', href: '/agents', available: true },
  { label: 'GitHub', href: '/github', available: true },
  { label: 'Benches', href: '/benches', available: false },
];

/** Whether a URL is a nav entry's page or one beneath it. */
export class NavItems {
  /** Whether `pathname` is `href` or a page under it. Home matches only itself. */
  static isCurrent(props: { pathname: string; href: string }): boolean {
    if (props.href === '/') return props.pathname === '/';
    return (
      props.pathname === props.href ||
      props.pathname.startsWith(`${props.href}/`)
    );
  }

  /** The longest of `hrefs` that `pathname` is current for, or undefined when none is. */
  static mostSpecific(props: {
    pathname: string;
    hrefs: readonly string[];
  }): string | undefined {
    return props.hrefs
      .filter((href) => NavItems.isCurrent({ pathname: props.pathname, href }))
      .reduce<string | undefined>(
        (best, href) =>
          best === undefined || href.length > best.length ? href : best,
        undefined,
      );
  }
}
