import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261026020000_transactions.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("transactions migration", () => {
  it("posts income, spending, and transfers through a definer function", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("'income'");
    expect(sql).toContain("'expense'");
    expect(sql).toContain("'transfer'");
    expect(sql).toContain("-p_amount_centavos");
    expect(sql).toContain("p_amount_centavos <= 0");
    expect(sql).not.toContain("p_user_id");
  });

  it("keeps a spending split positive and gives a transfer no category", () => {
    expect(sql).toContain("report_treatment = 'income'");
    expect(sql).toContain("report_treatment = 'consumption'");
    expect(sql).toContain("A transfer does not use a category.");
    const expenseSplit = sql.slice(sql.indexOf("movement_type = 'expense'"));
    expect(expenseSplit).toContain("transaction_splits");
    expect(sql).not.toContain("'credit_card'");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain("revoke all on function public.post_cash_movement(");
    expect(lowered).toContain("grant execute on function public.post_cash_movement(");
    expect(lowered).toContain("to authenticated");
  });
});
