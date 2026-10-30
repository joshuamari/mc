"use client";

import { useActionState, useState } from "react";

import { createSavingsGoal, type CreateGoalState } from "@/app/actions/savings";
import type { AssetAccountKind } from "@/lib/accounts";
import {
  GOAL_KINDS,
  GOAL_KIND_LABELS,
  accountsForGoalKind,
  type GoalKind,
} from "@/lib/savings";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type GoalAccountChoice = {
  id: string;
  name: string;
  kind: AssetAccountKind;
};

export function GoalForm({ accounts }: { accounts: GoalAccountChoice[] }) {
  const firstKind =
    GOAL_KINDS.find((kind) =>
      accounts.some((account) => accountsForGoalKind(kind).includes(account.kind)),
    ) ?? "emergency";
  const [kind, setKind] = useState<GoalKind>(firstKind);
  const [appliedSave, setAppliedSave] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CreateGoalState, FormData>(
    createSavingsGoal,
    null,
  );
  const savedId = state && "savedId" in state ? state.savedId : null;

  if (savedId && savedId !== appliedSave) {
    setAppliedSave(savedId);
  }
  const linked = accounts.filter((account) =>
    accountsForGoalKind(kind).includes(account.kind),
  );

  return (
    <form
      key={appliedSave ?? "draft"}
      action={formAction}
      className="flex max-w-md flex-col gap-4"
      aria-busy={pending}
    >
      <h2 className="text-lg font-semibold tracking-tight">Add a goal</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="goal-name"
          name="name"
          required
          maxLength={80}
          autoComplete="off"
          placeholder="Emergency fund"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-kind" className="text-sm font-medium">
          Type
        </label>
        <select
          id="goal-kind"
          name="kind"
          required
          value={kind}
          onChange={(event) => setKind(event.target.value as GoalKind)}
          className={fieldClass}
        >
          {GOAL_KINDS.map((option) => (
            <option key={option} value={option}>
              {GOAL_KIND_LABELS[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-target" className="text-sm font-medium">
          Target
        </label>
        <input
          id="goal-target"
          name="target"
          inputMode="decimal"
          required
          placeholder="0.00"
          aria-describedby="goal-target-hint"
          className={fieldClass}
        />
        <p id="goal-target-hint" className="text-sm text-zinc-500">
          The amount you want in this goal.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-date" className="text-sm font-medium">
          Target date
        </label>
        <input
          id="goal-date"
          name="targetDate"
          type="date"
          aria-describedby="goal-date-hint"
          className={fieldClass}
        />
        <p id="goal-date-hint" className="text-sm text-zinc-500">
          Optional.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="goal-account" className="text-sm font-medium">
          Balance
        </label>
        <select
          key={kind}
          id="goal-account"
          name="linkedAccountId"
          required={linked.length > 0}
          defaultValue=""
          className={fieldClass}
        >
          <option value="" disabled>
            Choose a balance
          </option>
          {linked.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {linked.length === 0 ? (
          <p className="text-sm text-zinc-500">{missingBalanceCopy(kind)}</p>
        ) : null}
      </div>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Goal saved.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || linked.length === 0}
        className="h-11 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Saving…" : "Save goal"}
      </button>
    </form>
  );
}

function missingBalanceCopy(kind: GoalKind): string {
  if (kind === "emergency") {
    return "Add an emergency fund balance on Balances first.";
  }
  if (kind === "savings") {
    return "Add a savings balance on Balances first.";
  }
  if (kind === "investment") {
    return "Add an investment balance on Balances first.";
  }
  return "Add a savings, emergency, or investment balance on Balances first.";
}
