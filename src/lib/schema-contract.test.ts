import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STARTER_CATEGORIES } from "@/lib/starter-budget";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261026000000_foundation.sql",
);

const sql = readFileSync(migrationPath, "utf8");
const lowered = sql.toLowerCase();

describe("foundation migration", () => {
  it("enables row level security on every table", () => {
    const tables = [
      ...sql.matchAll(/create table public\.(\w+)/g),
    ].map((match) => match[1]);

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect(lowered).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("does not grant browser writes to the ledger", () => {
    expect(lowered).not.toContain("for insert");
    expect(lowered).not.toContain("for delete");
    expect(lowered.match(/for update/g)).toHaveLength(1);
    expect(lowered).toContain(
      "revoke all on all tables in schema public from anon, authenticated",
    );
  });

  it("seeds the same category names as the app template", () => {
    for (const category of STARTER_CATEGORIES) {
      expect(sql).toContain(`'${category.name}'`);
    }
  });

  it("stores money as centavos and omits card secrets", () => {
    expect(lowered).toContain("amount_centavos");
    expect(lowered).not.toContain("cvv");
    expect(lowered).not.toContain("card_number");
    expect(lowered).not.toContain("password");
  });
});
