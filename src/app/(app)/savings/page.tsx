import { Suspense } from "react";

import { SavingsPanel } from "@/components/savings-panel";

export default function SavingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Savings</h1>
        <p className="max-w-2xl text-zinc-700 dark:text-zinc-300">
          Maya&apos;s total is the money in that account, including interest. Yours
          and your partner&apos;s amounts sit under that total. Extra is what remains
          after those two are taken out. A goal such as the emergency fund is the
          part of yours assigned to it. Recording here does not change Maya. Add
          or remove money in Maya on Transactions.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading savings…</p>}>
        <SavingsPanel />
      </Suspense>
    </section>
  );
}
