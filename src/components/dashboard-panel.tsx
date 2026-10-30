import "server-only";

import { io } from "next/cache";

import { ASSET_ACCOUNT_LABELS, isAssetAccountKind } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { formatBudgetMonth, manilaMonthStart, nextMonthStart } from "@/lib/budget";
import { formatCentavos } from "@/lib/money";
import {
  cardDebtCentavos,
  cashOnHandCentavos,
  incomeCentavos,
  spendingCentavos,
} from "@/lib/overview";
import {
  GOAL_KIND_LABELS,
  isContributionOwner,
  isGoalDirection,
  isGoalKind,
  recordedSavingsCentavos,
  type SavingsRecord,
} from "@/lib/savings";
import { createClient } from "@/lib/supabase/server";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
};

type BalanceRow = {
  account_id: string;
  balance_centavos: string | number;
};

type TransactionRow = {
  id: string;
  type: string;
};

type EntryRow = {
  transaction_id: string;
  account_id: string;
  amount_centavos: string | number;
};

type SplitRow = {
  transaction_id: string;
  amount_centavos: string | number;
};

type GoalRow = {
  id: string;
  name: string;
  kind: string;
  target_centavos: string | number | null;
};

type SavingsEntryRow = {
  owner: string;
  direction: string;
  goal_id: string | null;
  amount_centavos: string | number;
};

