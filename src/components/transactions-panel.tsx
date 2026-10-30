import "server-only";

import { io } from "next/cache";
import Link from "next/link";

import { TransactionForm } from "@/components/transaction-form";
import { isAssetAccountKind, manilaDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import { formatCentavos } from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";
import { createClient } from "@/lib/supabase/server";
import {
  formatIsoDate,
  isMovementType,
  movementAmount,
  movementDirection,
  MOVEMENT_LABELS,
  type MovementEntry,
  type MovementType,
} from "@/lib/transactions";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
};

type CategoryRow = {
  id: string;
  name: string;
  report_treatment: string;
};

type TransactionRow = {
  id: string;
  occurred_on: string;
  type: string;
  description: string;
};

type EntryRow = {
  transaction_id: string;
  account_id: string;
  amount_centavos: string | number;
};

type SplitRow = {
  transaction_id: string;
  category_id: string;
};

const starterOrder = new Map(
  STARTER_CATEGORIES.map((category, index) => [category.name, index]),
);

export async function TransactionsPanel() {
  // new Date() and crypto.randomUUID() cannot run while the static shell prerenders.
  await io();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [accountsResult, categoriesResult, transactionsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, kind")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, report_treatment")
      .eq("user_id", user.id)
      .is("archived_at", null),
    supabase
      .from("transactions")
      .select("id, occurred_on, type, description, created_at")
      .eq("user_id", user.id)
      .is("voided_at", null)
      .in("type", ["income", "expense", "transfer"])
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const accounts = ((accountsResult.data ?? []) as AccountRow[]).flatMap((row) => {
    if (!isAssetAccountKind(row.kind)) {
      return [];
    }
    return [{ id: row.id, name: row.name }];
  });
  const categories = ((categoriesResult.data ?? []) as CategoryRow[])
    .slice()
    .sort(byStarterOrder);
  const incomeCategories = categories.flatMap((category) =>
    category.report_treatment === "income"
      ? [{ id: category.id, name: category.name }]
      : [],
  );
  const spendingCategories = categories.flatMap((category) =>
    category.report_treatment === "consumption"
      ? [{ id: category.id, name: category.name }]
      : [],
  );

  const transactions = (transactionsResult.data ?? []) as TransactionRow[];
  const transactionIds = transactions.map((transaction) => transaction.id);
  const [entriesResult, splitsResult] =
    transactionIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }]
      : await Promise.all([
          supabase
            .from("transaction_entries")
            .select("transaction_id, account_id, amount_centavos")
            .in("transaction_id", transactionIds),
          supabase
            .from("transaction_splits")
            .select("transaction_id, category_id")
            .in("transaction_id", transactionIds),
        ]);

  const loadError =
    accountsResult.error ??
    categoriesResult.error ??
    transactionsResult.error ??
    entriesResult.error ??
    splitsResult.error;

  const entriesByTransaction = new Map<string, MovementEntry[]>();
  for (const row of (entriesResult.data ?? []) as EntryRow[]) {
    const entries = entriesByTransaction.get(row.transaction_id) ?? [];
    entries.push({
      accountId: row.account_id,
      amountCentavos: BigInt(row.amount_centavos ?? 0),
    });
    entriesByTransaction.set(row.transaction_id, entries);
  }

  const categoryByTransaction = new Map<string, string>();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  for (const row of (splitsResult.data ?? []) as SplitRow[]) {
    if (!categoryByTransaction.has(row.transaction_id)) {
      categoryByTransaction.set(
        row.transaction_id,
        categoryNames.get(row.category_id) ?? "Category",
      );
    }
  }

  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const listed = transactions.flatMap((transaction) => {
    if (!isMovementType(transaction.type)) {
      return [];
    }
    const entries = entriesByTransaction.get(transaction.id) ?? [];
    return [
      {
        id: transaction.id,
        description: transaction.description,
        occurredOn: transaction.occurred_on,
        type: transaction.type,
        categoryName: categoryByTransaction.get(transaction.id) ?? null,
        amountCentavos: movementAmount(transaction.type, entries),
        direction: movementDirection(transaction.type, entries, accountNames),
      },
    ];
  });

  return (
    <div className="flex flex-col gap-8">
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Transactions could not be loaded.
        </p>
      ) : listed.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">No transactions yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {listed.length === 40 ? (
            <p className="text-sm text-zinc-500">Showing the latest 40.</p>
          ) : null}
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listed.map((transaction) => (
              <li
                key={transaction.id}
                className="flex items-baseline justify-between gap-4 py-3"
              >
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-sm text-zinc-500">
                    {formatIsoDate(transaction.occurredOn)} ·{" "}
                    {MOVEMENT_LABELS[transaction.type as MovementType]}
                    {transaction.categoryName ? ` · ${transaction.categoryName}` : ""}
                  </p>
                  <p className="text-sm text-zinc-500">{transaction.direction}</p>
                </div>
                <p className="tabular-nums">
                  {signedAmount(transaction.type as MovementType, transaction.amountCentavos)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!loadError && accounts.length === 0 ? (
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Add a balance before recording money that moves.{" "}
          <Link href="/accounts" className="underline">
            Go to Balances
          </Link>
          .
        </p>
      ) : accounts.length > 0 ? (
        <TransactionForm
          today={manilaDate(new Date())}
          initialIdempotencyKey={crypto.randomUUID()}
          accounts={accounts}
          incomeCategories={incomeCategories}
          spendingCategories={spendingCategories}
        />
      ) : null}
    </div>
  );
}

function signedAmount(type: MovementType, amountCentavos: bigint): string {
  if (type === "income") {
    return `+${formatCentavos(amountCentavos)}`;
  }
  if (type === "expense") {
    return formatCentavos(-amountCentavos);
  }
  return formatCentavos(amountCentavos);
}

function byStarterOrder(left: CategoryRow, right: CategoryRow): number {
  const leftOrder = starterOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = starterOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
}
