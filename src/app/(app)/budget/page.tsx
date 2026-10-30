import { Suspense } from "react";

import { BudgetPanel } from "@/components/budget-panel";

export default function BudgetPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Monthly budget</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Set the plan for this month and compare it with spending already
          recorded. The ₱47,000 amounts are a starting point. Card purchases
          are not included.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading budget…</p>}>
        <BudgetPanel />
      </Suspense>
    </section>
  );
}
