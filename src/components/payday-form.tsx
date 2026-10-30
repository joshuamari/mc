"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { savePayCutoffs, type SavePaydayState } from "@/app/actions/payday";
import { MoneyParseError, formatCentavos, pesosToCentavos } from "@/lib/money";
import {
  PaydayError,
  leftToSpend,
  occurredInPeriod,
  paycheckCentavos,
  nextCutoff,
  paydayPlanPosting,
  pesoInputFromCentavos,
  type CutoffInput,
} from "@/lib/payday";
import { formatIsoDate } from "@/lib/transactions";

const fieldClass =
  "h-11 rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type PaydayBill = {
  categoryId: string;
  name: string;
  treatment: "consumption" | "savings_allocation";
  amountCentavos: string;
  firstCentavos: string;
  secondCentavos: string;
};

export type PaydayIncome = {
  occurredOn: string;
  amountCentavos: string;
};

type ShareInput = {
  first: string;
  second: string;
};

export function PaydayForm({
  today,
  month,
  monthLabel,
  monthEnd,
  planKey,
  closed,
  cutoffs,
  bills,
  incomes,
}: {
  today: string;
  month: string;
  monthLabel: string;
  monthEnd: string;
  planKey: string;
  closed: boolean;
  cutoffs: [CutoffInput, CutoffInput];
  bills: PaydayBill[];
  incomes: PaydayIncome[] | null;
}) {
  const initialShares = sharesFromBills(bills);
  const [seenPlan, setSeenPlan] = useState(planKey);
  const [dates, setDates] = useState<[CutoffInput, CutoffInput]>(cutoffs);
  const [shares, setShares] = useState(initialShares);
  const [state, formAction, pending] = useActionState<SavePaydayState, FormData>(
    savePayCutoffs,
    null,
  );

  if (planKey !== seenPlan) {
    setSeenPlan(planKey);
    setDates(cutoffs);
    setShares(initialShares);
  }

  const draftError = draftProblem(month, dates, bills, shares);
  const savedId = state && "savedId" in state ? state.savedId : null;

  return (
    <form action={closed ? undefined : formAction} className="flex max-w-xl flex-col gap-8" aria-busy={pending}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{monthLabel}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Amounts come from Monthly budget. Divide a box when both cutoffs cover part of it.
          The two amounts add up to the monthly amount.
        </p>
        {closed ? <p className="text-sm text-zinc-600 dark:text-zinc-400">This month is closed.</p> : null}
      </div>
      <input type="hidden" name="month" value={month} />
      <NextCutoff
        cutoff={nextCutoff(dates, today)}
        bills={bills}
        shares={shares}
        incomes={incomes}
      />
      {dates.map((cutoff) => (
        <CutoffSection
          key={cutoff.sequence}
          cutoff={cutoff}
          month={month}
          monthEnd={monthEnd}
          closed={closed}
          dueCentavos={dueCentavos(cutoff.sequence, bills, shares)}
          incomes={incomes}
          onDateChange={(next) =>
            setDates((current) =>
              current.map((item) => (item.sequence === next.sequence ? next : item)) as [
                CutoffInput,
                CutoffInput,
              ],
            )
          }
        />
      ))}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Monthly amounts</h3>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {bills.map((bill) => {
            const share = shares[bill.categoryId] ?? {
              first: pesoInputFromCentavos(BigInt(bill.firstCentavos)),
              second: pesoInputFromCentavos(BigInt(bill.secondCentavos)),
            };
            const monthly = BigInt(bill.amountCentavos);
            return (
              <li key={bill.categoryId} className="flex flex-col gap-3 py-3">
                <input type="hidden" name="categoryId" value={bill.categoryId} />
                <input type="hidden" name={`monthly:${bill.categoryId}`} value={pesoInputFromCentavos(monthly)} />
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium">{bill.name}</p>
                  <p className="tabular-nums">{formatCentavos(monthly)}</p>
                </div>
                {bill.treatment === "savings_allocation" ? (
                  <p className="text-sm text-zinc-500">Set aside. This is not spending.</p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <AmountField
                    id={`cutoff1-${bill.categoryId}`}
                    name={`cutoff1:${bill.categoryId}`}
                    label="Cutoff 1"
                    value={share.first}
                    closed={closed}
                    onChange={(value) => setShares((current) => withRemainder(current, bill.categoryId, monthly, "first", value))}
                  />
                  <AmountField
                    id={`cutoff2-${bill.categoryId}`}
                    name={`cutoff2:${bill.categoryId}`}
                    label="Cutoff 2"
                    value={share.second}
                    closed={closed}
                    onChange={(value) => setShares((current) => withRemainder(current, bill.categoryId, monthly, "second", value))}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {draftError ? <p className="text-sm text-red-700 dark:text-red-400">{draftError}</p> : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Cutoffs saved.
        </p>
      ) : null}
      {closed ? null : (
        <button
          type="submit"
          disabled={pending || draftError !== null || bills.length === 0}
          className="h-11 max-w-xs rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Saving…" : "Save cutoffs"}
        </button>
      )}
    </form>
  );
}

function NextCutoff({
  cutoff,
  bills,
  shares,
  incomes,
}: {
  cutoff: CutoffInput;
  bills: readonly PaydayBill[];
  shares: Record<string, ShareInput>;
  incomes: PaydayIncome[] | null;
}) {
  const due = dueCentavos(cutoff.sequence, bills, shares);
  const paycheck =
    incomes === null
      ? null
      : paycheckCentavos(
          incomes.flatMap((income) =>
            occurredInPeriod(income.occurredOn, cutoff.periodStart, cutoff.periodEnd)
              ? [BigInt(income.amountCentavos)]
              : [],
          ),
        );
  const left = incomes === null ? null : leftToSpend(paycheck, due);
  const payables = bills.flatMap((bill) => {
    const parsed = parsedShare(bill, shares[bill.categoryId]);
    if (!parsed) {
      return [];
    }
    const amount = cutoff.sequence === 1 ? parsed.firstCentavos : parsed.secondCentavos;
    if (amount <= 0n) {
      return [];
    }
    return [{ id: bill.categoryId, name: bill.name, amount, setAside: bill.treatment === "savings_allocation" }];
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">Next cutoff</h3>
        <p className="text-sm text-zinc-500">Pay date {formatIsoDate(cutoff.expectedPayDate)}</p>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-zinc-700 dark:text-zinc-300">
          Paycheck{" "}
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {incomes === null ? "could not be loaded" : paycheck === null ? "not recorded" : formatCentavos(paycheck)}
          </span>
        </p>
        <p className="text-zinc-700 dark:text-zinc-300">
          Due{" "}
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{formatCentavos(due)}</span>
        </p>
        <p className={left !== null && left < 0n ? "text-red-700 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}>
          {left === null
            ? "Left to spend appears after the paycheck is recorded."
            : left < 0n
              ? `Over by ${formatCentavos(-left)}`
              : `Left ${formatCentavos(left)}`}
        </p>
      </div>
      {payables.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing is due in this cutoff.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {payables.map((payable) => (
            <li key={payable.id} className="flex items-baseline justify-between gap-4 py-3">
              <div>
                <p className="font-medium">{payable.name}</p>
                {payable.setAside ? <p className="text-sm text-zinc-500">Set aside</p> : null}
              </div>
              <p className="tabular-nums">{formatCentavos(payable.amount)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-zinc-500">The card bill is not in this list.</p>
    </section>
  );
}

function CutoffSection({
  cutoff,
  month,
  monthEnd,
  closed,
  dueCentavos,
  incomes,
  onDateChange,
}: {
  cutoff: CutoffInput;
  month: string;
  monthEnd: string;
  closed: boolean;
  dueCentavos: bigint;
  incomes: PaydayIncome[] | null;
  onDateChange: (cutoff: CutoffInput) => void;
}) {
  const paycheck =
    incomes === null
      ? null
      : paycheckCentavos(
          incomes.flatMap((income) =>
            occurredInPeriod(income.occurredOn, cutoff.periodStart, cutoff.periodEnd)
              ? [BigInt(income.amountCentavos)]
              : [],
          ),
        );
  const left = incomes === null ? null : leftToSpend(paycheck, dueCentavos);
  const incomeCount =
    incomes === null
      ? 0
      : incomes.filter((income) =>
          occurredInPeriod(income.occurredOn, cutoff.periodStart, cutoff.periodEnd),
        ).length;

  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">Cutoff {cutoff.sequence}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <DateField
          id={`start-${cutoff.sequence}`}
          name={`start:${cutoff.sequence}`}
          label="From"
          value={cutoff.periodStart}
          min={month}
          max={monthEnd}
          closed={closed}
          onChange={(periodStart) => onDateChange({ ...cutoff, periodStart })}
        />
        <DateField
          id={`end-${cutoff.sequence}`}
          name={`end:${cutoff.sequence}`}
          label="To"
          value={cutoff.periodEnd}
          min={month}
          max={monthEnd}
          closed={closed}
          onChange={(periodEnd) => onDateChange({ ...cutoff, periodEnd })}
        />
        <DateField
          id={`pay-${cutoff.sequence}`}
          name={`pay:${cutoff.sequence}`}
          label="Pay date"
          value={cutoff.expectedPayDate}
          min={month}
          max={monthEnd}
          closed={closed}
          onChange={(expectedPayDate) => onDateChange({ ...cutoff, expectedPayDate })}
        />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-zinc-700 dark:text-zinc-300">
          Paycheck{" "}
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {incomes === null ? "could not be loaded" : paycheck === null ? "not recorded" : formatCentavos(paycheck)}
          </span>
        </p>
        {incomes !== null && paycheck === null ? (
          <p className="text-zinc-500">
            Record it on{" "}
            <Link href="/transactions" className="underline">
              Transactions
            </Link>
            .
          </p>
        ) : null}
        {incomeCount > 1 ? (
          <p className="text-zinc-500">Includes {incomeCount} income transactions.</p>
        ) : null}
        <p className="text-zinc-700 dark:text-zinc-300">
          Due{" "}
          <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
            {formatCentavos(dueCentavos)}
          </span>
        </p>
        {dueCentavos === 0n ? <p className="text-zinc-500">Nothing is due in this cutoff.</p> : null}
        <p className={left !== null && left < 0n ? "text-red-700 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}>
          {left === null
            ? "Left to spend appears after the paycheck is recorded."
            : left < 0n
              ? `Over by ${formatCentavos(-left)}`
              : `Left ${formatCentavos(left)}`}
        </p>
      </div>
    </section>
  );
}

function DateField({
  id,
  name,
  label,
  value,
  min,
  max,
  closed,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  min: string;
  max: string;
  closed: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        required
        min={min}
        max={max}
        disabled={closed}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

function AmountField({
  id,
  name,
  label,
  value,
  closed,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  closed: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        inputMode="decimal"
        required
        disabled={closed}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    </div>
  );
}

function sharesFromBills(bills: readonly PaydayBill[]): Record<string, ShareInput> {
  return Object.fromEntries(
    bills.map((bill) => [
      bill.categoryId,
      {
        first: pesoInputFromCentavos(BigInt(bill.firstCentavos)),
        second: pesoInputFromCentavos(BigInt(bill.secondCentavos)),
      },
    ]),
  );
}

function withRemainder(
  current: Record<string, ShareInput>,
  categoryId: string,
  monthly: bigint,
  edited: "first" | "second",
  value: string,
): Record<string, ShareInput> {
  const share = current[categoryId] ?? { first: "", second: "" };
  const next = { ...share, [edited]: value };
  const other = edited === "first" ? "second" : "first";
  try {
    const entered = pesosToCentavos(value);
    if (entered >= 0n && entered <= monthly) {
      next[other] = pesoInputFromCentavos(monthly - entered);
    }
  } catch (error) {
    if (!(error instanceof MoneyParseError)) {
      throw error;
    }
  }
  return { ...current, [categoryId]: next };
}

function dueCentavos(
  sequence: 1 | 2,
  bills: readonly PaydayBill[],
  shares: Record<string, ShareInput>,
): bigint {
  return bills.reduce((total, bill) => {
    const parsed = parsedShare(bill, shares[bill.categoryId]);
    if (!parsed) {
      return total;
    }
    return total + (sequence === 1 ? parsed.firstCentavos : parsed.secondCentavos);
  }, 0n);
}

function parsedShare(
  bill: PaydayBill,
  share: ShareInput | undefined,
): { firstCentavos: bigint; secondCentavos: bigint } | null {
  if (!share) {
    return null;
  }
  try {
    const firstCentavos = pesosToCentavos(share.first);
    const secondCentavos = pesosToCentavos(share.second);
    if (
      firstCentavos < 0n ||
      secondCentavos < 0n ||
      firstCentavos + secondCentavos !== BigInt(bill.amountCentavos)
    ) {
      return null;
    }
    return { firstCentavos, secondCentavos };
  } catch (error) {
    if (error instanceof MoneyParseError) {
      return null;
    }
    throw error;
  }
}

function draftProblem(
  month: string,
  cutoffs: readonly CutoffInput[],
  bills: readonly PaydayBill[],
  shares: Record<string, ShareInput>,
): string | null {
  try {
    const posted = new Map<string, { firstCentavos: bigint; secondCentavos: bigint }>();
    for (const bill of bills) {
      const parsed = parsedShare(bill, shares[bill.categoryId]);
      if (!parsed) {
        return "The two amounts must add up to the monthly amount.";
      }
      posted.set(bill.categoryId, parsed);
    }
    paydayPlanPosting(
      month,
      cutoffs,
      posted,
      bills.map((bill) => ({
        categoryId: bill.categoryId,
        amountCentavos: BigInt(bill.amountCentavos),
      })),
    );
    return null;
  } catch (error) {
    if (error instanceof PaydayError) {
      return error.message;
    }
    throw error;
  }
}
