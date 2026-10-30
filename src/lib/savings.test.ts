import {
  SavingsError,
  accountsForGoalKind,
  attributedCentavos,
  goalTransferPosting,
  isPersonalGoal,
  recordedSavingsCentavos,
} from "@/lib/savings";

const goal = "goal-account";
const bank = "bank-account";

describe("savings goals", () => {
  it("keeps an emergency fund personal and leaves other savings shared", () => {
    expect(isPersonalGoal("emergency", "Rainy day")).toBe(true);
    expect(isPersonalGoal("custom", "Emergency Fund")).toBe(true);
    expect(isPersonalGoal("savings", "Long-term savings")).toBe(false);
  });

  it("ties each goal type to a matching balance", () => {
    expect(accountsForGoalKind("emergency")).toEqual(["emergency"]);
    expect(accountsForGoalKind("savings")).toEqual(["savings"]);
    expect(accountsForGoalKind("investment")).toEqual(["investment"]);
    expect(accountsForGoalKind("custom")).toEqual(["savings", "emergency", "investment"]);
  });

  it("moves a deposit into the goal and a withdrawal back out", () => {
    expect(
      goalTransferPosting({
        direction: "deposit",
        amountCentavos: 500_00n,
        linkedAccountId: goal,
        otherAccountId: bank,
      }).entries,
    ).toEqual([
      { accountId: bank, amountCentavos: -500_00n },
      { accountId: goal, amountCentavos: 500_00n },
    ]);
    expect(
      goalTransferPosting({
        direction: "withdrawal",
        amountCentavos: 200_00n,
        linkedAccountId: goal,
        otherAccountId: bank,
      }).entries,
    ).toEqual([
      { accountId: bank, amountCentavos: 200_00n },
      { accountId: goal, amountCentavos: -200_00n },
    ]);
  });

  it("rejects a non-positive amount and a transfer into the same balance", () => {
    expect(() =>
      goalTransferPosting({
        direction: "deposit",
        amountCentavos: 0n,
        linkedAccountId: goal,
        otherAccountId: bank,
      }),
    ).toThrow(SavingsError);
    expect(() =>
      goalTransferPosting({
        direction: "deposit",
        amountCentavos: 100n,
        linkedAccountId: goal,
        otherAccountId: goal,
      }),
    ).toThrow("Choose the cash or bank balance.");
  });

  it("totals a separate savings record by person and by goal", () => {
    const records = [
      {
        owner: "self" as const,
        direction: "deposit" as const,
        amountCentavos: 10_000_00n,
        goalId: "emergency",
      },
      {
        owner: "partner" as const,
        direction: "deposit" as const,
        amountCentavos: 4_000_00n,
        goalId: null,
      },
      {
        owner: "self" as const,
        direction: "withdrawal" as const,
        amountCentavos: 500_00n,
        goalId: "emergency",
      },
    ];
    expect(recordedSavingsCentavos(records, { owner: "self" })).toBe(9_500_00n);
    expect(recordedSavingsCentavos(records, { owner: "partner" })).toBe(4_000_00n);
    expect(recordedSavingsCentavos(records, { goalId: "emergency" })).toBe(9_500_00n);
    expect(recordedSavingsCentavos(records, { goalId: null })).toBe(4_000_00n);
  });

  it("splits saved money between you and your partner and ignores a voided movement", () => {
    const movements = [
      { owner: "self" as const, amountCentavos: 700_00n, voided: false },
      { owner: "partner" as const, amountCentavos: 300_00n, voided: false },
      { owner: "self" as const, amountCentavos: -100_00n, voided: false },
      { owner: "partner" as const, amountCentavos: 50_00n, voided: true },
    ];
    expect(attributedCentavos(movements)).toBe(900_00n);
    expect(attributedCentavos(movements, "self")).toBe(600_00n);
    expect(attributedCentavos(movements, "partner")).toBe(300_00n);
  });
});
