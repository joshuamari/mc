import { isIsoDate } from "@/lib/accounts";
import { isMonthStart } from "@/lib/budget";
import { subtractCentavos, sumCentavos } from "@/lib/money";

export class PaydayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaydayError";
  }
}

export type CutoffSequence = 1 | 2;

export type CutoffInput = {
  sequence: CutoffSequence;
  periodStart: string;
  periodEnd: string;
  expectedPayDate: string;
};

export type CutoffShare = {
  categoryId: string;
  firstCentavos: bigint;
  secondCentavos: bigint;
};

export type CutoffAmounts = {
  firstCentavos: bigint;
  secondCentavos: bigint;
};

/** Last calendar day of a month that starts on YYYY-MM-01. */
export function monthEnd(month: string): string {
  if (!isMonthStart(month)) {
    throw new PaydayError("Choose a month.");
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, monthNumber, 0));
  const day = String(last.getUTCDate()).padStart(2, "0");
  return `${month.slice(0, 8)}${day}`;
}

export function dateInMonth(value: string, month: string): boolean {
  if (!isIsoDate(value) || !isMonthStart(month)) {
    return false;
  }
  return value >= month && value <= monthEnd(month);
}

/** The cutoff whose pay date is still ahead. If both have passed, the later one. */
export function nextCutoff(cutoffs: readonly CutoffInput[], today: string): CutoffInput {
  const ordered = [...cutoffs].sort((left, right) =>
    left.expectedPayDate.localeCompare(right.expectedPayDate),
  );
  return ordered.find((cutoff) => cutoff.expectedPayDate >= today) ?? ordered[ordered.length - 1];
}

/** 1st–15th and 16th–month end. The pay date is the last day of each cutoff. */
export function defaultCutoffs(month: string): [CutoffInput, CutoffInput] {
  const end = monthEnd(month);
  const prefix = month.slice(0, 8);
  return [
    {
      sequence: 1,
      periodStart: month,
      periodEnd: `${prefix}15`,
      expectedPayDate: `${prefix}15`,
    },
    {
      sequence: 2,
      periodStart: `${prefix}16`,
      periodEnd: end,
      expectedPayDate: end,
    },
  ];
}

/** Rent and utility bills default to the first cutoff. Other budget items default to the second. */
export function defaultCutoffSequence(categoryGroup: string): CutoffSequence {
  if (categoryGroup === "housing" || categoryGroup === "utilities") {
    return 1;
  }
  return 2;
}

/** A peso amount for an input. Whole pesos stay whole. */
export function pesoInputFromCentavos(amount: bigint): string {
  if (amount < 0n) {
    throw new PaydayError("The two amounts must add up to the monthly amount.");
  }
  const whole = amount / 100n;
  const fraction = amount % 100n;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}

/** The whole monthly amount sits on one cutoff until you divide it. */
export function defaultCutoffShares(amountCentavos: bigint, sequence: CutoffSequence): CutoffAmounts {
  if (amountCentavos < 0n) {
    throw new PaydayError("The two amounts must add up to the monthly amount.");
  }
  return sequence === 1
    ? { firstCentavos: amountCentavos, secondCentavos: 0n }
    : { firstCentavos: 0n, secondCentavos: amountCentavos };
}

/**
 * Keep a saved split when the two parts still add up to this month's amount.
 * A budget change falls back to the default cutoff.
 */
export function restoredCutoffShares(
  amountCentavos: bigint,
  savedFirst: bigint | null,
  savedSecond: bigint | null,
  fallbackSequence: CutoffSequence,
): CutoffAmounts {
  if (savedFirst !== null || savedSecond !== null) {
    const firstCentavos = savedFirst ?? 0n;
    const secondCentavos = savedSecond ?? 0n;
    if (
      firstCentavos >= 0n &&
      secondCentavos >= 0n &&
      firstCentavos + secondCentavos === amountCentavos
    ) {
      return { firstCentavos, secondCentavos };
    }
  }
  return defaultCutoffShares(amountCentavos, fallbackSequence);
}

export function occurredInPeriod(occurredOn: string, start: string, end: string): boolean {
  return (
    isIsoDate(occurredOn) &&
    isIsoDate(start) &&
    isIsoDate(end) &&
    start <= end &&
    occurredOn >= start &&
    occurredOn <= end
  );
}

/** Null when no paycheck has been recorded. Zero is not a paycheck. */
export function paycheckCentavos(amounts: readonly bigint[]): bigint | null {
  const received = amounts.filter((amount) => amount > 0n);
  if (received.length === 0) {
    return null;
  }
  return sumCentavos(received);
}

/** Null until a paycheck is recorded. Negative means the bills are larger than the paycheck. */
export function leftToSpend(paycheckCentavos: bigint | null, dueCentavos: bigint): bigint | null {
  if (paycheckCentavos === null) {
    return null;
  }
  return subtractCentavos(paycheckCentavos, dueCentavos);
}

export function isCutoffSequence(value: number): value is CutoffSequence {
  return value === 1 || value === 2;
}

export function paydayPlanPosting(
  month: string,
  cutoffs: readonly CutoffInput[],
  shares: ReadonlyMap<string, CutoffAmounts>,
  categories: readonly { categoryId: string; amountCentavos: bigint }[],
): { cutoffs: CutoffInput[]; assignments: CutoffShare[] } {
  if (!isMonthStart(month)) {
    throw new PaydayError("Choose a month.");
  }
  if (cutoffs.length !== 2) {
    throw new PaydayError("Choose two cutoffs.");
  }

  const bySequence = new Map<CutoffSequence, CutoffInput>();
  for (const cutoff of cutoffs) {
    if (!isCutoffSequence(cutoff.sequence) || bySequence.has(cutoff.sequence)) {
      throw new PaydayError("Choose two cutoffs.");
    }
    if (
      !dateInMonth(cutoff.periodStart, month) ||
      !dateInMonth(cutoff.periodEnd, month) ||
      !dateInMonth(cutoff.expectedPayDate, month) ||
      cutoff.periodStart > cutoff.periodEnd
    ) {
      throw new PaydayError("Enter dates inside this month.");
    }
    if (
      cutoff.expectedPayDate < cutoff.periodStart ||
      cutoff.expectedPayDate > cutoff.periodEnd
    ) {
      throw new PaydayError("Choose a pay date inside the cutoff.");
    }
    bySequence.set(cutoff.sequence, cutoff);
  }

  const first = bySequence.get(1);
  const second = bySequence.get(2);
  if (!first || !second) {
    throw new PaydayError("Choose two cutoffs.");
  }
  if (first.periodStart <= second.periodEnd && second.periodStart <= first.periodEnd) {
    throw new PaydayError("Cutoffs cannot share a day.");
  }

  if (categories.length === 0) {
    throw new PaydayError("Choose a cutoff for every category.");
  }
  const seen = new Set<string>();
  const posted: CutoffShare[] = [];
  for (const category of categories) {
    if (seen.has(category.categoryId) || category.amountCentavos < 0n) {
      throw new PaydayError("Choose a cutoff for every category.");
    }
    seen.add(category.categoryId);
    const share = shares.get(category.categoryId);
    if (
      !share ||
      share.firstCentavos < 0n ||
      share.secondCentavos < 0n ||
      share.firstCentavos + share.secondCentavos !== category.amountCentavos
    ) {
      throw new PaydayError("The two amounts must add up to the monthly amount.");
    }
    posted.push({
      categoryId: category.categoryId,
      firstCentavos: share.firstCentavos,
      secondCentavos: share.secondCentavos,
    });
  }

  return {
    cutoffs: [first, second],
    assignments: posted,
  };
}
