import { Suspense } from "react";

import { ReportsPanel } from "@/components/reports-panel";

export default function ReportsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Spending, card payments, and transfers each have their own total for
          this month. A card payment and a savings deposit stay with their own
          total.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading reports…</p>}>
        <ReportsPanel />
      </Suspense>
    </section>
  );
}
