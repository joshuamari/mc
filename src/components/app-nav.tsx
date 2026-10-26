"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { APP_ROUTES } from "@/lib/navigation";

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex gap-2 overflow-x-auto pb-1">
      {APP_ROUTES.map((route) => {
        const active =
          pathname === route.href || pathname.startsWith(`${route.href}/`);
        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-2 text-sm ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
            }`}
          >
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
