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

/** Which top-level section a URL belongs to. */
export class NavItems {
  /** Whether `pathname` is `href` or a page under it. Home matches only itself. */
  static isCurrent(props: { pathname: string; href: string }): boolean {
    if (props.href === '/') return props.pathname === '/';
    return (
      props.pathname === props.href ||
      props.pathname.startsWith(`${props.href}/`)
    );
  }
}
