import { accountBalanceCentavos, openingBalanceEntry } from "@/lib/accounts";
import { sumCentavos } from "@/lib/money";
import {
  MovementError,
  cashMovementPosting,
  formatIsoDate,
  movementAmount,
  movementDirection,
} from "@/lib/transactions";

const bank = "bank";
const wallet = "wallet";
const savings = "savings";
const salary = "salary";
const groceries = "groceries";

describe("cash movements", () => {
  it("increases one balance when income arrives", () => {
    const posting = cashMovementPosting({
      type: "income",
      amountCentavos: 5_000n,
      toAccountId: bank,
      categoryId: salary,
    });

    expect(posting.entries).toEqual([
      { accountId: bank, amountCentavos: 5_000n },
    ]);
    expect(posting.split).toEqual({ categoryId: salary, amountCentavos: 5_000n });
    expect(
      accountBalanceCentavos([
        { amountCentavos: openingBalanceEntry(10_000n) ?? 0n, voided: false },
        { amountCentavos: posting.entries[0].amountCentavos, voided: false },
      ]),
    ).toBe(15_000n);
  });

  it("decreases one balance and keeps the spending split positive", () => {
    const posting = cashMovementPosting({
      type: "expense",
      amountCentavos: 2_500n,
      fromAccountId: wallet,
      categoryId: groceries,
    });

    expect(posting.entries).toEqual([
      { accountId: wallet, amountCentavos: -2_500n },
    ]);
    expect(posting.split?.amountCentavos).toBe(2_500n);
    expect(
      accountBalanceCentavos([
        { amountCentavos: 10_000n, voided: false },
        { amountCentavos: posting.entries[0].amountCentavos, voided: false },
      ]),
    ).toBe(7_500n);
  });

  it("moves the same amount between two balances without a category", () => {
    const posting = cashMovementPosting({
      type: "transfer",
      amountCentavos: 3_000n,
      fromAccountId: bank,
      toAccountId: savings,
    });
    const balances = new Map<string, bigint>([
      [bank, 10_000n],
      [savings, 2_000n],
    ]);

    for (const entry of posting.entries) {
      balances.set(
        entry.accountId,
        (balances.get(entry.accountId) ?? 0n) + entry.amountCentavos,
      );
    }

    expect(posting.split).toBeNull();
    expect(sumCentavos(posting.entries.map((entry) => entry.amountCentavos))).toBe(0n);
    expect(balances.get(bank)).toBe(7_000n);
    expect(balances.get(savings)).toBe(5_000n);
  });

  it("leaves a voided spending entry out of the balance", () => {
    const posting = cashMovementPosting({
      type: "expense",
      amountCentavos: 400n,
      fromAccountId: wallet,
      categoryId: groceries,
    });

    expect(
      accountBalanceCentavos([
        { amountCentavos: 10_000n, voided: false },
        { amountCentavos: posting.entries[0].amountCentavos, voided: true },
      ]),
    ).toBe(10_000n);
  });

  it("rejects a zero amount, a one-balance transfer, and a categorized transfer", () => {
    expect(() =>
      cashMovementPosting({
        type: "expense",
        amountCentavos: 0n,
        fromAccountId: wallet,
        categoryId: groceries,
      }),
    ).toThrow(MovementError);
    expect(() =>
      cashMovementPosting({
        type: "transfer",
        amountCentavos: 100n,
        fromAccountId: bank,
        toAccountId: bank,
      }),
    ).toThrow("Choose two different balances.");
    expect(() =>
      cashMovementPosting({
        type: "transfer",
        amountCentavos: 100n,
        fromAccountId: bank,
        toAccountId: savings,
        categoryId: groceries,
      }),
    ).toThrow("A transfer does not use a category.");
  });
});

describe("transaction list text", () => {
  const names = new Map([
    [bank, "BDO"],
    [savings, "Savings"],
    [wallet, "Wallet"],
  ]);

  it("shows where income, spending, and a transfer went", () => {
    const income = cashMovementPosting({
      type: "income",
      amountCentavos: 1_000n,
      toAccountId: bank,
      categoryId: salary,
    });
    const spending = cashMovementPosting({
      type: "expense",
      amountCentavos: 250n,
      fromAccountId: wallet,
      categoryId: groceries,
    });
    const transfer = cashMovementPosting({
      type: "transfer",
      amountCentavos: 500n,
      fromAccountId: bank,
      toAccountId: savings,
    });

    expect(movementAmount("income", income.entries)).toBe(1_000n);
    expect(movementDirection("income", income.entries, names)).toBe("Into BDO");
    expect(movementAmount("expense", spending.entries)).toBe(250n);
    expect(movementDirection("expense", spending.entries, names)).toBe("From Wallet");
    expect(movementDirection("transfer", transfer.entries, names)).toBe(
      "BDO → Savings",
    );
  });

  it("formats a calendar date without moving it to the previous day", () => {
    expect(formatIsoDate("2026-10-26")).toBe("26 Oct 2026");
  });
});
