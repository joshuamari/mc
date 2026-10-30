import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027050000_savings.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("savings migration", () => {
  it("records a goal and whose money moved for the signed-in user", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("contribution_owner");
    expect(sql).toContain("'self'");
    expect(sql).toContain("'partner'");
    expect(sql).toContain("'deposit'");
    expect(sql).toContain("'withdrawal'");
    expect(sql).toContain("'transfer'");
    expect(sql).toContain("goal_id");
    expect(sql).toContain("-p_amount_centavos");
    expect(sql).toContain("a.kind in ('cash', 'bank')");
    expect(sql).toContain("transactions_goal_owner_pair");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("p_category_id");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.create_savings_goal(text, public.goal_kind, bigint, date, uuid) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.post_goal_transfer(uuid, text, public.contribution_owner, text, bigint, date, uuid, uuid) to authenticated",
    );
  });
});
