import { ALLOCATION_BASE_CENTAVOS, MoneyParseError, sumCentavos } from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";

import {
  BudgetError,
  budgetLineStatus,
  budgetPlanPosting,
  centavosToPesoInput,
  countsAsBudgetSpending,
  defaultPlannedCentavos,
  formatBudgetMonth,
  isBudgetCategory,
  manilaMonthStart,
  nextMonthStart,
  occurredInMonth,
  parsePlannedInput,
  planFit,
  planFitMessage,
  resolvedPlannedCentavos,
  spendingTotals,
} from "@/lib/budget";

describe("budget month", () => {
  it("uses the Manila calendar month and the following first day", () => {
    expect(manilaMonthStart(new Date("2026-10-26T15:30:00.000Z"))).toBe("2026-10-01");
    expect(manilaMonthStart(new Date("2026-09-30T16:30:00.000Z"))).toBe("2026-10-01");
    expect(nextMonthStart("2026-10-01")).toBe("2026-11-01");
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
    expect(formatBudgetMonth("2026-10-01")).toBe("October 2026");
  });

  it("includes the last day of the month and excludes the next month", () => {
    expect(occurredInMonth("2026-10-01", "2026-10-01")).toBe(true);
    expect(occurredInMonth("2026-10-31", "2026-10-01")).toBe(true);
    expect(occurredInMonth("2026-11-01", "2026-10-01")).toBe(false);
    expect(occurredInMonth("2026-09-30", "2026-10-01")).toBe(false);
  });
});

describe("budget categories", () => {
  it("counts cash spending and card purchases, not payments", () => {
    const budgetCategories = STARTER_CATEGORIES.filter((category) =>
      isBudgetCategory(category.reportTreatment),
    );
    expect(budgetCategories.some((category) => category.name === "Salary")).toBe(false);
    expect(sumCentavos(budgetCategories.map((category) => category.monthlyCentavos ?? 0n))).toBe(
      ALLOCATION_BASE_CENTAVOS,
    );
    expect(countsAsBudgetSpending("expense")).toBe(true);
    expect(countsAsBudgetSpending("credit_card_purchase")).toBe(true);
    for (const type of [
      "income",
      "transfer",
      "credit_card_payment",
      "credit_card_refund",
      "credit_card_fee",
      "opening_balance",
    ]) {
      expect(countsAsBudgetSpending(type)).toBe(false);
    }
  });

  it("uses a saved amount, then the starter template", () => {
    expect(defaultPlannedCentavos("Rent", null)).toBe(450_000n);
    expect(defaultPlannedCentavos("Rent", 0n)).toBe(0n);
    expect(defaultPlannedCentavos("Salary", null)).toBe(0n);
    expect(defaultPlannedCentavos("Unknown", null)).toBe(0n);
  });
});

describe("planned amounts", () => {
  it("turns centavos into peso input text", () => {
    expect(centavosToPesoInput(450_000n)).toBe("4500.00");
    expect(centavosToPesoInput(229_800n)).toBe("2298.00");
    expect(centavosToPesoInput(0n)).toBe("0.00");
    expect(() => centavosToPesoInput(-1n)).toThrow(BudgetError);
  });

  it("parses a planned peso amount and rejects negatives", () => {
    expect(parsePlannedInput("4500")).toBe(450_000n);
    expect(parsePlannedInput("4500.")).toBe(450_000n);
    expect(parsePlannedInput("12.50")).toBe(1_250n);
    expect(() => parsePlannedInput("-1")).toThrow(BudgetError);
    expect(() => parsePlannedInput("")).toThrow(MoneyParseError);
  });

  it("resolves a fixed amount and a percent of the template", () => {
    expect(
      resolvedPlannedCentavos({
        amountMode: "fixed",
        plannedCentavos: 100n,
        percentBps: null,
      }),
    ).toBe(100n);
    expect(
      resolvedPlannedCentavos({
        amountMode: "percent",
        plannedCentavos: null,
        percentBps: 10_000n,
      }),
    ).toBe(ALLOCATION_BASE_CENTAVOS);
  });

  it("posts one non-negative amount per category", () => {
    const amounts = new Map<string, bigint>([
      ["rent", 450_000n],
      ["water", 0n],
    ]);
    expect(budgetPlanPosting(["rent", "water"], amounts)).toEqual([
      { categoryId: "rent", plannedCentavos: 450_000n },
      { categoryId: "water", plannedCentavos: 0n },
    ]);
    expect(() => budgetPlanPosting(["rent", "rent"], amounts)).toThrow(BudgetError);
    expect(() => budgetPlanPosting(["rent"], new Map([["rent", -1n]]))).toThrow(BudgetError);
    expect(() => budgetPlanPosting([], amounts)).toThrow(BudgetError);
  });
});

describe("plan compared with spending", () => {
  it("sums spending and warns when a category is over", () => {
    const totals = spendingTotals([
      { categoryId: "groceries", amountCentavos: 200n },
      { categoryId: "groceries", amountCentavos: 50n },
      { categoryId: "rent", amountCentavos: -20n },
    ]);
    expect(totals.get("groceries")).toBe(250n);
    expect(totals.get("rent")).toBe(-20n);
    expect(budgetLineStatus(300n, 250n)).toEqual({
      remainingCentavos: 50n,
      overByCentavos: 0n,
    });
    expect(budgetLineStatus(100n, 150n)).toEqual({
      remainingCentavos: -50n,
      overByCentavos: 50n,
    });
  });

  it("compares the plan with the ₱47,000 template", () => {
    expect(planFit([4_700_000n])).toEqual({
      plannedCentavos: 4_700_000n,
      unallocatedCentavos: 0n,
    });
    expect(planFitMessage(0n, ALLOCATION_BASE_CENTAVOS)).toBe("This plan uses the full ₱47,000.00.");
    expect(planFitMessage(300_000n, ALLOCATION_BASE_CENTAVOS)).toBe("₱3,000.00 is not assigned yet.");
    expect(planFitMessage(-50_000n, ALLOCATION_BASE_CENTAVOS)).toBe(
      "This plan is ₱500.00 over ₱47,000.00.",
    );
  });
});
