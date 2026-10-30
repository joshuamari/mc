import type { AssetAccountKind } from "@/lib/accounts";
import { sumCentavos } from "@/lib/money";
import type { MovementEntry } from "@/lib/transactions";

export const GOAL_KINDS = ["emergency", "savings", "investment", "custom"] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  emergency: "Emergency fund",
  savings: "Savings",
  investment: "Investment",
  custom: "Other",
};

export const CONTRIBUTION_OWNERS = ["self", "partner"] as const;

export type ContributionOwner = (typeof CONTRIBUTION_OWNERS)[number];

export const CONTRIBUTION_OWNER_LABELS: Record<ContributionOwner, string> = {
  self: "Yours",
  partner: "Partner",
};

export const GOAL_DIRECTIONS = ["deposit", "withdrawal"] as const;

export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];

export class SavingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavingsError";
  }
}

export function isGoalKind(value: string): value is GoalKind {
  return (GOAL_KINDS as readonly string[]).includes(value);
}

/** An emergency fund belongs to you. Other goals can split yours and your partner's. */
export function isPersonalGoal(kind: string, name: string): boolean {
  return kind === "emergency" || name.toLowerCase().includes("emergency");
}

export function isContributionOwner(value: string): value is ContributionOwner {
  return (CONTRIBUTION_OWNERS as readonly string[]).includes(value);
}

export function isGoalDirection(value: string): value is GoalDirection {
  return (GOAL_DIRECTIONS as readonly string[]).includes(value);
}

/** Account types a goal of this kind can be tied to. */
export function accountsForGoalKind(kind: GoalKind): readonly AssetAccountKind[] {
  if (kind === "emergency") {
    return ["emergency"];
  }
  if (kind === "savings") {
    return ["savings"];
  }
  if (kind === "investment") {
    return ["investment"];
  }
  return ["savings", "emergency", "investment"];
}

export type GoalTransferPosting = {
  entries: MovementEntry[];
};

/**
 * A deposit moves money into the linked balance. A withdrawal moves it back
 * out. The amount argument is a positive magnitude.
 */
export function goalTransferPosting(input: {
  direction: GoalDirection;
  amountCentavos: bigint;
  linkedAccountId: string;
  otherAccountId: string;
}): GoalTransferPosting {
  if (input.amountCentavos <= 0n) {
    throw new SavingsError("Enter an amount greater than zero.");
  }
  if (
    input.linkedAccountId.length === 0 ||
    input.otherAccountId.length === 0 ||
    input.linkedAccountId === input.otherAccountId
  ) {
    throw new SavingsError("Choose the cash or bank balance.");
  }

  const intoGoal = input.direction === "deposit";
  return {
    entries: [
      {
        accountId: input.otherAccountId,
        amountCentavos: intoGoal ? -input.amountCentavos : input.amountCentavos,
      },
      {
        accountId: input.linkedAccountId,
        amountCentavos: intoGoal ? input.amountCentavos : -input.amountCentavos,
      },
    ],
  };
}

export const SAVINGS_DIRECTION_LABELS: Record<GoalDirection, string> = {
  deposit: "Put in",
  withdrawal: "Took out",
};

export type SavingsRecord = {
  owner: ContributionOwner;
  direction: GoalDirection;
  amountCentavos: bigint;
  goalId: string | null;
};

/** Put-in amounts add. Took-out amounts subtract. Optional filters keep one person or one goal. */
export function recordedSavingsCentavos(
  records: readonly SavingsRecord[],
  filter?: { owner?: ContributionOwner; goalId?: string | null },
): bigint {
  return sumCentavos(
    records.flatMap((record) => {
      if (filter?.owner && record.owner !== filter.owner) {
        return [];
      }
      if (filter?.goalId !== undefined && record.goalId !== filter.goalId) {
        return [];
      }
      const signed =
        record.direction === "withdrawal" ? -record.amountCentavos : record.amountCentavos;
      return [signed];
    }),
  );
}

export type AttributedMovement = {
  owner: ContributionOwner;
  amountCentavos: bigint;
  voided: boolean;
};

/** Signed effect on the linked balance. Deposits add. Withdrawals subtract. */
export function attributedCentavos(
  movements: readonly AttributedMovement[],
  owner?: ContributionOwner,
): bigint {
  return sumCentavos(
    movements.flatMap((movement) =>
      !movement.voided && (owner === undefined || movement.owner === owner)
        ? [movement.amountCentavos]
        : [],
    ),
  );
}
