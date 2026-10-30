import "server-only";

import { io } from "next/cache";

import { CardActivityForm } from "@/components/card-activity-form";
import { CardForm } from "@/components/card-form";
import { StatementForm } from "@/components/statement-form";
import { isAssetAccountKind, manilaDate } from "@/lib/accounts";
import { getCurrentUser } from "@/lib/auth";
import {
  MAX_CREDIT_CARDS,
  availableCredit,
  cardActivityAmount,
  debtAsOf,
  formatLast4,
  overLimitBy,
  statementDifference,
  type CardActivity,
} from "@/lib/cards";
import { formatCentavos } from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";
import { createClient } from "@/lib/supabase/server";
import { formatIsoDate, type MovementEntry } from "@/lib/transactions";

type AccountRow = {
  id: string;
  name: string;
  kind: string;
};

type TermsRow = {
  account_id: string;
  credit_limit_centavos: string | number;
  statement_close_day: number;
  payment_due_day: number;
  last4: string | null;
};

type BalanceRow = {
  account_id: string;
  balance_centavos: string | number;
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

type StatementRow = {
  id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_centavos: string | number;
  minimum_due_centavos: string | number | null;
  due_on: string;
};

type ReconciliationRow = {
  account_id: string;
  statement_date: string;
  calculated_balance_centavos: string | number;
};

type LedgerEntryRow = {
  account_id: string;
  transaction_id: string;
  amount_centavos: string | number;
};

type DatedTransactionRow = {
  id: string;
  occurred_on: string;
  voided_at: string | null;
};

const starterOrder = new Map(
  STARTER_CATEGORIES.map((category, index) => [category.name, index]),
);

export async function CardsPanel() {
  // new Date() and crypto.randomUUID() cannot run while the static shell prerenders.
  await io();
  const user = await getCurrentUser();
  const supabase = await createClient();
  const [accountsResult, termsResult, balancesResult, categoriesResult, transactionsResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name, kind")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("credit_card_terms")
        .select("account_id, credit_limit_centavos, statement_close_day, payment_due_day, last4")
        .eq("user_id", user.id),
      supabase.from("account_balances").select("account_id, balance_centavos").eq("user_id", user.id),
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
        .in("type", ["credit_card_purchase", "credit_card_payment"])
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

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

  const firstError =
    accountsResult.error ??
    termsResult.error ??
    balancesResult.error ??
    categoriesResult.error ??
    transactionsResult.error ??
    entriesResult.error ??
    splitsResult.error;

  const termsByAccount = new Map(
    ((termsResult.data ?? []) as TermsRow[]).map((terms) => [terms.account_id, terms]),
  );
  const balances = new Map(
    ((balancesResult.data ?? []) as BalanceRow[]).map((row) => [
      row.account_id,
      BigInt(row.balance_centavos ?? 0),
    ]),
  );
  const accounts = (accountsResult.data ?? []) as AccountRow[];
  const assetAccounts = accounts.flatMap((account) =>
    isAssetAccountKind(account.kind) ? [{ id: account.id, name: account.name }] : [],
  );
  const cards = accounts.flatMap((account) => {
    if (account.kind !== "credit_card") {
      return [];
    }
    const terms = termsByAccount.get(account.id);
    if (!terms) {
      return [];
    }
    const debtCentavos = balances.get(account.id) ?? 0n;
    const limitCentavos = BigInt(terms.credit_limit_centavos ?? 0);
    return [
      {
        id: account.id,
        name: account.name,
        last4: formatLast4(terms.last4),
        closeDay: terms.statement_close_day,
        dueDay: terms.payment_due_day,
        debtCentavos,
        limitCentavos,
        availableCentavos: availableCredit(limitCentavos, debtCentavos),
        overByCentavos: overLimitBy(limitCentavos, debtCentavos),
      },
    ];
  });
  const cardAccountIds = cards.map((card) => card.id);
  const [statementsResult, reconciliationsResult, ledgerEntriesResult] = await Promise.all([
    !firstError && cardAccountIds.length > 0
      ? supabase
          .from("card_statements")
          .select(
            "id, account_id, period_start, period_end, statement_balance_centavos, minimum_due_centavos, due_on",
          )
          .eq("user_id", user.id)
          .in("account_id", cardAccountIds)
      : Promise.resolve({ data: [] as StatementRow[], error: null }),
    !firstError && cardAccountIds.length > 0
      ? supabase
          .from("reconciliations")
          .select("account_id, statement_date, calculated_balance_centavos")
          .eq("user_id", user.id)
          .in("account_id", cardAccountIds)
      : Promise.resolve({ data: [] as ReconciliationRow[], error: null }),
    !firstError && cardAccountIds.length > 0
      ? supabase
          .from("transaction_entries")
          .select("account_id, transaction_id, amount_centavos")
          .eq("user_id", user.id)
          .in("account_id", cardAccountIds)
      : Promise.resolve({ data: [] as LedgerEntryRow[], error: null }),
  ]);
  const ledgerEntries = (ledgerEntriesResult.data ?? []) as LedgerEntryRow[];
  const ledgerTransactionIds = [...new Set(ledgerEntries.map((entry) => entry.transaction_id))];
  const datedTransactionsResult =
    !firstError && ledgerTransactionIds.length > 0
      ? await supabase
          .from("transactions")
          .select("id, occurred_on, voided_at")
          .eq("user_id", user.id)
          .in("id", ledgerTransactionIds)
      : { data: [] as DatedTransactionRow[], error: null };
  const loadError =
    firstError ??
    statementsResult.error ??
    reconciliationsResult.error ??
    ledgerEntriesResult.error ??
    datedTransactionsResult.error;

  const categories = ((categoriesResult.data ?? []) as CategoryRow[])
    .filter((category) => category.report_treatment === "consumption")
    .slice()
    .sort(byStarterOrder)
    .map((category) => ({ id: category.id, name: category.name }));
  const entriesByTransaction = new Map<string, MovementEntry[]>();
  for (const row of (entriesResult.data ?? []) as EntryRow[]) {
    const entries = entriesByTransaction.get(row.transaction_id) ?? [];
    entries.push({
      accountId: row.account_id,
      amountCentavos: BigInt(row.amount_centavos ?? 0),
    });
    entriesByTransaction.set(row.transaction_id, entries);
  }
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryByTransaction = new Map<string, string>();
  for (const row of (splitsResult.data ?? []) as SplitRow[]) {
    if (!categoryByTransaction.has(row.transaction_id)) {
      categoryByTransaction.set(
        row.transaction_id,
        categoryNames.get(row.category_id) ?? "Category",
      );
    }
  }
  const cardIds = new Set(cards.map((card) => card.id));
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const listed = transactions.flatMap((transaction) => {
    const activity = activityKind(transaction.type);
    if (!activity) {
      return [];
    }
    const entries = entriesByTransaction.get(transaction.id) ?? [];
    const cardEntry = entries.find((entry) => cardIds.has(entry.accountId));
    const source = entries.find((entry) => !cardIds.has(entry.accountId));
    const cardName = accountNames.get(cardEntry?.accountId ?? "") ?? "Card";
    return [
      {
        id: transaction.id,
        description: transaction.description,
        occurredOn: transaction.occurred_on,
        activity,
        cardName,
        categoryName: categoryByTransaction.get(transaction.id) ?? null,
        sourceName: accountNames.get(source?.accountId ?? "") ?? null,
        amountCentavos: cardActivityAmount(entries),
      },
    ];
  });
  const occurredOnByTransaction = new Map(
    ((datedTransactionsResult.data ?? []) as DatedTransactionRow[]).map((transaction) => [
      transaction.id,
      transaction,
    ]),
  );
  const datedEntriesByCard = new Map<
    string,
    { occurredOn: string; amountCentavos: bigint; voided: boolean }[]
  >();
  for (const entry of ledgerEntries) {
    const transaction = occurredOnByTransaction.get(entry.transaction_id);
    if (!transaction) {
      continue;
    }
    const rows = datedEntriesByCard.get(entry.account_id) ?? [];
    rows.push({
      occurredOn: transaction.occurred_on,
      amountCentavos: BigInt(entry.amount_centavos ?? 0),
      voided: transaction.voided_at !== null,
    });
    datedEntriesByCard.set(entry.account_id, rows);
  }
  const calculatedByStatement = new Map(
    ((reconciliationsResult.data ?? []) as ReconciliationRow[]).map((row) => [
      `${row.account_id}:${row.statement_date}`,
      BigInt(row.calculated_balance_centavos ?? 0),
    ]),
  );
  const statements = ((statementsResult.data ?? []) as StatementRow[])
    .slice()
    .sort((left, right) => right.period_end.localeCompare(left.period_end))
    .map((statement) => {
      const liveCalculated = debtAsOf(
        datedEntriesByCard.get(statement.account_id) ?? [],
        statement.period_end,
      );
      const storedCalculated = calculatedByStatement.get(
        `${statement.account_id}:${statement.period_end}`,
      );
      const statementCentavos = BigInt(statement.statement_balance_centavos ?? 0);
      const difference = statementDifference(statementCentavos, liveCalculated);
      return {
        id: statement.id,
        cardName: accountNames.get(statement.account_id) ?? "Card",
        periodStart: statement.period_start,
        periodEnd: statement.period_end,
        dueOn: statement.due_on,
        statementCentavos,
        liveCalculated,
        minimumDueCentavos:
          statement.minimum_due_centavos === null
            ? null
            : BigInt(statement.minimum_due_centavos),
        difference,
        stale: storedCalculated !== undefined && storedCalculated !== liveCalculated,
      };
    });

  return (
    <div className="flex flex-col gap-8">
      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Cards could not be loaded.
        </p>
      ) : cards.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">No cards yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {cards.map((card) => (
            <li key={card.id} className="flex flex-col gap-1 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {card.name}
                    {card.last4 ? <span className="text-zinc-500"> {card.last4}</span> : null}
                  </p>
                  <p className="text-sm text-zinc-500">
                    Statement closes on day {card.closeDay}. Payment is due on day {card.dueDay}.
                  </p>
                </div>
                <p className="tabular-nums">{formatCentavos(card.debtCentavos)} owed</p>
              </div>
              <p className="text-sm text-zinc-500">
                Limit {formatCentavos(card.limitCentavos)}
                {card.overByCentavos > 0n ? (
                  <span className="text-red-700 dark:text-red-400">
                    {" "}
                    · Over limit by {formatCentavos(card.overByCentavos)}
                  </span>
                ) : card.availableCentavos !== null ? (
                  <span> · {formatCentavos(card.availableCentavos)} available</span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!loadError && cards.length > 0 && listed.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">No card activity yet.</p>
      ) : null}
      {!loadError && listed.length > 0 ? (
        <div className="flex flex-col gap-3">
          {listed.length === 40 ? <p className="text-sm text-zinc-500">Showing the latest 40.</p> : null}
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listed.map((transaction) => (
              <li key={transaction.id} className="flex items-baseline justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-sm text-zinc-500">
                    {formatIsoDate(transaction.occurredOn)} · {activityLabel(transaction.activity)} ·{" "}
                    {transaction.cardName}
                    {transaction.categoryName ? ` · ${transaction.categoryName}` : ""}
                  </p>
                  {transaction.activity === "payment" && transaction.sourceName ? (
                    <p className="text-sm text-zinc-500">From {transaction.sourceName}</p>
                  ) : null}
                </div>
                <p className="tabular-nums">
                  {transaction.activity === "payment"
                    ? formatCentavos(-transaction.amountCentavos)
                    : formatCentavos(transaction.amountCentavos)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!loadError && cards.length < MAX_CREDIT_CARDS ? (
        <CardForm today={manilaDate(new Date())} initialIdempotencyKey={crypto.randomUUID()} />
      ) : null}
      {!loadError && cards.length >= MAX_CREDIT_CARDS ? (
        <p className="text-sm text-zinc-500">Two cards is the limit.</p>
      ) : null}
      {!loadError && cards.length > 0 ? (
        <CardActivityForm
          today={manilaDate(new Date())}
          initialIdempotencyKey={crypto.randomUUID()}
          cards={cards.map((card) => ({ id: card.id, name: card.name }))}
          accounts={assetAccounts}
          categories={categories}
        />
      ) : null}
      {!loadError && cards.length > 0 && statements.length === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">No statements yet.</p>
      ) : null}
      {!loadError && statements.length > 0 ? (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {statements.map((statement) => (
            <li key={statement.id} className="flex flex-col gap-1 py-3">
              <p className="font-medium">{statement.cardName}</p>
              <p className="text-sm text-zinc-500">
                {formatIsoDate(statement.periodStart)} to {formatIsoDate(statement.periodEnd)} · Due{" "}
                {formatIsoDate(statement.dueOn)}
                {statement.minimumDueCentavos !== null
                  ? ` · Minimum ${formatCentavos(statement.minimumDueCentavos)}`
                  : ""}
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Statement {formatCentavos(statement.statementCentavos)} · Recorded{" "}
                {formatCentavos(statement.liveCalculated)}
              </p>
              <p
                className={
                  statement.difference === 0n
                    ? "text-sm text-zinc-600 dark:text-zinc-400"
                    : "text-sm text-red-700 dark:text-red-400"
                }
              >
                {statement.difference === 0n
                  ? "Matches the statement."
                  : `Off by ${formatCentavos(statement.difference < 0n ? -statement.difference : statement.difference)}. A purchase or payment is missing or extra.`}
              </p>
              {statement.stale ? (
                <p className="text-sm text-zinc-500">
                  Activity changed after this check. Save this statement again.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!loadError && cards.length > 0 ? (
        <StatementForm cards={cards.map((card) => ({ id: card.id, name: card.name }))} />
      ) : null}
    </div>
  );
}

function activityKind(type: string): CardActivity | null {
  if (type === "credit_card_purchase") {
    return "purchase";
  }
  if (type === "credit_card_payment") {
    return "payment";
  }
  return null;
}

function activityLabel(activity: CardActivity): string {
  return activity === "payment" ? "Payment" : "Purchase";
}

function byStarterOrder(left: CategoryRow, right: CategoryRow): number {
  const leftOrder = starterOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = starterOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.name.localeCompare(right.name);
}
