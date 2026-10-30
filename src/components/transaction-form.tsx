"use client";

import { useActionState, useState } from "react";

import {
  postMovement,
  type PostMovementState,
} from "@/app/actions/transactions";
import {
  MOVEMENT_LABELS,
  MOVEMENT_TYPES,
  type MovementType,
} from "@/lib/transactions";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type BalanceChoice = {
  id: string;
  name: string;
};

export type CategoryChoice = {
  id: string;
  name: string;
};

const AMOUNT_HINT: Record<MovementType, string> = {
  income: "Pesos that arrived. This increases the balance you choose.",
  expense: "Pesos that left. This decreases the balance you choose.",
  transfer:
    "Pesos that moved. One balance goes down and the other goes up by the same amount.",
};

export function TransactionForm({
  today,
  initialIdempotencyKey,
  accounts,
  incomeCategories,
  spendingCategories,
}: {
  today: string;
  initialIdempotencyKey: string;
  accounts: BalanceChoice[];
  incomeCategories: CategoryChoice[];
  spendingCategories: CategoryChoice[];
}) {
  const [movementType, setMovementType] = useState<MovementType>("expense");
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [appliedSave, setAppliedSave] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<PostMovementState, FormData>(
    postMovement,
    null,
  );
  const savedId = state && "savedId" in state ? state.savedId : null;

  if (savedId && savedId !== appliedSave) {
    setAppliedSave(savedId);
    setIdempotencyKey(crypto.randomUUID());
  }

  const categories =
    movementType === "income" ? incomeCategories : spendingCategories;
  const needsCategory = movementType !== "transfer";
  const missingCategory = needsCategory && categories.length === 0;
  const transferNeedsAnother = movementType === "transfer" && accounts.length < 2;

  return (
    <form
      key={appliedSave ?? "draft"}
      action={formAction}
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
    >
      <h2 className="text-lg font-semibold tracking-tight">Record a transaction</h2>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="movement-type" className="text-sm font-medium">
          What happened
        </label>
        <select
          id="movement-type"
          name="movementType"
          required
          className={fieldClass}
          value={movementType}
          onChange={(event) => setMovementType(event.target.value as MovementType)}
        >
          {MOVEMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {MOVEMENT_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="movement-description" className="text-sm font-medium">
          Description
        </label>
        <input
          id="movement-description"
          name="description"
          required
          maxLength={120}
          autoComplete="off"
          placeholder={
            movementType === "income"
              ? "Salary"
              : movementType === "transfer"
                ? "Moved to savings"
                : "Groceries"
          }
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="movement-amount" className="text-sm font-medium">
          Amount
        </label>
        <input
          id="movement-amount"
          name="amount"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="movement-amount-hint"
          className={fieldClass}
        />
        <p id="movement-amount-hint" className="text-sm text-zinc-500">
          {AMOUNT_HINT[movementType]}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="occurred-on" className="text-sm font-medium">
          Date
        </label>
        <input
          id="occurred-on"
          name="occurredOn"
          type="date"
          required
          defaultValue={today}
          className={fieldClass}
        />
      </div>
      {movementType === "expense" || movementType === "transfer" ? (
        <AccountSelect
          id="from-account"
          name="fromAccountId"
          label="From"
          accounts={accounts}
        />
      ) : null}
      {movementType === "income" || movementType === "transfer" ? (
        <AccountSelect
          id="to-account"
          name="toAccountId"
          label="Into"
          accounts={accounts}
        />
      ) : null}
      {needsCategory ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="movement-category" className="text-sm font-medium">
            {movementType === "income" ? "Income" : "Category"}
          </label>
          <select
            key={movementType}
            id="movement-category"
            name="categoryId"
            required
            className={fieldClass}
            defaultValue=""
          >
            <option value="" disabled>
              {movementType === "income" ? "Choose the income" : "Choose a category"}
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {transferNeedsAnother ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Add another balance before moving money between places.
        </p>
      ) : null}
      {missingCategory ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {movementType === "income"
            ? "Income categories are not on this user yet."
            : "Spending categories are not on this user yet."}{" "}
          Seed the starter categories in the Supabase SQL editor, then refresh.
        </p>
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Transaction saved. The balance updates on Balances.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || transferNeedsAnother || missingCategory}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save transaction"}
      </button>
    </form>
  );
}

function AccountSelect({
  id,
  name,
  label,
  accounts,
}: {
  id: string;
  name: string;
  label: string;
  accounts: BalanceChoice[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} required className={fieldClass} defaultValue="">
        <option value="" disabled>
          Choose a balance
        </option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}
