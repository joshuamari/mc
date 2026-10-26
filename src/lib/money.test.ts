import { describe, expect, it } from "vitest";

import {
  ALLOCATION_BASE_CENTAVOS,
  MoneyParseError,
  addCentavos,
  formatCentavos,
  isOverBudget,
  percentOfBase,
  pesosToCentavos,
  subtractCentavos,
  sumCentavos,
  unallocatedCentavos,
} from "@/lib/money";
import { STARTER_CATEGORIES } from "@/lib/starter-budget";

describe("pesosToCentavos", () => {
  it("converts the baseline salary to centavos", () => {
    expect(pesosToCentavos("47000")).toBe(4_700_000n);
    expect(pesosToCentavos("₱47000.00")).toBe(ALLOCATION_BASE_CENTAVOS);
  });

  it("keeps one-centavo precision", () => {
    expect(pesosToCentavos("0.01")).toBe(1n);
    expect(pesosToCentavos("0.1")).toBe(10n);
    expect(pesosToCentavos("12.5")).toBe(1_250n);
    expect(pesosToCentavos("-12.50")).toBe(-1_250n);
  });

  it("rejects amounts that are not exact centavos", () => {
    for (const value of ["", "10.555", "47,000", "10.5.0", "php 10", "1e2"]) {
      expect(() => pesosToCentavos(value)).toThrow(MoneyParseError);
    }
  });
});

describe("formatCentavos", () => {
  it("formats pesos with grouping and a sign", () => {
    expect(formatCentavos(4_700_000n)).toBe("₱47,000.00");
    expect(formatCentavos(-125_050n)).toBe("-₱1,250.50");
    expect(formatCentavos(0n)).toBe("₱0.00");
  });
});

describe("ledger arithmetic", () => {
  it("adds and subtracts without floating point", () => {
    expect(addCentavos(10n, 1n)).toBe(11n);
    expect(subtractCentavos(10n, 1n)).toBe(9n);
    expect(sumCentavos([100n, 25n, -5n])).toBe(120n);
  });

  it("rounds half a centavo away from zero", () => {
    expect(percentOfBase(10_000n)).toBe(ALLOCATION_BASE_CENTAVOS);
    expect(percentOfBase(0n, 100n)).toBe(0n);
    expect(percentOfBase(50n, 100n)).toBe(1n);
    expect(percentOfBase(49n, 100n)).toBe(0n);
  });

  it("keeps extra income out of the plan", () => {
    const planned = ALLOCATION_BASE_CENTAVOS;
    const actualIncome = pesosToCentavos("50000");
    expect(unallocatedCentavos(actualIncome, planned)).toBe(300_000n);
    expect(isOverBudget(planned, actualIncome)).toBe(false);
    expect(isOverBudget(actualIncome, planned)).toBe(true);
  });
});

describe("starter budget", () => {
  it("allocates the full ₱47,000 baseline and ₱27,294 of necessities", () => {
    const planned = STARTER_CATEGORIES.flatMap((category) =>
      category.monthlyCentavos === null ? [] : [category.monthlyCentavos],
    );
    const necessities = STARTER_CATEGORIES.flatMap((category) =>
      category.essential && category.monthlyCentavos !== null
        ? [category.monthlyCentavos]
        : [],
    );

    expect(sumCentavos(planned)).toBe(4_700_000n);
    expect(sumCentavos(necessities)).toBe(2_729_400n);
  });
});
