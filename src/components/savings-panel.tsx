import "server-only";

import { io } from "next/cache";

import { GoalForm, type GoalAccountChoice } from "@/components/goal-form";
import { SavingsEntryForm } from "@/components/savings-entry-form";
import { isAssetAccountKind, manilaDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { formatCentavos, subtractCentavos } from "@/lib/money";
import {
  CONTRIBUTION_OWNER_LABELS,
  GOAL_KIND_LABELS,
  SAVINGS_DIRECTION_LABELS,
  isContributionOwner,
  isGoalDirection,
  isGoalKind,
  recordedSavingsCentavos,
  type SavingsRecord,
} from "@/lib/savings";
import { createClient } from "@/lib/supabase/server";
import { formatIsoDate } from "@/lib/transactions";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
};

type BalanceRow = {
  account_id: string;
  balance_centavos: string | number;
};

type GoalRow = {
  id: string;
  name: string;
  kind: string;
  target_centavos: string | number | null;
  target_date: string | null;
};

type EntryRow = {
  id: string;
  occurred_on: string;
  direction: string;
  owner: string;
  goal_id: string | null;
  amount_centavos: string | number;
};

export async function SavingsPanel() {
  await io();
  const today = manilaDate(new Date());
  const initialIdempotencyKey = crypto.randomUUID();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [accountsResult, balancesResult, goalsResult, entriesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, kind")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase.from("account_balances").select("account_id, balance_centavos").eq("user_id", user.id),
    supabase
      .from("goals")
      .select("id, name, kind, target_centavos, target_date")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("savings_entries")
      .select("id, occurred_on, direction, owner, goal_id, amount_centavos")
      .eq("user_id", user.id)
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false }),
  ]);
  const loadError =
    accountsResult.error ?? balancesResult.error ?? goalsResult.error ?? entriesResult.error;
  const balances = new Map(
    ((balancesResult.data ?? []) as BalanceRow[]).map((row) => [
      row.account_id,
      BigInt(row.balance_centavos ?? 0),
    ]),
  );
  const accounts = ((accountsResult.data ?? []) as AccountRow[]).flatMap((account) =>
    isAssetAccountKind(account.kind) ? [account] : [],
  );
  const savingsAccounts = accounts.flatMap((account) =>
    account.kind === "savings"
      ? [{ id: account.id, name: account.name, balanceCentavos: balances.get(account.id) ?? 0n }]
      : [],
  );
  const goalAccounts: GoalAccountChoice[] = accounts.flatMap((account) => {
    if (
      account.kind === "savings" ||
      account.kind === "emergency" ||
      account.kind === "investment"
    ) {
      return [{ id: account.id, name: account.name, kind: account.kind }];
    }
    return [];
  });

  const goals = ((goalsResult.data ?? []) as GoalRow[]).flatMap((goal) =>
    isGoalKind(goal.kind)
      ? [
          {
            id: goal.id,
            name: goal.name,
            kind: goal.kind,
            targetCentavos: BigInt(goal.target_centavos ?? 0),
            targetDate: goal.target_date,
          },
        ]
      : [],
  );
  const goalNameById = new Map(goals.map((goal) => [goal.id, goal.name]));
  const records = ((entriesResult.data ?? []) as EntryRow[]).flatMap((entry) => {
    if (!isGoalDirection(entry.direction) || !isContributionOwner(entry.owner)) {
      return [];
    }
    return [
      {
        id: entry.id,
        occurredOn: entry.occurred_on,
        direction: entry.direction,
        owner: entry.owner,
        goalId: entry.goal_id,
        amountCentavos: BigInt(entry.amount_centavos ?? 0),
      },
    ];
  });
  const savingsRecords: SavingsRecord[] = records.map((record) => ({
    owner: record.owner,
    direction: record.direction,
    amountCentavos: record.amountCentavos,
    goalId: record.goalId,
  }));
  const yours = recordedSavingsCentavos(savingsRecords, { owner: "self" });
  const partner = recordedSavingsCentavos(savingsRecords, { owner: "partner" });
  const mayaTotal = savingsAccounts.reduce(
    (sum, account) => sum + account.balanceCentavos,
    0n,
  );
  const extra = subtractCentavos(subtractCentavos(mayaTotal, yours), partner);

  return (
    <div className="flex flex-col gap-10">
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {loadError.message.includes("savings_entries")
            ? "Apply supabase/migrations/20261027070000_savings_entries.sql in the Supabase SQL editor, then reload."
            : "Savings could not be loaded."}
        </p>
      ) : (
        <>
          <section className="flex max-w-md flex-col gap-1">
            {savingsAccounts.length === 1 ? (
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight">{savingsAccounts[0].name}</h2>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium">Total</p>
                  <p className="tabular-nums">{formatCentavos(savingsAccounts[0].balanceCentavos)}</p>
                </div>
              </div>
            ) : (
              savingsAccounts.map((account) => (
                <div key={account.id} className="flex items-baseline justify-between gap-4">
                  <p className="font-medium">{account.name}</p>
                  <p className="tabular-nums">{formatCentavos(account.balanceCentavos)}</p>
                </div>
              ))
            )}
            {savingsAccounts.length > 1 ? (
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium">Total</p>
                <p className="tabular-nums">{formatCentavos(mayaTotal)}</p>
              </div>
            ) : null}
            <ul className="mt-1 flex flex-col gap-2 border-l border-zinc-200 py-1 pl-4 dark:border-zinc-800">
              <li className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">Yours</p>
                <p className="tabular-nums">{formatCentavos(yours)}</p>
              </li>
              <li className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">Partner</p>
                <p className="tabular-nums">{formatCentavos(partner)}</p>
              </li>
              {savingsAccounts.length > 0 ? (
                <li className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">Extra</p>
                  <p className="tabular-nums">{formatCentavos(extra)}</p>
                </li>
              ) : null}
            </ul>
            {savingsAccounts.length > 0 ? (
              <p className="text-sm text-zinc-500">Extra is the total minus yours minus your partner.</p>
            ) : null}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Goals</h2>
            {goals.length === 0 ? (
              <p className="text-zinc-700 dark:text-zinc-300">No goals yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {goals.map((goal) => (
                  <li key={goal.id} className="flex flex-col gap-1 py-3">
                    <p className="font-medium">{goal.name}</p>
                    <p className="text-sm text-zinc-500">
                      {GOAL_KIND_LABELS[goal.kind]}
                      {goal.targetDate ? ` · ${formatIsoDate(goal.targetDate)}` : ""}
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Saved {formatCentavos(recordedSavingsCentavos(savingsRecords, { goalId: goal.id }))}{" "}
                      of {formatCentavos(goal.targetCentavos)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Record</h2>
            {records.length === 0 ? (
              <p className="text-zinc-700 dark:text-zinc-300">No savings recorded yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {records.map((record) => (
                  <li key={record.id} className="flex flex-col gap-1 py-3">
                    <p className="font-medium">{formatIsoDate(record.occurredOn)}</p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {SAVINGS_DIRECTION_LABELS[record.direction]} {formatCentavos(record.amountCentavos)} ·{" "}
                      {CONTRIBUTION_OWNER_LABELS[record.owner]}
                      {record.goalId ? ` · ${goalNameById.get(record.goalId) ?? "Goal"}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <SavingsEntryForm
        today={today}
        initialIdempotencyKey={initialIdempotencyKey}
        goals={goals.map((goal) => ({ id: goal.id, name: goal.name }))}
      />
      <GoalForm accounts={goalAccounts} />
    </div>
  );
}
