import {
  accountBalanceCentavos,
  isIsoDate,
  manilaDate,
  openingBalanceEntry,
  totalsByKind,
} from "@/lib/accounts";

describe("opening balances", () => {
  it("posts one positive entry when cash increases", () => {
    const entry = openingBalanceEntry(150_050n);
    expect(entry).toBe(150_050n);
    expect(
      accountBalanceCentavos([{ amountCentavos: entry ?? 0n, voided: false }]),
    ).toBe(150_050n);
  });

  it("posts one negative entry when the opening asset is already negative", () => {
    const entry = openingBalanceEntry(-500n);
    expect(entry).toBe(-500n);
    expect(
      accountBalanceCentavos([{ amountCentavos: entry ?? 0n, voided: false }]),
    ).toBe(-500n);
  });

  it("posts no entry for a zero opening balance", () => {
    expect(openingBalanceEntry(0n)).toBeNull();
    expect(accountBalanceCentavos([])).toBe(0n);
  });

  it("ignores a voided opening entry", () => {
    expect(
      accountBalanceCentavos([
        { amountCentavos: 10_000n, voided: true },
        { amountCentavos: 2_500n, voided: false },
      ]),
    ).toBe(2_500n);
  });
});

describe("balances of the same type", () => {
  it("totals cash rows together and leaves a single bank row untotaled", () => {
    const totals = totalsByKind([
      { kind: "cash", balanceCentavos: 100n },
      { kind: "cash", balanceCentavos: 46_700n },
      { kind: "bank", balanceCentavos: 34n },
      { kind: "bank", balanceCentavos: 82_088n },
      { kind: "savings", balanceCentavos: 7_194_445n },
    ]);
    expect(totals).toEqual([
      { kind: "cash", count: 2, totalCentavos: 46_800n },
      { kind: "bank", count: 2, totalCentavos: 82_122n },
      { kind: "savings", count: 1, totalCentavos: 7_194_445n },
    ]);
  });
});

describe("Manila dates", () => {
  it("uses the Asia/Manila calendar day", () => {
    expect(manilaDate(new Date("2026-10-25T16:30:00.000Z"))).toBe("2026-10-26");
    expect(manilaDate(new Date("2026-10-25T15:30:00.000Z"))).toBe("2026-10-25");
  });

  it("rejects dates that are not real calendar days", () => {
    expect(isIsoDate("2026-10-26")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("10/26/2026")).toBe(false);
  });
});
