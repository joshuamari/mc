import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261026010000_accounts.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("accounts migration", () => {
  it("posts opening balances through a definer function that stamps the signed-in user", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("'opening_balance'");
    expect(lowered).toContain("amount_centavos");
    expect(sql).not.toContain("p_user_id");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.create_asset_account(text, public.account_kind, bigint, date, uuid) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.create_asset_account(text, public.account_kind, bigint, date, uuid) to authenticated",
    );
  });

  it("limits this phase to asset accounts", () => {
    expect(sql).toContain(
      "account_kind not in ('cash', 'bank', 'savings', 'emergency', 'investment')",
    );
  });
});
