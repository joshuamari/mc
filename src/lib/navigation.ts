export const APP_ROUTES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/budget", label: "Monthly budget" },
  { href: "/payday", label: "Payday planner" },
  { href: "/transactions", label: "Transactions" },
  { href: "/cards", label: "Credit cards" },
  { href: "/accounts", label: "Balances" },
  { href: "/savings", label: "Savings" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

export function isProtectedPath(pathname: string): boolean {
  return APP_ROUTES.some(
    (route) => pathname === route.href || pathname.startsWith(`${route.href}/`),
  );
}
