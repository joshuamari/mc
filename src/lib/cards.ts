import { accountBalanceCentavos, isIsoDate, type LedgerEntry } from "@/lib/accounts";
import { subtractCentavos, sumCentavos } from "@/lib/money";
import { type MovementEntry, type MovementSplit } from "@/lib/transactions";

export class CardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardError";
  }
}

export const MAX_CREDIT_CARDS = 2;

export const CARD_ACTIVITIES = ["purchase", "payment"] as const;

export type CardActivity = (typeof CARD_ACTIVITIES)[number];

export const CARD_ACTIVITY_LABELS: Record<CardActivity, string> = {
  purchase: "Purchase",
  payment: "Payment",
};

export type CardActivityPosting = {
  entries: MovementEntry[];
  split: MovementSplit | null;
};

/** Positive centavos are debt. A voided entry is ignored. */
export function cardDebtCentavos(entries: readonly LedgerEntry[]): bigint {
  return accountBalanceCentavos(entries);
}

/**
 * Opening debt is a positive card entry. Zero posts no entry.
 * A negative amount is not a starting balance.
 */
export function openingDebtEntry(amountCentavos: bigint): bigint | null {
  if (amountCentavos < 0n) {
    throw new CardError("Enter the amount you already owe, or zero.");
  }
  if (amountCentavos === 0n) {
    return null;
  }
  return amountCentavos;
}

export function isDayOfMonth(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

/** Blank is allowed. Any other value must be four digits. */
export function normalizeLast4(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d{4}$/.test(trimmed)) {
    throw new CardError("Enter the last 4 digits, or leave them blank.");
  }
  return trimmed;
}

export function formatLast4(last4: string | null): string | null {
  if (!last4) {
    return null;
  }
  return `•••• ${last4}`;
}

/** Negative when the debt is above a positive limit. A zero limit is not tracked. */
export function availableCredit(limitCentavos: bigint, debtCentavos: bigint): bigint | null {
  if (limitCentavos < 0n) {
    throw new CardError("Enter a credit limit of zero or more.");
  }
  if (limitCentavos === 0n) {
    return null;
  }
  return subtractCentavos(limitCentavos, debtCentavos);
}

export function overLimitBy(limitCentavos: bigint, debtCentavos: bigint): bigint {
  const available = availableCredit(limitCentavos, debtCentavos);
  if (available === null || available >= 0n) {
    return 0n;
  }
  return -available;
}

export function isCardActivity(value: string): value is CardActivity {
  return (CARD_ACTIVITIES as readonly string[]).includes(value);
}

/**
 * Signed ledger effect of one card purchase or payment.
 * The amount is a positive magnitude. A card entry is positive when debt
 * increases. A purchase split stays positive. A payment has no category.
 */
export function cardActivityPosting(activity: {
  type: CardActivity;
  amountCentavos: bigint;
  cardAccountId: string;
  fromAccountId?: string;
  categoryId?: string;
}): CardActivityPosting {
  if (activity.amountCentavos <= 0n) {
    throw new CardError("Enter an amount greater than zero.");
  }
  if (!activity.cardAccountId) {
    throw new CardError("Choose a card.");
  }

  if (activity.type === "purchase") {
    if (activity.fromAccountId) {
      throw new CardError("A purchase does not leave a balance.");
    }
    if (!activity.categoryId) {
      throw new CardError("Choose a spending category.");
    }
    return {
      entries: [
        {
          accountId: activity.cardAccountId,
          amountCentavos: activity.amountCentavos,
        },
      ],
      split: {
        categoryId: activity.categoryId,
        amountCentavos: activity.amountCentavos,
      },
    };
  }

  if (activity.categoryId) {
    throw new CardError("A payment does not use a category.");
  }
  if (!activity.fromAccountId || activity.fromAccountId === activity.cardAccountId) {
    throw new CardError("Choose the balance that pays this card.");
  }
  return {
    entries: [
      {
        accountId: activity.fromAccountId,
        amountCentavos: -activity.amountCentavos,
      },
      {
        accountId: activity.cardAccountId,
        amountCentavos: -activity.amountCentavos,
      },
    ],
    split: null,
  };
}

export type DatedLedgerEntry = {
  occurredOn: string;
  amountCentavos: bigint;
  voided: boolean;
};

/** Debt from entries on or before the statement close date. Later activity is excluded. */
export function debtAsOf(entries: readonly DatedLedgerEntry[], asOf: string): bigint {
  return sumCentavos(
    entries.flatMap((entry) =>
      !entry.voided && entry.occurredOn <= asOf ? [entry.amountCentavos] : [],
    ),
  );
}

export function statementDifference(
  statementCentavos: bigint,
  calculatedCentavos: bigint,
): bigint {
  return subtractCentavos(statementCentavos, calculatedCentavos);
}

export function freshReconciliationStatus(
  differenceCentavos: bigint,
): "open" | "matched" {
  return differenceCentavos === 0n ? "matched" : "open";
}

export function assertStatementDates(start: string, end: string, due: string): void {
  if (!isIsoDate(start) || !isIsoDate(end) || !isIsoDate(due)) {
    throw new CardError("Enter the statement dates.");
  }
  if (start > end) {
    throw new CardError("The statement must start on or before the day it closes.");
  }
}

/** Positive magnitude shown on the card activity list. */
export function cardActivityAmount(entries: readonly MovementEntry[]): bigint {
  const first = entries[0];
  if (!first) {
    return 0n;
  }
  return first.amountCentavos < 0n ? -first.amountCentavos : first.amountCentavos;
}
