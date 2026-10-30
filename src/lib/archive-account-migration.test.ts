import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027060000_archive_account.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("archive account migration", () => {
  it("hides a starting balance for the signed-in user and voids its opening amount", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("t.type <> 'opening_balance'");
    expect(sql).toContain("set voided_at = now()");
    expect(sql).toContain("set archived_at = now()");
    expect(sql).toContain("This balance has other activity.");
    expect(sql).not.toContain("p_user_id");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.archive_asset_account(uuid) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.archive_asset_account(uuid) to authenticated",
    );
  });
});
