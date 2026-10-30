import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027020000_payday.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("payday migration", () => {
  it("stores two cutoffs for the signed-in user's open budget month", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("Save the monthly budget first.");
    expect(sql).toContain("This month is closed.");
    expect(sql).toContain("t.type = 'income'");
    expect(sql).toContain("when 'housing' then 'bill'");
    expect(sql).toContain("when 'savings' then 'savings'");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("credit_card");
    expect(sql).not.toContain("card_payment");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.save_pay_cutoffs(date, jsonb, jsonb) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.save_pay_cutoffs(date, jsonb, jsonb) to authenticated",
    );
  });
});
