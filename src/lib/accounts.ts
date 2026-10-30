import { sumCentavos } from "@/lib/money";

export const ASSET_ACCOUNT_KINDS = [
  "cash",
  "bank",
  "savings",
  "emergency",
  "investment",
] as const;

export type AssetAccountKind = (typeof ASSET_ACCOUNT_KINDS)[number];

export const ASSET_ACCOUNT_LABELS: Record<AssetAccountKind, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
  emergency: "Emergency fund",
  investment: "Investment",
};

export function isAssetAccountKind(value: string): value is AssetAccountKind {
  return (ASSET_ACCOUNT_KINDS as readonly string[]).includes(value);
}

/** Sum of balances that share a type. Kinds with no accounts are omitted. */
export function totalsByKind(
  accounts: readonly { kind: string; balanceCentavos: bigint }[],
): { kind: AssetAccountKind; totalCentavos: bigint; count: number }[] {
  return ASSET_ACCOUNT_KINDS.flatMap((kind) => {
    const rows = accounts.filter((account) => account.kind === kind);
    if (rows.length === 0) {
      return [];
    }
    return [
      {
        kind,
        count: rows.length,
        totalCentavos: sumCentavos(rows.map((account) => account.balanceCentavos)),
      },
    ];
  });
}

export type LedgerEntry = {
  amountCentavos: bigint;
  voided: boolean;
};

/**
 * One signed opening entry. Positive centavos increase an asset.
 * Zero is not an entry, because the ledger rejects a zero amount.
 */
export function openingBalanceEntry(amountCentavos: bigint): bigint | null {
  if (amountCentavos === 0n) {
    return null;
  }
  return amountCentavos;
}

/** Sum of entries on transactions that have not been voided. */
export function accountBalanceCentavos(entries: readonly LedgerEntry[]): bigint {
  return sumCentavos(
    entries.flatMap((entry) => (entry.voided ? [] : [entry.amountCentavos])),
  );
}

/** Calendar date in Asia/Manila, as YYYY-MM-DD. */
export function manilaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
