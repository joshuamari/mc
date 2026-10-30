import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027070000_savings_entries.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("savings entries migration", () => {
  it("records whose money it is without changing a balance", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("'deposit'");
    expect(sql).toContain("'withdrawal'");
    expect(sql).toContain("'partner'");
    expect(sql).toContain("'self'");
    expect(sql).toContain("A partner amount has no goal.");
    expect(sql).toContain("Choose a goal.");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("transaction_entries");
    expect(lowered).toContain("enable row level security");
    expect(lowered).toContain("grant select on table public.savings_entries to authenticated");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.record_savings_entry(text, public.contribution_owner, uuid, bigint, date, uuid) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.record_savings_entry(text, public.contribution_owner, uuid, bigint, date, uuid) to authenticated",
    );
  });
});