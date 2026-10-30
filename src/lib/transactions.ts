export const MOVEMENT_TYPES = ["income", "expense", "transfer"] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  income: "Income",
  expense: "Spending",
  transfer: "Transfer",
};

export class MovementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MovementError";
  }
}

export type MovementEntry = {
  accountId: string;
  amountCentavos: bigint;
};

export type MovementSplit = {
  categoryId: string;
  amountCentavos: bigint;
};

export type CashMovement = {
  type: MovementType;
  amountCentavos: bigint;
  fromAccountId?: string;
  toAccountId?: string;
  categoryId?: string;
};

export type CashMovementPosting = {
  entries: MovementEntry[];
  split: MovementSplit | null;
};

/**
 * Signed ledger effect of one cash movement.
 * The amount argument is a positive magnitude. The account entry is positive
 * when that asset increases. A category split stays positive for both income
 * and spending. A transfer moves the same amount between two balances and has
 * no category.
 */
export function cashMovementPosting(movement: CashMovement): CashMovementPosting {
  if (movement.amountCentavos <= 0n) {
    throw new MovementError("Enter an amount greater than zero.");
  }

  if (movement.type === "income") {
    if (movement.fromAccountId) {
      throw new MovementError("Income lands in one balance.");
    }
    if (!movement.toAccountId) {
      throw new MovementError("Choose the balance this money landed in.");
    }
    if (!movement.categoryId) {
      throw new MovementError("Choose an income category.");
    }
    return {
      entries: [
        {
          accountId: movement.toAccountId,
          amountCentavos: movement.amountCentavos,
        },
      ],
      split: {
        categoryId: movement.categoryId,
        amountCentavos: movement.amountCentavos,
      },
    };
  }

  if (movement.type === "expense") {
    if (movement.toAccountId) {
      throw new MovementError("Spending leaves one balance.");
    }
    if (!movement.fromAccountId) {
      throw new MovementError("Choose the balance this money left.");
    }
    if (!movement.categoryId) {
      throw new MovementError("Choose a spending category.");
    }
    return {
      entries: [
        {
          accountId: movement.fromAccountId,
          amountCentavos: -movement.amountCentavos,
        },
      ],
      split: {
        categoryId: movement.categoryId,
        amountCentavos: movement.amountCentavos,
      },
    };
  }

  if (movement.categoryId) {
    throw new MovementError("A transfer does not use a category.");
  }
  if (
    !movement.fromAccountId ||
    !movement.toAccountId ||
    movement.fromAccountId === movement.toAccountId
  ) {
    throw new MovementError("Choose two different balances.");
  }

  return {
    entries: [
      {
        accountId: movement.fromAccountId,
        amountCentavos: -movement.amountCentavos,
      },
      {
        accountId: movement.toAccountId,
        amountCentavos: movement.amountCentavos,
      },
    ],
    split: null,
  };
}

export function isMovementType(value: string): value is MovementType {
  return (MOVEMENT_TYPES as readonly string[]).includes(value);
}

/** Positive magnitude shown on the transaction list. */
export function movementAmount(
  type: MovementType,
  entries: readonly MovementEntry[],
): bigint {
  if (type === "expense") {
    const spent = entries.find((entry) => entry.amountCentavos < 0n);
    return spent ? -spent.amountCentavos : 0n;
  }
  const received = entries.find((entry) => entry.amountCentavos > 0n);
  return received ? received.amountCentavos : 0n;
}

export function movementDirection(
  type: MovementType,
  entries: readonly MovementEntry[],
  accountNames: ReadonlyMap<string, string>,
): string {
  const source = entries.find((entry) => entry.amountCentavos < 0n);
  const destination = entries.find((entry) => entry.amountCentavos > 0n);
  const sourceName = accountNames.get(source?.accountId ?? "") ?? "a balance";
  const destinationName =
    accountNames.get(destination?.accountId ?? "") ?? "a balance";

  if (type === "income") {
    return `Into ${destinationName}`;
  }
  if (type === "expense") {
    return `From ${sourceName}`;
  }
  return `${sourceName} → ${destinationName}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Calendar date stored as YYYY-MM-DD, shown without shifting the day. */
export function formatIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  const label = MONTHS[month - 1];
  if (!label || day < 1 || day > 31) {
    return isoDate;
  }
  return `${day} ${label} ${match[1]}`;
}
