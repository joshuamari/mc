import { isIsoDate, manilaDate } from "@/lib/accounts";
import {
  ALLOCATION_BASE_CENTAVOS,
  MoneyParseError,
  formatCentavos,
  percentOfBase,
  pesosToCentavos,
  subtractCentavos,
  sumCentavos,
  unallocatedCentavos,
} from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetError";
  }
}

export type BudgetTreatment = "consumption" | "savings_allocation";

export type BudgetPlanLine = {
  categoryId: string;
  plannedCentavos: bigint;
};

export type BudgetLineStatus = {
  remainingCentavos: bigint;
  overByCentavos: bigint;
};

export type PlanFit = {
  plannedCentavos: bigint;
  unallocatedCentavos: bigint;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function isBudgetCategory(reportTreatment: string): reportTreatment is BudgetTreatment {
  return reportTreatment === "consumption" || reportTreatment === "savings_allocation";
}

/** Cash spending and card purchases. A card payment is not spending. */
export function countsAsBudgetSpending(type: string): boolean {
  return type === "expense" || type === "credit_card_purchase";
}

export function isMonthStart(value: string): boolean {
  return isIsoDate(value) && value.endsWith("-01");
}

/** First day of the next calendar month, as YYYY-MM-DD. */
export function nextMonthStart(month: string): string {
  if (!isMonthStart(month)) {
    throw new BudgetError("Choose a month.");
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}-01`;
}

/** Current calendar month in Asia/Manila, as YYYY-MM-01. */
export function manilaMonthStart(now: Date): string {
  return `${manilaDate(now).slice(0, 8)}01`;
}

export function formatBudgetMonth(month: string): string {
  if (!isMonthStart(month)) {
    return month;
  }
  const label = MONTHS[Number(month.slice(5, 7)) - 1];
  return label ? `${label} ${month.slice(0, 4)}` : month;
}

export function occurredInMonth(occurredOn: string, month: string): boolean {
  if (!isIsoDate(occurredOn) || !isMonthStart(month)) {
    return false;
  }
  return occurredOn >= month && occurredOn < nextMonthStart(month);
}

/** Plain peso text for an input, such as 4500.00. */
export function centavosToPesoInput(amount: bigint): string {
  if (amount < 0n) {
    throw new BudgetError("Enter a planned amount of zero or more.");
  }
  const whole = amount / 100n;
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * Planned peso text. A trailing decimal point is allowed while typing.
 * Negative amounts are rejected.
 */
export function parsePlannedInput(input: string): bigint {
  const trimmed = input.trim();
  const normalized = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (normalized === "" || normalized === "-" || normalized === "+") {
    throw new MoneyParseError("Enter a peso amount with at most two decimal places.");
  }
  const centavos = pesosToCentavos(normalized);
  if (centavos < 0n) {
    throw new BudgetError("Enter a planned amount of zero or more.");
  }
  return centavos;
}

/** Saved plan wins. A missing line falls back to the starter template. */
export function defaultPlannedCentavos(
  categoryName: string,
  savedCentavos: bigint | null,
): bigint {
  if (savedCentavos !== null) {
    return savedCentavos;
  }
  const starter = STARTER_CATEGORIES.find((category) => category.name === categoryName);
  if (
    starter &&
    isBudgetCategory(starter.reportTreatment) &&
    starter.monthlyCentavos !== null
  ) {
    return starter.monthlyCentavos;
  }
  return 0n;
}

export function resolvedPlannedCentavos(input: {
  amountMode: string;
  plannedCentavos: bigint | null;
  percentBps: bigint | null;
  baseCentavos?: bigint;
}): bigint | null {
  if (input.amountMode === "fixed") {
    return input.plannedCentavos;
  }
  if (input.amountMode === "percent" && input.percentBps !== null) {
    return percentOfBase(input.percentBps, input.baseCentavos ?? ALLOCATION_BASE_CENTAVOS);
  }
  return null;
}

export function spendingTotals(
  splits: readonly { categoryId: string; amountCentavos: bigint }[],
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const split of splits) {
    totals.set(split.categoryId, (totals.get(split.categoryId) ?? 0n) + split.amountCentavos);
  }
  return totals;
}

export function budgetLineStatus(
  plannedCentavos: bigint,
  spentCentavos: bigint,
): BudgetLineStatus {
  const remainingCentavos = subtractCentavos(plannedCentavos, spentCentavos);
  return {
    remainingCentavos,
    overByCentavos: remainingCentavos < 0n ? -remainingCentavos : 0n,
  };
}

export function planFit(
  plannedCentavos: readonly bigint[],
  baseCentavos: bigint = ALLOCATION_BASE_CENTAVOS,
): PlanFit {
  const planned = sumCentavos(plannedCentavos);
  return {
    plannedCentavos: planned,
    unallocatedCentavos: unallocatedCentavos(baseCentavos, planned),
  };
}

export function planFitMessage(unallocatedCentavos: bigint, baseCentavos: bigint): string {
  const base = formatCentavos(baseCentavos);
  if (unallocatedCentavos === 0n) {
    return `This plan uses the full ${base}.`;
  }
  if (unallocatedCentavos > 0n) {
    return `${formatCentavos(unallocatedCentavos)} is not assigned yet.`;
  }
  return `This plan is ${formatCentavos(-unallocatedCentavos)} over ${base}.`;
}

export function budgetPlanPosting(
  categoryIds: readonly string[],
  amounts: ReadonlyMap<string, bigint>,
): BudgetPlanLine[] {
  if (categoryIds.length === 0) {
    throw new BudgetError("Enter an amount for every category.");
  }

  const seen = new Set<string>();
  const lines: BudgetPlanLine[] = [];
  for (const categoryId of categoryIds) {
    if (seen.has(categoryId)) {
      throw new BudgetError("Enter an amount for every category.");
    }
    seen.add(categoryId);
    const plannedCentavos = amounts.get(categoryId);
    if (plannedCentavos === undefined) {
      throw new BudgetError("Enter an amount for every category.");
    }
    if (plannedCentavos < 0n) {
      throw new BudgetError("Enter a planned amount of zero or more.");
    }
    lines.push({ categoryId, plannedCentavos });
  }
  return lines;
}
