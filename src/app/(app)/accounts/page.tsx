import { Suspense } from "react";

import { AccountsPanel } from "@/components/accounts-panel";

export default function AccountsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Balances</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Each name is one place you keep money. BDO and MariBank stay separate.
          Places of the same type are listed together, and that type shows a total.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading balances…</p>}>
        <AccountsPanel />
      </Suspense>
    </section>
  );
}
