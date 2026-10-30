import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027010000_budget.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("budget migration", () => {
  it("saves one open month for the signed-in user", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("4700000");
    expect(sql).toContain("'fixed'");
    expect(sql).toContain("report_treatment in ('consumption', 'savings_allocation')");
    expect(sql).toContain("This month is closed.");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("'income'");
    expect(sql).not.toContain("credit_card");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.save_budget_month(date, jsonb) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.save_budget_month(date, jsonb) to authenticated",
    );
  });
});
