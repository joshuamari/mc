import { Suspense } from "react";

import { PaydayPanel } from "@/components/payday-panel";

export default function PaydayPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Payday planner</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Split this month into two cutoffs. A monthly amount can be divided between
          them. Left subtracts only that cutoff&apos;s share. Card payments are not
          included.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading payday plan…</p>}>
        <PaydayPanel />
      </Suspense>
    </section>
  );
}
