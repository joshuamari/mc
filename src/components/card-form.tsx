"use client";

import { useActionState, useState } from "react";

import { createCreditCard, type CreateCardState } from "@/app/actions/cards";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function CardForm({
  today,
  initialIdempotencyKey,
}: {
  today: string;
  initialIdempotencyKey: string;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [appliedSave, setAppliedSave] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CreateCardState, FormData>(
    createCreditCard,
    null,
  );
  const savedId = state && "savedId" in state ? state.savedId : null;

  if (savedId && savedId !== appliedSave) {
    setAppliedSave(savedId);
    setIdempotencyKey(crypto.randomUUID());
  }

  return (
    <form
      key={appliedSave ?? "draft"}
      action={formAction}
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
    >
      <h2 className="text-lg font-semibold tracking-tight">Add a card</h2>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="card-name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="BDO Visa, BPI"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-last4" className="text-sm font-medium">
          Last 4 digits
        </label>
        <input
          id="card-last4"
          name="last4"
          inputMode="numeric"
          maxLength={4}
          autoComplete="off"
          placeholder="1234"
          aria-describedby="card-last4-hint"
          className={fieldClass}
        />
        <p id="card-last4-hint" className="text-sm text-zinc-500">
          Optional. The full card number is not stored.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="credit-limit" className="text-sm font-medium">
          Credit limit
        </label>
        <input
          id="credit-limit"
          name="creditLimit"
          inputMode="decimal"
          required
          placeholder="0.00"
          className={fieldClass}
        />
      </div>
      <DaySelect id="statement-close-day" name="statementCloseDay" label="Statement closes" />
      <DaySelect id="payment-due-day" name="paymentDueDay" label="Payment due" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="opening-debt" className="text-sm font-medium">
          Amount you already owe
        </label>
        <input
          id="opening-debt"
          name="openingDebt"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="opening-debt-hint"
          className={fieldClass}
        />
        <p id="opening-debt-hint" className="text-sm text-zinc-500">
          What this card balance is today. Use zero if you owe nothing. This is
          not a new purchase.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="debt-date" className="text-sm font-medium">
          Date
        </label>
        <input
          id="debt-date"
          name="occurredOn"
          type="date"
          required
          defaultValue={today}
          className={fieldClass}
        />
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Card saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save card"}
      </button>
    </form>
  );
}

function DaySelect({ id, name, label }: { id: string; name: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} required className={fieldClass} defaultValue="">
        <option value="" disabled>
          Choose a day
        </option>
        {DAYS.map((day) => (
          <option key={day} value={day}>
            Day {day}
          </option>
        ))}
      </select>
    </div>
  );
}
