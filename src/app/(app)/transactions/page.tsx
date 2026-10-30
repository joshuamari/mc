import { Suspense } from "react";

import { TransactionsPanel } from "@/components/transactions-panel";

export default function TransactionsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Record money that arrived, money that left, or money that moved between
          balances. Card purchases wait until the card screen.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading transactions…</p>}>
        <TransactionsPanel />
      </Suspense>
    </section>
  );
}
