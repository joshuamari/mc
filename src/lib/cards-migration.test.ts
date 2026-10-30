import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027030000_cards.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("cards migration", () => {
  it("creates a card and posts a purchase or payment for the signed-in user", () => {
    expect(lowered).toContain("security definer");
    expect(sql).toContain("actor uuid := auth.uid()");
    expect(sql).toContain("'credit_card'");
    expect(sql).toContain("'credit_card_purchase'");
    expect(sql).toContain("'credit_card_payment'");
    expect(sql).toContain("p_amount_centavos");
    expect(sql).toContain("-p_amount_centavos");
    expect(sql).toContain("report_treatment = 'consumption'");
    expect(sql).toContain("A payment does not use a category.");
    expect(sql).toContain("card_count >= 2");
    expect(sql).toContain("last4");
    expect(sql).not.toContain("p_user_id");
    expect(sql).not.toContain("credit_card_refund");
    expect(sql).not.toContain("credit_card_fee");
  });

  it("keeps direct browser writes revoked", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for update");
    expect(lowered).not.toContain("for delete");
    expect(lowered).not.toMatch(/grant\s+(insert|update|delete)/);
    expect(lowered).toContain(
      "revoke all on function public.create_credit_card(text, bigint, smallint, smallint, text, bigint, date, uuid) from public, anon, authenticated",
    );
    expect(lowered).toContain(
      "grant execute on function public.post_card_activity(public.transaction_type, text, bigint, date, uuid, uuid, uuid, uuid) to authenticated",
    );
  });
});
