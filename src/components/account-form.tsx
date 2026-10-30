"use client";

import { useActionState, useState } from "react";

import {
  createAccount,
  type CreateAccountState,
} from "@/app/actions/accounts";
import { ASSET_ACCOUNT_KINDS, ASSET_ACCOUNT_LABELS } from "@/lib/accounts";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export function AccountForm({
  today,
  initialIdempotencyKey,
}: {
  today: string;
  initialIdempotencyKey: string;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [appliedSave, setAppliedSave] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CreateAccountState, FormData>(
    createAccount,
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
      <h2 className="text-lg font-semibold tracking-tight">Add a balance</h2>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="account-name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Wallet, BDO, BPI"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="opening-balance" className="text-sm font-medium">
          Current balance
        </label>
        <input
          id="opening-balance"
          name="openingBalance"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="opening-balance-hint"
          className={fieldClass}
        />
        <p id="opening-balance-hint" className="text-sm text-zinc-500">
          Pesos already in this place. This is the starting amount, so it does not
          count as salary or as spending. Saving the same name again does not add
          to that balance. Use a minus sign only if it is already negative.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-kind" className="text-sm font-medium">
          Type
        </label>
        <select id="account-kind" name="kind" required className={fieldClass} defaultValue="cash">
          {ASSET_ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ASSET_ACCOUNT_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="occurred-on" className="text-sm font-medium">
          Balance as of
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
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Balance saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save balance"}
      </button>
    </form>
  );
}
