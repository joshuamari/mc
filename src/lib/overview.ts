import { sumCentavos } from "@/lib/money";

export type ReportGroup = "spending" | "card_payment" | "transfer";

/** Spending, card payments, and transfers stay in separate totals. */
export function reportGroup(type: string): ReportGroup | null {
  if (type === "expense" || type === "credit_card_purchase") {
    return "spending";
  }
  if (type === "credit_card_payment") {
    return "card_payment";
  }
  if (type === "transfer") {
    return "transfer";
  }
  return null;
}

export function incomeCentavos(entries: readonly { amountCentavos: bigint }[]): bigint {
  return sumCentavos(
    entries.flatMap((entry) => (entry.amountCentavos > 0n ? [entry.amountCentavos] : [])),
  );
}

/** Category splits for cash spending and card purchases. */
export function spendingCentavos(splits: readonly { amountCentavos: bigint }[]): bigint {
  return sumCentavos(splits.map((split) => split.amountCentavos));
}

/** One payment amount. Both ledger entries are the same magnitude. */
export function paymentCentavos(entries: readonly { amountCentavos: bigint }[]): bigint {
  const first = entries[0];
  if (!first) {
    return 0n;
  }
  return first.amountCentavos < 0n ? -first.amountCentavos : first.amountCentavos;
}

/** Amount that moved between two balances. */
export function transferCentavos(entries: readonly { amountCentavos: bigint }[]): bigint {
  const received = entries.find((entry) => entry.amountCentavos > 0n);
  return received ? received.amountCentavos : 0n;
}

export function cashOnHandCentavos(
  accounts: readonly { kind: string; balanceCentavos: bigint }[],
): bigint {
  return sumCentavos(
    accounts.flatMap((account) =>
      account.kind === "cash" || account.kind === "bank" ? [account.balanceCentavos] : [],
    ),
  );
}

export function cardDebtCentavos(
  accounts: readonly { kind: string; balanceCentavos: bigint }[],
): bigint {
  return sumCentavos(
    accounts.flatMap((account) =>
      account.kind === "credit_card" ? [account.balanceCentavos] : [],
    ),
  );
}
