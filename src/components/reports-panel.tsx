import "server-only";

import { io } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { formatBudgetMonth, manilaMonthStart, nextMonthStart } from "@/lib/budget";
import { formatCentavos, sumCentavos } from "@/lib/money";
import {
  paymentCentavos,
  reportGroup,
  spendingCentavos,
  transferCentavos,
  type ReportGroup,
} from "@/lib/overview";
import { createClient } from "@/lib/supabase/server";
import { formatIsoDate } from "@/lib/transactions";

type TransactionRow = {
  id: string;
  type: string;
  description: string;
  occurred_on: string;
};

type EntryRow = {
  transaction_id: string;
  amount_centavos: string | number;
};

type SplitRow = {
  transaction_id: string;
  category_id: string;
  amount_centavos: string | number;
};

type CategoryRow = {
  id: string;
  name: string;
};

type ReportLine = {
  id: string;
  description: string;
  occurredOn: string;
  detail: string;
  amountCentavos: bigint;
};

export async function ReportsPanel() {
  await io();
  const month = manilaMonthStart(new Date());
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [transactionsResult, categoriesResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, description, occurred_on")
      .eq("user_id", user.id)
      .in("type", ["expense", "credit_card_purchase", "credit_card_payment", "transfer"])
      .is("voided_at", null)
      .gte("occurred_on", month)
      .lt("occurred_on", nextMonthStart(month)),
    supabase.from("categories").select("id, name").eq("user_id", user.id),
  ]);

  const transactions = ((transactionsResult.data ?? []) as TransactionRow[]).filter(
    (transaction) => reportGroup(transaction.type) !== null,
  );
  const spendingIds = transactions
    .filter((transaction) => reportGroup(transaction.type) === "spending")
    .map((transaction) => transaction.id);
  const movementIds = transactions
    .filter((transaction) => reportGroup(transaction.type) !== "spending")
    .map((transaction) => transaction.id);
  const [splitsResult, entriesResult] = await Promise.all([
    !transactionsResult.error && spendingIds.length > 0
      ? supabase
          .from("transaction_splits")
          .select("transaction_id, category_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", spendingIds)
      : Promise.resolve({ data: [] as SplitRow[], error: null }),
    !transactionsResult.error && movementIds.length > 0
      ? supabase
          .from("transaction_entries")
          .select("transaction_id, amount_centavos")
          .eq("user_id", user.id)
          .in("transaction_id", movementIds)
      : Promise.resolve({ data: [] as EntryRow[], error: null }),
  ]);
  const loadError = transactionsResult.error ?? categoriesResult.error ?? splitsResult.error ?? entriesResult.error;

  const categoryNames = new Map(
    ((categoriesResult.data ?? []) as CategoryRow[]).map((category) => [category.id, category.name]),
  );
  const splitsByTransaction = new Map<string, SplitRow[]>();
  for (const split of (splitsResult.data ?? []) as SplitRow[]) {
    const rows = splitsByTransaction.get(split.transaction_id) ?? [];
    rows.push(split);
    splitsByTransaction.set(split.transaction_id, rows);
  }
  const entriesByTransaction = new Map<string, EntryRow[]>();
  for (const entry of (entriesResult.data ?? []) as EntryRow[]) {
    const rows = entriesByTransaction.get(entry.transaction_id) ?? [];
    rows.push(entry);
    entriesByTransaction.set(entry.transaction_id, rows);
  }

  const lines: { group: ReportGroup; line: ReportLine }[] = [];
  for (const transaction of transactions) {
    const group = reportGroup(transaction.type);
    if (!group) {
      continue;
    }
    if (group === "spending") {
      const splits = splitsByTransaction.get(transaction.id) ?? [];
      const names = [
        ...new Set(splits.map((split) => categoryNames.get(split.category_id) ?? "Category")),
      ];
      lines.push({
        group,
        line: {
          id: transaction.id,
          description: transaction.description,
          occurredOn: transaction.occurred_on,
          detail: names.join(", "),
          amountCentavos: spendingCentavos(
            splits.map((split) => ({ amountCentavos: BigInt(split.amount_centavos ?? 0) })),
          ),
        },
      });
      continue;
    }
    const entries = (entriesByTransaction.get(transaction.id) ?? []).map((entry) => ({
      amountCentavos: BigInt(entry.amount_centavos ?? 0),
    }));
    lines.push({
      group,
      line: {
        id: transaction.id,
        description: transaction.description,
        occurredOn: transaction.occurred_on,
        detail: "",
        amountCentavos:
          group === "card_payment" ? paymentCentavos(entries) : transferCentavos(entries),
      },
    });
  }

  const spending = lines.filter((row) => row.group === "spending").map((row) => row.line);
  const payments = lines.filter((row) => row.group === "card_payment").map((row) => row.line);
  const transfers = lines.filter((row) => row.group === "transfer").map((row) => row.line);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-zinc-500">{formatBudgetMonth(month)}</p>
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Reports could not be loaded.
        </p>
      ) : (
        <>
          <ReportSection title="Spending" empty="No spending this month." lines={spending} />
          <ReportSection title="Card payments" empty="No card payments this month." lines={payments} />
          <ReportSection title="Transfers" empty="No transfers this month." lines={transfers} />
        </>
      )}
    </div>
  );
}

function ReportSection({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: ReportLine[];
}) {
  const ordered = lines.slice().sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));
  const total = sumCentavos(ordered.map((line) => line.amountCentavos));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-zinc-500">
        Total{" "}
        <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
          {formatCentavos(total)}
        </span>
      </p>
      {ordered.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">{empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {ordered.map((line) => (
            <li key={line.id} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{line.description}</p>
                <p className="text-sm text-zinc-500">
                  {formatIsoDate(line.occurredOn)}
                  {line.detail ? ` · ${line.detail}` : ""}
                </p>
              </div>
              <p className="tabular-nums">{formatCentavos(line.amountCentavos)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
