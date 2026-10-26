export class MoneyParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyParseError";
  }
}

/** ₱47,000.00 in centavos. Percent budgets use this base unless a month overrides it. */
export const ALLOCATION_BASE_CENTAVOS = 4_700_000n;

const PESO_AMOUNT = /^[+-]?(?:\d{1,12})(?:\.\d{1,2})?$/;

/**
 * Parse a peso amount into integer centavos.
 * Accepts an optional leading ₱ and at most two decimal places.
 */
export function pesosToCentavos(input: string): bigint {
  const trimmed = input.trim().replace(/^₱/, "");
  if (!PESO_AMOUNT.test(trimmed)) {
    throw new MoneyParseError(
      "Enter a peso amount with at most two decimal places.",
    );
  }

  const negative = trimmed.startsWith("-");
  const digits = trimmed.replace(/^[+-]/, "");
  const [whole, fraction = ""] = digits.split(".");
  const paddedFraction = `${fraction}00`.slice(0, 2);
  const centavos = BigInt(whole) * 100n + BigInt(paddedFraction);
  return negative ? -centavos : centavos;
}

/** Format centavos as Philippine pesos, for example -₱1,250.50. */
export function formatCentavos(amount: bigint): string {
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const whole = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const formatted = `₱${whole}.${fraction}`;
  return negative ? `-${formatted}` : formatted;
}

export function addCentavos(left: bigint, right: bigint): bigint {
  return left + right;
}

export function subtractCentavos(left: bigint, right: bigint): bigint {
  return left - right;
}

export function sumCentavos(amounts: readonly bigint[]): bigint {
  return amounts.reduce((total, amount) => total + amount, 0n);
}

/**
 * Percent of a peso base, in basis points (10_000 = 100%).
 * Half a centavo rounds away from zero.
 */
export function percentOfBase(
  percentBps: bigint,
  base: bigint = ALLOCATION_BASE_CENTAVOS,
): bigint {
  if (percentBps < 0n || base < 0n) {
    throw new RangeError("Percent and base must be zero or greater.");
  }
  return (base * percentBps + 5_000n) / 10_000n;
}

export function unallocatedCentavos(income: bigint, planned: bigint): bigint {
  return income - planned;
}

export function isOverBudget(actual: bigint, available: bigint): boolean {
  return actual > available;
}
