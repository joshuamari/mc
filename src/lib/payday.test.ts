import {
  PaydayError,
  dateInMonth,
  defaultCutoffSequence,
  defaultCutoffShares,
  defaultCutoffs,
  leftToSpend,
  nextCutoff,
  monthEnd,
  occurredInPeriod,
  paycheckCentavos,
  paydayPlanPosting,
  pesoInputFromCentavos,
  restoredCutoffShares,
} from "@/lib/payday";

const rent = "11111111-1111-4111-8111-111111111111";
const groceries = "22222222-2222-4222-8222-222222222222";

describe("payday dates", () => {
  it("splits a month into the 15th and the last day", () => {
    expect(monthEnd("2026-10-01")).toBe("2026-10-31");
    expect(monthEnd("2026-11-01")).toBe("2026-11-30");
    expect(monthEnd("2026-02-01")).toBe("2026-02-28");
    expect(monthEnd("2024-02-01")).toBe("2024-02-29");
    expect(defaultCutoffs("2026-10-01")).toEqual([
      {
        sequence: 1,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-15",
        expectedPayDate: "2026-10-15",
      },
      {
        sequence: 2,
        periodStart: "2026-10-16",
        periodEnd: "2026-10-31",
        expectedPayDate: "2026-10-31",
      },
    ]);
    expect(defaultCutoffs("2026-02-01")[1].expectedPayDate).toBe("2026-02-28");
    const [first, second] = defaultCutoffs("2026-10-01");
    expect(nextCutoff([first, second], "2026-10-28").sequence).toBe(2);
    expect(nextCutoff([first, second], "2026-10-15").sequence).toBe(1);
    expect(nextCutoff([first, second], "2026-10-31").sequence).toBe(2);
  });

  it("keeps a paycheck inside the cutoff dates", () => {
    expect(occurredInPeriod("2026-10-15", "2026-10-01", "2026-10-15")).toBe(true);
    expect(occurredInPeriod("2026-10-16", "2026-10-01", "2026-10-15")).toBe(false);
    expect(dateInMonth("2026-10-31", "2026-10-01")).toBe(true);
    expect(dateInMonth("2026-11-01", "2026-10-01")).toBe(false);
  });
});

describe("payday plan", () => {
  it("puts rent and utilities on the first cutoff", () => {
    expect(defaultCutoffSequence("housing")).toBe(1);
    expect(defaultCutoffSequence("utilities")).toBe(1);
    expect(defaultCutoffSequence("food")).toBe(2);
    expect(defaultCutoffSequence("emergency")).toBe(2);
  });

  it("rejects overlapping cutoffs and a pay date outside the window", () => {
    const [first, second] = defaultCutoffs("2026-10-01");
    const categories = [
      { categoryId: rent, amountCentavos: 450_000n },
      { categoryId: groceries, amountCentavos: 300_000n },
    ];
    const shares = new Map([
      [rent, defaultCutoffShares(450_000n, 1)],
      [groceries, defaultCutoffShares(300_000n, 2)],
    ]);
    expect(paydayPlanPosting("2026-10-01", [first, second], shares, categories).cutoffs).toHaveLength(2);

    expect(() =>
      paydayPlanPosting(
        "2026-10-01",
        [first, { ...second, periodStart: "2026-10-15" }],
        shares,
        categories,
      ),
    ).toThrow(PaydayError);

    expect(() =>
      paydayPlanPosting(
        "2026-10-01",
        [{ ...first, expectedPayDate: "2026-10-20" }, second],
        shares,
        categories,
      ),
    ).toThrow("Choose a pay date inside the cutoff.");
  });

  it("divides one monthly amount across the two cutoffs", () => {
    const [first, second] = defaultCutoffs("2026-10-01");
    const transport = "33333333-3333-4333-8333-333333333333";
    const monthly = 219_600n;
    const shares = new Map([[transport, { firstCentavos: 100_000n, secondCentavos: 119_600n }]]);
    const plan = paydayPlanPosting(
      "2026-10-01",
      [first, second],
      shares,
      [{ categoryId: transport, amountCentavos: monthly }],
    );
    expect(plan.assignments).toEqual([
      { categoryId: transport, firstCentavos: 100_000n, secondCentavos: 119_600n },
    ]);
    expect(leftToSpend(2_000_000n, 119_600n)).toBe(1_880_400n);
    expect(pesoInputFromCentavos(219_600n)).toBe("2196");
    expect(pesoInputFromCentavos(119_650n)).toBe("1196.50");
    expect(
      restoredCutoffShares(monthly, 219_600n, null, 2),
    ).toEqual({ firstCentavos: 219_600n, secondCentavos: 0n });
    expect(restoredCutoffShares(monthly, 50_000n, 50_000n, 2)).toEqual(
      defaultCutoffShares(monthly, 2),
    );

    expect(() =>
      paydayPlanPosting(
        "2026-10-01",
        [first, second],
        new Map([[transport, { firstCentavos: monthly, secondCentavos: 1n }]]),
        [{ categoryId: transport, amountCentavos: monthly }],
      ),
    ).toThrow("The two amounts must add up to the monthly amount.");
  });

  it("subtracts the bills due from the paycheck", () => {
    expect(paycheckCentavos([])).toBeNull();
    expect(paycheckCentavos([0n, -5n])).toBeNull();
    expect(paycheckCentavos([1_000_000n, 200_000n])).toBe(1_200_000n);
    expect(leftToSpend(null, 450_000n)).toBeNull();
    expect(leftToSpend(1_000_000n, 450_000n)).toBe(550_000n);
    expect(leftToSpend(400_000n, 450_000n)).toBe(-50_000n);
  });
});
