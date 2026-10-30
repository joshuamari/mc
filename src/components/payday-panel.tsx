import "server-only";

import { io } from "next/cache";
import Link from "next/link";

import { PaydayForm, type PaydayBill, type PaydayIncome } from "@/components/payday-form";
import { manilaDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { formatBudgetMonth, isBudgetCategory, manilaMonthStart, resolvedPlannedCentavos } from "@/lib/budget";
import { ALLOCATION_BASE_CENTAVOS } from "@/lib/money";
import {
  dateInMonth,
  defaultCutoffSequence,
  defaultCutoffs,
  isCutoffSequence,
  monthEnd,
  restoredCutoffShares,
  type CutoffInput,
  type CutoffSequence,
} from "@/lib/payday";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";
import { createClient } from "@/lib/supabase/server";
import { movementAmount, type MovementEntry } from "@/lib/transactions";

type CategoryRow = {
  id: string;
  name: string;
  category_group: string;
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

type PeriodRow = {
  id: string;
  sequence: number;
  period_start: string;
  period_end: string;
  expected_pay_date: string;
};

type ItemRow = {
  pay_period_id: string;
  category_id: string | null;
  planned_centavos: string | number;
};

type IncomeRow = {
  id: string;
  occurred_on: string;
  type: string;
  voided_at: string | null;
};

type EntryRow = {
  transaction_id: string;
  amount_centavos: string | number;
};

const starterOrder = new Map(
  STARTER_CATEGORIES.map((category, index) => [category.name, index]),
);

export async function PaydayPanel() {
  // new Date() cannot run while the static shell prerenders.
  await io();
  const month = manilaMonthStart(new Date());
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [categoriesResult, monthResult, incomeResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, category_group, report_treatment")
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
      .select("id, occurred_on, type, voided_at")
      .eq("user_id", user.id)
      .eq("type", "income")
      .is("voided_at", null)
      .gte("occurred_on", month)
      .lte("occurred_on", monthEnd(month)),
  ]);

  const budgetMonth = (monthResult.data ?? null) as MonthRow | null;
  const [linesResult, periodsResult] = await Promise.all([
    budgetMonth
      ? supabase
          .from("budget_lines")
          .select("category_id, amount_mode, planned_centavos, percent_bps")
          .eq("user_id", user.id)
          .eq("budget_month_id", budgetMonth.id)
      : Promise.resolve({ data: [] as LineRow[], error: null }),
    budgetMonth
      ? supabase
          .from("pay_periods")
          .select("id, sequence, period_start, period_end, expected_pay_date")
          .eq("user_id", user.id)
          .eq("budget_month_id", budgetMonth.id)
      : Promise.resolve({ data: [] as PeriodRow[], error: null }),
  ]);

  const periods = (periodsResult.data ?? []) as PeriodRow[];
  const periodIds = periods.map((period) => period.id);
  const incomeRows = ((incomeResult.data ?? []) as IncomeRow[]).filter(
    (income) =>
      income.type === "income" &&
      income.voided_at === null &&
      dateInMonth(income.occurred_on, month),
  );
  const incomeIds = incomeRows.map((income) => income.id);
  const [itemsResult, entriesResult] = await Promise.all([
    periodIds.length > 0
      ? supabase
          .from("planned_items")
          .select("pay_period_id, category_id, planned_centavos")
          .eq("user_id", user.id)
          .in("pay_period_id", periodIds)
      : Promise.resolve({ data: [] as ItemRow[], error: null }),
    incomeIds.length > 0
      ? supabase
          .from("transaction_entries")
          .select("transaction_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", incomeIds)
      : Promise.resolve({ data: [] as EntryRow[], error: null }),
  ]);

  const planError =
    categoriesResult.error ??
    monthResult.error ??
    linesResult.error ??
    periodsResult.error ??
    itemsResult.error;
  const incomesLoaded = !incomeResult.error && !entriesResult.error;
  const baseCentavos = budgetMonth
    ? BigInt(budgetMonth.allocation_base_centavos ?? 0)
    : ALLOCATION_BASE_CENTAVOS;
  const savedAmount = new Map<string, bigint | null>();
  for (const row of (linesResult.data ?? []) as LineRow[]) {
    savedAmount.set(
      row.category_id,
      resolvedPlannedCentavos({
        amountMode: row.amount_mode,
        plannedCentavos: row.planned_centavos === null ? null : BigInt(row.planned_centavos),
        percentBps: row.percent_bps === null ? null : BigInt(row.percent_bps),
        baseCentavos,
      }),
    );
  }

  const sequenceByPeriod = new Map<string, CutoffSequence>();
  for (const period of periods) {
    if (isCutoffSequence(period.sequence)) {
      sequenceByPeriod.set(period.id, period.sequence);
    }
  }
  const savedShareByCategory = new Map<string, { first: bigint; second: bigint }>();
  for (const item of (itemsResult.data ?? []) as ItemRow[]) {
    const sequence = sequenceByPeriod.get(item.pay_period_id);
    if (!item.category_id || !sequence) {
      continue;
    }
    const current = savedShareByCategory.get(item.category_id) ?? { first: 0n, second: 0n };
    const amount = BigInt(item.planned_centavos ?? 0);
    if (sequence === 1) {
      current.first += amount;
    } else {
      current.second += amount;
    }
    savedShareByCategory.set(item.category_id, current);
  }

  const budgetCategories = ((categoriesResult.data ?? []) as CategoryRow[]).filter((category) =>
    isBudgetCategory(category.report_treatment),
  );
  const categories = budgetCategories
    .filter((category) => {
      const amount = savedAmount.get(category.id);
      return amount !== undefined && amount !== null;
    })
    .slice()
    .sort(byStarterOrder);
  const defaults = defaultCutoffs(month);
  const savedPeriodBySequence = new Map(periods.map((period) => [period.sequence, period]));
  const cutoffs = [1, 2].map((sequence) => {
    const saved = savedPeriodBySequence.get(sequence);
    const fallback = defaults[sequence - 1];
    if (!saved || !isCutoffSequence(sequence)) {
      return fallback;
    }
    return {
      sequence,
      periodStart: saved.period_start,
      periodEnd: saved.period_end,
      expectedPayDate: saved.expected_pay_date,
    } satisfies CutoffInput;
  }) as [CutoffInput, CutoffInput];

  const bills: PaydayBill[] = categories.flatMap((category) => {
    const amount = savedAmount.get(category.id);
    if (amount === null || amount === undefined || !isBudgetCategory(category.report_treatment)) {
      return [];
    }
    const saved = savedShareByCategory.get(category.id);
    const shares = restoredCutoffShares(
      amount,
      saved ? saved.first : null,
      saved ? saved.second : null,
      defaultCutoffSequence(category.category_group),
    );
    return [
      {
        categoryId: category.id,
        name: category.name,
        treatment: category.report_treatment,
        amountCentavos: amount.toString(),
        firstCentavos: shares.firstCentavos.toString(),
        secondCentavos: shares.secondCentavos.toString(),
      },
    ];
  });

  const entriesByTransaction = new Map<string, MovementEntry[]>();
  for (const row of (entriesResult.data ?? []) as EntryRow[]) {
    const entries = entriesByTransaction.get(row.transaction_id) ?? [];
    entries.push({
      accountId: "",
      amountCentavos: BigInt(row.amount_centavos ?? 0),
    });
    entriesByTransaction.set(row.transaction_id, entries);
  }
  const incomes: PaydayIncome[] | null = incomesLoaded
    ? incomeRows.flatMap((income) => {
        const amount = movementAmount("income", entriesByTransaction.get(income.id) ?? []);
        if (amount <= 0n) {
          return [];
        }
        return [{ occurredOn: income.occurred_on, amountCentavos: amount.toString() }];
      })
    : null;

  const ready = !planError && budgetMonth !== null && bills.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {planError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The payday plan could not be loaded.
        </p>
      ) : null}
      {!planError && budgetCategories.length === 0 ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Budget categories are not on this user yet. Seed the starter categories in the
          Supabase SQL editor, then save this month on Monthly budget.
        </p>
      ) : null}
      {!planError && budgetCategories.length > 0 && !budgetMonth ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Save this month on{" "}
          <Link href="/budget" className="underline">
            Monthly budget
          </Link>{" "}
          before planning the two cutoffs.
        </p>
      ) : null}
      {!planError && budgetMonth && bills.length === 0 ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          This month has no budget amounts yet. Save them on{" "}
          <Link href="/budget" className="underline">
            Monthly budget
          </Link>
          .
        </p>
      ) : null}
      {ready && budgetMonth ? (
        <PaydayForm
          today={manilaDate(new Date())}
          month={month}
          monthLabel={formatBudgetMonth(month)}
          monthEnd={monthEnd(month)}
          planKey={[
            ...cutoffs.map(
              (cutoff) =>
                `${cutoff.sequence}:${cutoff.periodStart}:${cutoff.periodEnd}:${cutoff.expectedPayDate}`,
            ),
            ...bills.map(
              (bill) =>
                `${bill.categoryId}:${bill.firstCentavos}:${bill.secondCentavos}:${bill.amountCentavos}`,
            ),
          ].join("|")}
          closed={budgetMonth.status === "closed"}
          cutoffs={cutoffs}
          bills={bills}
          incomes={incomes}
        />
      ) : null}
    </div>
  );
}

function byStarterOrder(left: CategoryRow, right: CategoryRow): number {
  const leftOrder = starterOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = starterOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
}
