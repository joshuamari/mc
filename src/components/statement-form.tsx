"use client";

import { useActionState, useState } from "react";

import { saveCardStatement, type SaveStatementState } from "@/app/actions/cards";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type StatementCardChoice = {
  id: string;
  name: string;
};

export function StatementForm({ cards }: { cards: StatementCardChoice[] }) {
  const [idempotencyNotice, setIdempotencyNotice] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<SaveStatementState, FormData>(
    saveCardStatement,
    null,
  );
  const savedId = state && "savedId" in state ? state.savedId : null;

  if (savedId && savedId !== idempotencyNotice) {
    setIdempotencyNotice(savedId);
  }

  return (
    <form
      key={idempotencyNotice ?? "draft"}
      action={formAction}
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
    >
      <h2 className="text-lg font-semibold tracking-tight">Check a statement</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="statement-card" className="text-sm font-medium">
          Card
        </label>
        <select id="statement-card" name="cardAccountId" required className={fieldClass} defaultValue="">
          <option value="" disabled>
            Choose a card
          </option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="statement-start" className="text-sm font-medium">
          From
        </label>
        <input id="statement-start" name="periodStart" type="date" required className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="statement-end" className="text-sm font-medium">
          Closes
        </label>
        <input
          id="statement-end"
          name="periodEnd"
          type="date"
          required
          aria-describedby="statement-end-hint"
          className={fieldClass}
        />
        <p id="statement-end-hint" className="text-sm text-zinc-500">
          The recorded debt includes purchases and payments on or before this day.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="statement-due" className="text-sm font-medium">
          Payment due
        </label>
        <input id="statement-due" name="dueOn" type="date" required className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="statement-balance" className="text-sm font-medium">
          Statement balance
        </label>
        <input
          id="statement-balance"
          name="statementBalance"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="statement-balance-hint"
          className={fieldClass}
        />
        <p id="statement-balance-hint" className="text-sm text-zinc-500">
          The balance printed on the statement. Use a minus sign if the bank says
          the card has a credit.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="minimum-due" className="text-sm font-medium">
          Minimum due
        </label>
        <input
          id="minimum-due"
          name="minimumDue"
          inputMode="decimal"
          placeholder="Optional"
          aria-describedby="minimum-due-hint"
          className={fieldClass}
        />
        <p id="minimum-due-hint" className="text-sm text-zinc-500">
          Optional. The smallest payment the statement asks for.
        </p>
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Statement saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || cards.length === 0}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save statement"}
      </button>
    </form>
  );
}
