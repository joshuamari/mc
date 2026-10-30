import "server-only";

import { io } from "next/cache";

import { BudgetForm, type BudgetEditorLine } from "@/components/budget-form";
import { getCurrentUser } from "@/lib/auth";
import {
  centavosToPesoInput,
  countsAsBudgetSpending,
  defaultPlannedCentavos,
  formatBudgetMonth,
  isBudgetCategory,
  manilaMonthStart,
  nextMonthStart,
  occurredInMonth,
  resolvedPlannedCentavos,
  spendingTotals,
  type BudgetTreatment,
} from "@/lib/budget";
import { ALLOCATION_BASE_CENTAVOS } from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";
import { createClient } from "@/lib/supabase/server";

type CategoryRow = {
  id: string;
  name: string;
  report_treatment: string;
};

type MonthRow = {
  id: string;
  status: string;
  allocation_base_centavos: string | number;
};

type LineRow = {
  category_id: string;
  amount_mode: string;
  planned_centavos: string | number | null;
  percent_bps: string | number | null;
};

type TransactionRow = {
  id: string;
  type: string;
  occurred_on: string;
  voided_at: string | null;
};

type SplitRow = {
  transaction_id: string;
  category_id: string;
  amount_centavos: string | number;
};

const starterOrder = new Map(
  STARTER_CATEGORIES.map((category, index) => [category.name, index]),
);

export async function BudgetPanel() {
  // new Date() cannot run while the static shell prerenders.
  await io();
  const month = manilaMonthStart(new Date());
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [categoriesResult, monthResult, transactionsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, report_treatment")
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("budget_months")
      .select("id, status, allocation_base_centavos")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("id, type, occurred_on, voided_at")
      .eq("user_id", user.id)
        .in("type", ["expense", "credit_card_purchase"])
      .is("voided_at", null)
      .gte("occurred_on", month)
      .lt("occurred_on", nextMonthStart(month)),
  ]);

  const budgetMonth = (monthResult.data ?? null) as MonthRow | null;
  const transactions = ((transactionsResult.data ?? []) as TransactionRow[]).filter(
    (transaction) =>
      countsAsBudgetSpending(transaction.type) &&
      transaction.voided_at === null &&
      occurredInMonth(transaction.occurred_on, month),
  );
  const transactionIds = transactions.map((transaction) => transaction.id);
  const [linesResult, splitsResult] = await Promise.all([
    budgetMonth
      ? supabase
          .from("budget_lines")
          .select("category_id, amount_mode, planned_centavos, percent_bps")
          .eq("user_id", user.id)
          .eq("budget_month_id", budgetMonth.id)
      : Promise.resolve({ data: [] as LineRow[], error: null }),
    transactionIds.length > 0
      ? supabase
          .from("transaction_splits")
          .select("transaction_id, category_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", transactionIds)
      : Promise.resolve({ data: [] as SplitRow[], error: null }),
  ]);

  const planError = categoriesResult.error ?? monthResult.error ?? linesResult.error;
  const spendingLoaded = !transactionsResult.error && !splitsResult.error;
  const baseCentavos = budgetMonth
    ? BigInt(budgetMonth.allocation_base_centavos ?? 0)
    : ALLOCATION_BASE_CENTAVOS;
  const savedByCategory = new Map<string, bigint | null>();
  for (const row of (linesResult.data ?? []) as LineRow[]) {
    savedByCategory.set(
      row.category_id,
      resolvedPlannedCentavos({
        amountMode: row.amount_mode,
        plannedCentavos:
          row.planned_centavos === null ? null : BigInt(row.planned_centavos),
        percentBps: row.percent_bps === null ? null : BigInt(row.percent_bps),
        baseCentavos,
      }),
    );
  }

  const categories = ((categoriesResult.data ?? []) as CategoryRow[])
    .filter((category) => isBudgetCategory(category.report_treatment))
    .slice()
    .sort(byStarterOrder);
  const transactionIdSet = new Set(transactionIds);
  const spent = spendingTotals(
    ((splitsResult.data ?? []) as SplitRow[]).flatMap((row) => {
      if (!transactionIdSet.has(row.transaction_id)) {
        return [];
      }
      return [
        {
          categoryId: row.category_id,
          amountCentavos: BigInt(row.amount_centavos ?? 0),
        },
      ];
    }),
  );

  const lines: BudgetEditorLine[] = categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    treatment: category.report_treatment as BudgetTreatment,
    plannedInput: centavosToPesoInput(plannedFor(category, savedByCategory)),
    spentCentavos:
      category.report_treatment === "savings_allocation" || !spendingLoaded
        ? null
        : (spent.get(category.id) ?? 0n).toString(),
  }));
  const planReady = !planError;

  return (
    <div className="flex flex-col gap-8">
      {planError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The budget could not be loaded.
        </p>
      ) : null}
      {planReady && categories.length === 0 ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Budget categories are not on this user yet. Seed the starter categories
          in the Supabase SQL editor, then refresh.
        </p>
      ) : null}
      {planReady && categories.length > 0 ? (
        <BudgetForm
          month={month}
          monthLabel={formatBudgetMonth(month)}
          baseCentavos={baseCentavos.toString()}
          planKey={lines.map((line) => `${line.categoryId}:${line.plannedInput}`).join("|")}
          closed={budgetMonth?.status === "closed"}
          lines={lines}
        />
      ) : null}
    </div>
  );
}

function plannedFor(
  category: CategoryRow,
  savedByCategory: ReadonlyMap<string, bigint | null>,
): bigint {
  const saved = savedByCategory.has(category.id)
    ? (savedByCategory.get(category.id) ?? null)
    : null;
  return defaultPlannedCentavos(category.name, saved);
}

function byStarterOrder(left: CategoryRow, right: CategoryRow): number {
  const leftOrder = starterOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = starterOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
}
