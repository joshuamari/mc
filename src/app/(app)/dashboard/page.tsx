import { Suspense } from "react";

import { DashboardPanel } from "@/components/dashboard-panel";

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          This month&apos;s income and spending, the cash and bank balances, what
          the cards owe, and how each savings goal is progressing. Spending is
          cash spending and card purchases.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading dashboard…</p>}>
        <DashboardPanel />
      </Suspense>
    </section>
  );
}
