import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261028010000_payday_split.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("payday split migration", () => {
  it("stores each cutoff's share of a monthly amount", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("cutoff_1_centavos");
    expect(sql).toContain("cutoff_2_centavos");
    expect(sql).toContain("The two amounts must add up to the monthly amount.");
    expect(sql).toContain("first_amount + second_amount <> item_amount");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("credit_card");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.save_pay_cutoff_shares(date, jsonb, jsonb) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.save_pay_cutoff_shares(date, jsonb, jsonb) to authenticated",
    );
  });
});