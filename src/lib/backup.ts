export const BACKUP_TABLES = [
  { name: "profiles", ownerColumn: "id", orderColumn: "id" },
  { name: "accounts", ownerColumn: "user_id", orderColumn: "id" },
  { name: "credit_card_terms", ownerColumn: "user_id", orderColumn: "account_id" },
  { name: "categories", ownerColumn: "user_id", orderColumn: "id" },
  { name: "goals", ownerColumn: "user_id", orderColumn: "id" },
  { name: "savings_entries", ownerColumn: "user_id", orderColumn: "id" },
  { name: "budget_months", ownerColumn: "user_id", orderColumn: "id" },
  { name: "budget_lines", ownerColumn: "user_id", orderColumn: "id" },
  { name: "pay_periods", ownerColumn: "user_id", orderColumn: "id" },
  { name: "planned_items", ownerColumn: "user_id", orderColumn: "id" },
  { name: "bill_templates", ownerColumn: "user_id", orderColumn: "id" },
  { name: "transactions", ownerColumn: "user_id", orderColumn: "id" },
  { name: "transaction_entries", ownerColumn: "user_id", orderColumn: "id" },
  { name: "transaction_splits", ownerColumn: "user_id", orderColumn: "id" },
  { name: "card_statements", ownerColumn: "user_id", orderColumn: "id" },
  { name: "reconciliations", ownerColumn: "user_id", orderColumn: "id" },
  { name: "audit_events", ownerColumn: "user_id", orderColumn: "id" },
] as const;

export type BackupDocument = {
  app: "MannyCat";
  exportedOn: string;
  timezone: "Asia/Manila";
  money: "centavos";
  accountEmail: string;
  tables: Record<string, unknown[]>;
};

export function backupFilename(exportedOn: string): string {
  return `mannycat-${exportedOn}.json`;
}

export function backupDocument(input: {
  exportedOn: string;
  accountEmail: string;
  tables: Record<string, unknown[]>;
}): BackupDocument {
  return {
    app: "MannyCat",
    exportedOn: input.exportedOn,
    timezone: "Asia/Manila",
    money: "centavos",
    accountEmail: input.accountEmail,
    tables: input.tables,
  };
}

export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(
    document,
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}