export async function DashboardPanel() {
  await io();
  const month = manilaMonthStart(new Date());
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [accountsResult, balancesResult, activityResult, goalsResult, savingsResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, kind")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase.from("account_balances").select("account_id, balance_centavos").eq("user_id", user.id),
      supabase
        .from("transactions")
        .select("id, type")
        .eq("user_id", user.id)
        .in("type", ["income", "expense", "credit_card_purchase"])
        .is("voided_at", null)
        .gte("occurred_on", month)
        .lt("occurred_on", nextMonthStart(month)),
      supabase
        .from("goals")
        .select("id, name, kind, target_centavos")
        .eq("user_id", user.id)
        .is("archived_at", null),
      supabase
        .from("savings_entries")
        .select("owner, direction, goal_id, amount_centavos")
        .eq("user_id", user.id),
    ]);

  const activity = (activityResult.data ?? []) as TransactionRow[];
  const incomeIds = activity.filter((row) => row.type === "income").map((row) => row.id);
  const spendingIds = activity
    .filter((row) => row.type === "expense" || row.type === "credit_card_purchase")
    .map((row) => row.id);
  const entryIds = incomeIds;
  const savingsMissing = Boolean(savingsResult.error?.message.includes("savings_entries"));
  const firstError =
    accountsResult.error ??
    balancesResult.error ??
    activityResult.error ??
    goalsResult.error ??
    (savingsMissing ? null : savingsResult.error);
  const [entriesResult, splitsResult] = await Promise.all([
    !firstError && entryIds.length > 0
      ? supabase
          .from("transaction_entries")
          .select("transaction_id, account_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", entryIds)
      : Promise.resolve({ data: [] as EntryRow[], error: null }),
    !firstError && spendingIds.length > 0
      ? supabase
          .from("transaction_splits")
          .select("transaction_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", spendingIds)
      : Promise.resolve({ data: [] as SplitRow[], error: null }),
  ]);
  const loadError = firstError ?? entriesResult.error ?? splitsResult.error;

  const balances = new Map(
    ((balancesResult.data ?? []) as BalanceRow[]).map((row) => [
      row.account_id,
      BigInt(row.balance_centavos ?? 0),
    ]),
  );
  const accounts = ((accountsResult.data ?? []) as AccountRow[]).map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    balanceCentavos: balances.get(account.id) ?? 0n,
  }));
  const cashAccounts = accounts.filter(
    (account) => account.kind === "cash" || account.kind === "bank",
  );
  const cards = accounts.filter((account) => account.kind === "credit_card");
  const incomeIdSet = new Set(incomeIds);
  const income = incomeCentavos(
    ((entriesResult.data ?? []) as EntryRow[]).flatMap((entry) =>
      incomeIdSet.has(entry.transaction_id)
        ? [{ amountCentavos: BigInt(entry.amount_centavos ?? 0) }]
        : [],
    ),
  );
  const spending = spendingCentavos(
    ((splitsResult.data ?? []) as SplitRow[]).map((split) => ({
      amountCentavos: BigInt(split.amount_centavos ?? 0),
    })),
  );

  const savingsRecords: SavingsRecord[] = ((savingsResult.data ?? []) as SavingsEntryRow[]).flatMap(
    (entry) =>
      isGoalDirection(entry.direction) && isContributionOwner(entry.owner)
        ? [
            {
              owner: entry.owner,
              direction: entry.direction,
              amountCentavos: BigInt(entry.amount_centavos ?? 0),
              goalId: entry.goal_id,
            },
          ]
        : [],
  );
  const goals = ((goalsResult.data ?? []) as GoalRow[]).flatMap((goal) =>
    isGoalKind(goal.kind)
      ? [
          {
            id: goal.id,
            name: goal.name,
            kindLabel: GOAL_KIND_LABELS[goal.kind],
            targetCentavos: BigInt(goal.target_centavos ?? 0),
            savedCentavos: recordedSavingsCentavos(savingsRecords, { goalId: goal.id }),
          },
        ]
      : [],
  );
  const yourSavings = recordedSavingsCentavos(savingsRecords, { owner: "self" });
  const partnerSavings = recordedSavingsCentavos(savingsRecords, { owner: "partner" });

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-zinc-500">{formatBudgetMonth(month)}</p>
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The dashboard could not be loaded.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Income</h2>
            <p className="tabular-nums">{formatCentavos(income)}</p>
          </section>
          <section className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight">Spending</h2>
            <p className="tabular-nums">{formatCentavos(spending)}</p>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Cash and bank</h2>
            {cashAccounts.length === 0 ? (
              <p className="text-zinc-700 dark:text-zinc-300">No cash or bank balances yet.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-500">
                  Total{" "}
                  <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                    {formatCentavos(cashOnHandCentavos(cashAccounts))}
                  </span>
                </p>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {cashAccounts.map((account) => (
                    <li key={account.id} className="flex items-baseline justify-between gap-4 py-3">
                      <div>
                        <p className="font-medium">{account.name}</p>
                        <p className="text-sm text-zinc-500">
                          {isAssetAccountKind(account.kind)
                            ? ASSET_ACCOUNT_LABELS[account.kind]
                            : account.kind}
                        </p>
                      </div>
                      <p className="tabular-nums">{formatCentavos(account.balanceCentavos)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Cards</h2>
            {cards.length === 0 ? (
              <p className="text-zinc-700 dark:text-zinc-300">No cards yet.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-500">
                  Owed{" "}
                  <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
                    {formatCentavos(cardDebtCentavos(cards))}
                  </span>
                </p>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {cards.map((card) => (
                    <li key={card.id} className="flex items-baseline justify-between gap-4 py-3">
                      <p className="font-medium">{card.name}</p>
                      <p className="tabular-nums">{formatCentavos(card.balanceCentavos)} owed</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Savings</h2>
            {savingsMissing ? (
              <p className="text-sm text-red-700 dark:text-red-400">
                Apply supabase/migrations/20261027070000_savings_entries.sql in the Supabase SQL
                editor, then reload.
              </p>
            ) : goals.length === 0 ? (
              <p className="text-zinc-700 dark:text-zinc-300">No goals yet.</p>
            ) : (
              <>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Your savings {formatCentavos(yourSavings)} · Partner&apos;s savings{" "}
                  {formatCentavos(partnerSavings)}
                </p>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {goals.map((goal) => (
                    <li key={goal.id} className="flex flex-col gap-1 py-3">
                      <p className="font-medium">{goal.name}</p>
                      <p className="text-sm text-zinc-500">{goal.kindLabel}</p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        Saved {formatCentavos(goal.savedCentavos)} of{" "}
                        {formatCentavos(goal.targetCentavos)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
