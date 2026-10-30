"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { postCardActivity, type PostCardActivityState } from "@/app/actions/cards";
import {
  CARD_ACTIVITIES,
  CARD_ACTIVITY_LABELS,
  type CardActivity,
} from "@/lib/cards";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type CardChoice = {
  id: string;
  name: string;
};

export type BalanceChoice = {
  id: string;
  name: string;
};

export type CategoryChoice = {
  id: string;
  name: string;
};

const AMOUNT_HINT: Record<CardActivity, string> = {
  purchase: "This increases what you owe and counts in the category on Monthly budget.",
  payment:
    "This lowers what you owe and lowers the balance you pay from. It is not a second expense.",
};

export function CardActivityForm({
  today,
  initialIdempotencyKey,
  cards,
  accounts,
  categories,
}: {
  today: string;
  initialIdempotencyKey: string;
  cards: CardChoice[];
  accounts: BalanceChoice[];
  categories: CategoryChoice[];
}) {
  const [activity, setActivity] = useState<CardActivity>("purchase");
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [appliedSave, setAppliedSave] = useState<string | null>(null);
  const [savedActivity, setSavedActivity] = useState<CardActivity | null>(null);
  const [state, formAction, pending] = useActionState<PostCardActivityState, FormData>(
    postCardActivity,
    null,
  );
  const savedId = state && "savedId" in state ? state.savedId : null;

  if (savedId && savedId !== appliedSave) {
    setAppliedSave(savedId);
    setSavedActivity(activity);
    setIdempotencyKey(crypto.randomUUID());
  }

  const missingCategory = activity === "purchase" && categories.length === 0;
  const missingBalance = activity === "payment" && accounts.length === 0;

  return (
    <form
      key={appliedSave ?? "draft"}
      action={formAction}
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
    >
      <h2 className="text-lg font-semibold tracking-tight">Record card activity</h2>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-activity" className="text-sm font-medium">
          What happened
        </label>
        <select
          id="card-activity"
          name="activity"
          required
          className={fieldClass}
          value={activity}
          onChange={(event) => setActivity(event.target.value as CardActivity)}
        >
          {CARD_ACTIVITIES.map((type) => (
            <option key={type} value={type}>
              {CARD_ACTIVITY_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-description" className="text-sm font-medium">
          Description
        </label>
        <input
          id="card-description"
          name="description"
          required
          maxLength={120}
          autoComplete="off"
          placeholder={activity === "payment" ? "Paid BDO Visa" : "Groceries"}
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-amount" className="text-sm font-medium">
          Amount
        </label>
        <input
          id="card-amount"
          name="amount"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="card-amount-hint"
          className={fieldClass}
        />
        <p id="card-amount-hint" className="text-sm text-zinc-500">
          {AMOUNT_HINT[activity]}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-occurred-on" className="text-sm font-medium">
          Date
        </label>
        <input
          id="card-occurred-on"
          name="occurredOn"
          type="date"
          required
          defaultValue={today}
          className={fieldClass}
        />
      </div>
      <ChoiceSelect id="card-account" name="cardAccountId" label="Card" placeholder="Choose a card" choices={cards} />
      {activity === "purchase" ? (
        <ChoiceSelect
          id="card-category"
          name="categoryId"
          label="Category"
          placeholder="Choose a category"
          choices={categories}
        />
      ) : (
        <ChoiceSelect
          id="card-from-account"
          name="fromAccountId"
          label="Pay from"
          placeholder="Choose a balance"
          choices={accounts}
        />
      )}
      {missingCategory ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Spending categories are not on this user yet. Seed the starter categories in the
          Supabase SQL editor, then refresh.
        </p>
      ) : null}
      {missingBalance ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Add a balance before paying a card.{" "}
          <Link href="/accounts" className="underline">
            Go to Balances
          </Link>
          .
        </p>
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {savedActivity === "payment"
            ? "Payment saved. The balance updates on Balances."
            : "Purchase saved. It counts on Monthly budget."}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || missingCategory || missingBalance}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : activity === "payment" ? "Save payment" : "Save purchase"}
      </button>
    </form>
  );
}

function ChoiceSelect({
  id,
  name,
  label,
  placeholder,
  choices,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  choices: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} required className={fieldClass} defaultValue="">
        <option value="" disabled>
          {placeholder}
        </option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </div>
  );
}
