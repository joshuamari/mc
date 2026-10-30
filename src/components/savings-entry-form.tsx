"use client";

import { useActionState, useState } from "react";

import { recordSavingsEntry, type RecordSavingsEntryState } from "@/app/actions/savings";
import {
  CONTRIBUTION_OWNERS,
  CONTRIBUTION_OWNER_LABELS,
  GOAL_DIRECTIONS,
  SAVINGS_DIRECTION_LABELS,
} from "@/lib/savings";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type SavingsGoalChoice = {
  id: string;
  name: string;
};

export function SavingsEntryForm({
  today,
  initialIdempotencyKey,
  goals,
}: {
  today: string;
  initialIdempotencyKey: string;
  goals: SavingsGoalChoice[];
}) {
  const [state, action, pending] = useActionState<RecordSavingsEntryState, FormData>(
    recordSavingsEntry,
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [owner, setOwner] = useState<(typeof CONTRIBUTION_OWNERS)[number]>("self");
  const [appliedSave, setAppliedSave] = useState<string | null>(null);

  if (state && "savedId" in state && state.savedId !== appliedSave) {
    setAppliedSave(state.savedId);
    setIdempotencyKey(crypto.randomUUID());
  }

  return (
    <form action={action} className="flex max-w-md flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Record savings</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This records whose money it is and the date. It does not change Maya or any other balance.
        Money already in Maya can be recorded here without adding it again.
      </p>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        Date
        <input className={fieldClass} type="date" name="occurredOn" required defaultValue={today} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Amount
        <input
          className={fieldClass}
          name="amount"
          inputMode="decimal"
          required
          placeholder="10000"
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        What happened
        <select className={fieldClass} name="direction" defaultValue="deposit">
          {GOAL_DIRECTIONS.map((direction) => (
            <option key={direction} value={direction}>
              {SAVINGS_DIRECTION_LABELS[direction]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Whose money
        <select
          className={fieldClass}
          name="owner"
          value={owner}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "self" || next === "partner") {
              setOwner(next);
            }
          }}
        >
          {CONTRIBUTION_OWNERS.map((choice) => (
            <option key={choice} value={choice}>
              {CONTRIBUTION_OWNER_LABELS[choice]}
            </option>
          ))}
        </select>
      </label>
      {owner === "self" ? (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Goal
          <select className={fieldClass} name="goalId" required defaultValue="">
            <option value="" disabled>
              Choose a goal
            </option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state && "savedId" in state ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Savings recorded.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending || (owner === "self" && goals.length === 0)}
        className="h-11 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save record"}
      </button>
    </form>
  );
}
