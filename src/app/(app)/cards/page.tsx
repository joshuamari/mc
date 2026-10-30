import { Suspense } from "react";

import { CardsPanel } from "@/components/cards-panel";

export default function CardsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Credit cards</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Track up to two cards. A purchase increases what you owe. A payment
          lowers that debt and the balance you pay from. Paying the card is not
          a second expense. A statement check compares the bank balance with
          the debt recorded through the close date.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading cards…</p>}>
        <CardsPanel />
      </Suspense>
    </section>
  );
}
