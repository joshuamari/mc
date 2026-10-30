"use client";

import { useActionState, useState } from "react";

import { saveBudget, type SaveBudgetState } from "@/app/actions/budget";
import {
  BudgetError,
  budgetLineStatus,
  parsePlannedInput,
  planFit,
  planFitMessage,
  type BudgetTreatment,
} from "@/lib/budget";
import { MoneyParseError, formatCentavos } from "@/lib/money";

const fieldClass =
  "h-11 max-w-xs rounded-md border border-zinc-300 bg-white px-3 text-base outline-none focus-visible:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:border-zinc-100";

export type BudgetEditorLine = {
  categoryId: string;
  name: string;
  treatment: BudgetTreatment;
  plannedInput: string;
  spentCentavos: string | null;
};

export function BudgetForm({
  month,
  monthLabel,
  baseCentavos,
  planKey,
  closed,
  lines,
}: {
  month: string;
  monthLabel: string;
  baseCentavos: string;
  planKey: string;
  closed: boolean;
  lines: BudgetEditorLine[];
}) {
  const initialAmounts = amountsFromLines(lines);
  const [seenPlan, setSeenPlan] = useState(planKey);
  const [amounts, setAmounts] = useState(initialAmounts);
  const [state, formAction, pending] = useActionState<SaveBudgetState, FormData>(
    saveBudget,
    null,
  );

  if (planKey !== seenPlan) {
    setSeenPlan(planKey);
    setAmounts(initialAmounts);
  }

  const spending = lines.filter((line) => line.treatment === "consumption");
  const setAside = lines.filter((line) => line.treatment === "savings_allocation");
  const fit = currentFit(lines, amounts, baseCentavos);
  const savedId = state && "savedId" in state ? state.savedId : null;

  return (
    <form action={closed ? undefined : formAction} className="flex max-w-xl flex-col gap-6" aria-busy={pending}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">{monthLabel}</h2>
        {fit ? (
          <p
            className={
              fit.unallocatedCentavos < 0n
                ? "text-sm text-red-700 dark:text-red-400"
                : "text-sm text-zinc-600 dark:text-zinc-400"
            }
          >
            Plan{" "}
            <span
              className={
                fit.unallocatedCentavos < 0n
                  ? "font-medium tabular-nums"
                  : "font-medium text-zinc-900 tabular-nums dark:text-zinc-100"
              }
            >
              {formatCentavos(fit.plannedCentavos)}
            </span>
            . {planFitMessage(fit.unallocatedCentavos, BigInt(baseCentavos))}
          </p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Enter a peso amount for every category.
          </p>
        )}
        {closed ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">This month is closed.</p>
        ) : null}
      </div>
      <input type="hidden" name="month" value={month} />
      {spending.length > 0 ? (
        <BudgetGroup
          title="Spending"
          lines={spending}
          amounts={amounts}
          closed={closed}
          onAmountChange={(categoryId, value) =>
            setAmounts((current) => ({ ...current, [categoryId]: value }))
          }
        />
      ) : null}
      {setAside.length > 0 ? (
        <BudgetGroup
          title="Set aside"
          lines={setAside}
          amounts={amounts}
          closed={closed}
          onAmountChange={(categoryId, value) =>
            setAmounts((current) => ({ ...current, [categoryId]: value }))
          }
        />
      ) : null}
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {savedId ? (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Plan saved.
        </p>
      ) : null}
      {closed ? null : (
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="h-11 max-w-xs rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Saving…" : "Save this month"}
        </button>
      )}
    </form>
  );
}

function BudgetGroup({
  title,
  lines,
  amounts,
  closed,
  onAmountChange,
}: {
  title: string;
  lines: BudgetEditorLine[];
  amounts: Record<string, string>;
  closed: boolean;
  onAmountChange: (categoryId: string, value: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-zinc-500">{title}</h3>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {lines.map((line) => (
          <BudgetRow
            key={line.categoryId}
            line={line}
            amount={amounts[line.categoryId] ?? ""}
            closed={closed}
            onAmountChange={onAmountChange}
          />
        ))}
      </ul>
    </section>
  );
}

function BudgetRow({
  line,
  amount,
  closed,
  onAmountChange,
}: {
  line: BudgetEditorLine;
  amount: string;
  closed: boolean;
  onAmountChange: (categoryId: string, value: string) => void;
}) {
  const inputId = `planned-${line.categoryId}`;
  const parsed = parsedAmount(amount);
  const spent = line.spentCentavos === null ? null : BigInt(line.spentCentavos);
  const status = parsed !== null && spent !== null ? budgetLineStatus(parsed, spent) : null;

  return (
    <li className="flex flex-col gap-2 py-4">
      <input type="hidden" name="categoryId" value={line.categoryId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="font-medium">
          {line.name}
        </label>
        <input
          id={inputId}
          name={`amount:${line.categoryId}`}
          inputMode="decimal"
          required
          maxLength={20}
          autoComplete="off"
          disabled={closed}
          aria-describedby={`${inputId}-status`}
          value={amount}
          onChange={(event) => onAmountChange(line.categoryId, event.target.value)}
          className={fieldClass}
        />
      </div>
      <p id={`${inputId}-status`} className={statusClass(line, status)}>
        {statusText(line, parsed, status)}
      </p>
    </li>
  );
}

function statusText(
  line: BudgetEditorLine,
  parsed: bigint | null,
  status: { remainingCentavos: bigint; overByCentavos: bigint } | null,
): string {
  if (line.treatment === "savings_allocation") {
    return "Amount to set aside. A transfer does not count as spending.";
  }
  if (parsed === null) {
    return "Enter a peso amount with at most two decimal places.";
  }
  if (line.spentCentavos === null || status === null) {
    return "Spending could not be loaded.";
  }
  if (status.overByCentavos > 0n) {
    return `Spent ${formatCentavos(BigInt(line.spentCentavos))} · Over by ${formatCentavos(status.overByCentavos)}`;
  }
  return `Spent ${formatCentavos(BigInt(line.spentCentavos))} · Left ${formatCentavos(status.remainingCentavos)}`;
}

function statusClass(
  line: BudgetEditorLine,
  status: { overByCentavos: bigint } | null,
): string {
  if (line.treatment === "consumption" && status && status.overByCentavos > 0n) {
    return "text-sm text-red-700 dark:text-red-400";
  }
  return "text-sm text-zinc-500";
}

function amountsFromLines(lines: readonly BudgetEditorLine[]): Record<string, string> {
  return Object.fromEntries(lines.map((line) => [line.categoryId, line.plannedInput]));
}

function parsedAmount(input: string): bigint | null {
  try {
    return parsePlannedInput(input);
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof BudgetError) {
      return null;
    }
    throw error;
  }
}

function currentFit(
  lines: readonly BudgetEditorLine[],
  amounts: Record<string, string>,
  baseCentavos: string,
): { plannedCentavos: bigint; unallocatedCentavos: bigint } | null {
  try {
    const planned = lines.map((line) => parsePlannedInput(amounts[line.categoryId] ?? ""));
    return planFit(planned, BigInt(baseCentavos));
  } catch (error) {
    if (error instanceof MoneyParseError || error instanceof BudgetError) {
      return null;
    }
    throw error;
  }
}
