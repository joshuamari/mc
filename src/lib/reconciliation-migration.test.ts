import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027040000_reconciliation.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("reconciliation migration", () => {
  it("compares the printed statement with recorded debt for the signed-in user", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("a.kind = 'credit_card'");
    expect(sql).toContain("t.occurred_on <= p_period_end");
    expect(sql).toContain("t.voided_at is null");
    expect(sql).toContain("p_statement_balance_centavos - calculated");
    expect(sql).toContain("'matched'");
    expect(sql).toContain("'open'");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("'stale'");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.save_card_statement(uuid, date, date, date, bigint, bigint) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.save_card_statement(uuid, date, date, date, bigint, bigint) to authenticated",
    );
  });
});
