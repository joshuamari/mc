import { Suspense } from "react";

import { AppNav } from "@/components/app-nav";
import { CurrentUser } from "@/components/current-user";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">MannyCat</p>
          <p className="text-xs text-zinc-500">CursorTraining2.0</p>
        </div>
        <Suspense
          fallback={<p className="text-sm text-zinc-500">Checking session…</p>}
        >
          <CurrentUser />
        </Suspense>
      </header>
      <AppNav />
      <main id="content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
