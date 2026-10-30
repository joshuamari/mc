import {
  CardError,
  assertStatementDates,
  availableCredit,
  cardActivityAmount,
  cardActivityPosting,
  cardDebtCentavos,
  debtAsOf,
  formatLast4,
  freshReconciliationStatus,
  isDayOfMonth,
  normalizeLast4,
  openingDebtEntry,
  overLimitBy,
  statementDifference,
} from "@/lib/cards";

describe("credit card debt", () => {
  it("treats a positive entry as debt and ignores a voided entry", () => {
    expect(
      cardDebtCentavos([
        { amountCentavos: 100_00n, voided: false },
        { amountCentavos: -40_00n, voided: false },
        { amountCentavos: 25_00n, voided: true },
      ]),
    ).toBe(60_00n);
  });

  it("posts opening debt as a positive entry and rejects a negative amount", () => {
    expect(openingDebtEntry(0n)).toBeNull();
    expect(openingDebtEntry(1_500_00n)).toBe(1_500_00n);
    expect(() => openingDebtEntry(-1n)).toThrow(CardError);
  });

  it("compares debt with the limit", () => {
    expect(availableCredit(20_000_00n, 5_000_00n)).toBe(15_000_00n);
    expect(availableCredit(0n, 5_000_00n)).toBeNull();
    expect(overLimitBy(10_000_00n, 12_000_00n)).toBe(2_000_00n);
    expect(overLimitBy(0n, 12_000_00n)).toBe(0n);
    expect(overLimitBy(10_000_00n, 4_000_00n)).toBe(0n);
  });
});

describe("card details", () => {
  it("accepts a blank last 4 and four digits", () => {
    expect(normalizeLast4("")).toBeNull();
    expect(normalizeLast4(" 1234 ")).toBe("1234");
    expect(formatLast4("1234")).toBe("•••• 1234");
    expect(formatLast4(null)).toBeNull();
    expect(() => normalizeLast4("123")).toThrow(CardError);
    expect(() => normalizeLast4("12ab")).toThrow(CardError);
    expect(isDayOfMonth(1)).toBe(true);
    expect(isDayOfMonth(31)).toBe(true);
    expect(isDayOfMonth(0)).toBe(false);
    expect(isDayOfMonth(1.5)).toBe(false);
  });
});

describe("card activity posting", () => {
  it("increases card debt and keeps the category split positive", () => {
    expect(
      cardActivityPosting({
        type: "purchase",
        amountCentavos: 250_00n,
        cardAccountId: "card",
        categoryId: "groceries",
      }),
    ).toEqual({
      entries: [{ accountId: "card", amountCentavos: 250_00n }],
      split: { categoryId: "groceries", amountCentavos: 250_00n },
    });
    expect(() =>
      cardActivityPosting({
        type: "purchase",
        amountCentavos: 250_00n,
        cardAccountId: "card",
        fromAccountId: "wallet",
        categoryId: "groceries",
      }),
    ).toThrow("A purchase does not leave a balance.");
  });

  it("reduces the paying balance and the debt without a category", () => {
    const posting = cardActivityPosting({
      type: "payment",
      amountCentavos: 1_000_00n,
      cardAccountId: "card",
      fromAccountId: "wallet",
    });
    expect(posting.split).toBeNull();
    expect(posting.entries).toEqual([
      { accountId: "wallet", amountCentavos: -1_000_00n },
      { accountId: "card", amountCentavos: -1_000_00n },
    ]);
    expect(cardActivityAmount(posting.entries)).toBe(1_000_00n);
    expect(() =>
      cardActivityPosting({
        type: "payment",
        amountCentavos: 1_000_00n,
        cardAccountId: "card",
        fromAccountId: "wallet",
        categoryId: "groceries",
      }),
    ).toThrow("A payment does not use a category.");
  });
});

describe("statement reconciliation", () => {
  it("counts debt through the close date and ignores later or voided entries", () => {
    const entries = [
      { occurredOn: "2026-10-01", amountCentavos: 100_00n, voided: false },
      { occurredOn: "2026-10-05", amountCentavos: 25_00n, voided: true },
      { occurredOn: "2026-10-20", amountCentavos: 50_00n, voided: false },
    ];
    expect(debtAsOf(entries, "2026-10-15")).toBe(100_00n);
    expect(debtAsOf(entries, "2026-10-20")).toBe(150_00n);
  });

  it("matches when the statement balance equals the recorded debt", () => {
    expect(statementDifference(100_00n, 100_00n)).toBe(0n);
    expect(statementDifference(180_00n, 100_00n)).toBe(80_00n);
    expect(freshReconciliationStatus(0n)).toBe("matched");
    expect(freshReconciliationStatus(80_00n)).toBe("open");
    expect(() => assertStatementDates("2026-10-16", "2026-10-01", "2026-11-05")).toThrow(
      "The statement must start on or before the day it closes.",
    );
    assertStatementDates("2026-10-01", "2026-10-15", "2026-11-05");
  });
});
