import { BACKUP_TABLES, backupDocument, backupFilename, serializeBackup } from "@/lib/backup";

describe("json backup", () => {
  it("names the file from the Manila date and keeps every ledger table", () => {
    expect(backupFilename("2026-10-27")).toBe("mannycat-2026-10-27.json");
    const names = BACKUP_TABLES.map((table) => table.name);
    expect(names).toContain("transactions");
    expect(names).toContain("transaction_entries");
    expect(names).toContain("goals");
    expect(names).toContain("card_statements");
    expect(names).toContain("audit_events");
    expect(BACKUP_TABLES.find((table) => table.name === "credit_card_terms")?.orderColumn).toBe(
      "account_id",
    );
  });

  it("writes centavos as decimal strings", () => {
    const json = serializeBackup(
      backupDocument({
        exportedOn: "2026-10-27",
        accountEmail: "person@example.com",
        tables: {
          transaction_entries: [{ amount_centavos: 47_000_00n }],
        },
      }),
    );
    const parsed = JSON.parse(json) as {
      money: string;
      timezone: string;
      tables: { transaction_entries: { amount_centavos: string }[] };
    };
    expect(parsed.money).toBe("centavos");
    expect(parsed.timezone).toBe("Asia/Manila");
    expect(parsed.tables.transaction_entries[0]?.amount_centavos).toBe("4700000");
  });
});
