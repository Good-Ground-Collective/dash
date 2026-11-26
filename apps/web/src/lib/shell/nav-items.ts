export interface NavItem {
  label: string;
  href: string;
  available: boolean;
}

export const navItems: readonly NavItem[] = [
  { label: 'Home', href: '/', available: true },
  { label: 'Objectives', href: '/objectives', available: false },
  { label: 'Agents', href: '/agents', available: false },
  { label: 'GitHub', href: '/github', available: false },
  { label: 'Benches', href: '/benches', available: false },
];
