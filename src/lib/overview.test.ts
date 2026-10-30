import {
  cardDebtCentavos,
  cashOnHandCentavos,
  incomeCentavos,
  paymentCentavos,
  reportGroup,
  spendingCentavos,
  transferCentavos,
} from "@/lib/overview";

describe("monthly overview", () => {
  it("keeps spending, card payments, and transfers apart", () => {
    expect(reportGroup("expense")).toBe("spending");
    expect(reportGroup("credit_card_purchase")).toBe("spending");
    expect(reportGroup("credit_card_payment")).toBe("card_payment");
    expect(reportGroup("transfer")).toBe("transfer");
    expect(reportGroup("income")).toBeNull();
    expect(reportGroup("opening_balance")).toBeNull();
    expect(reportGroup("credit_card_refund")).toBeNull();
    expect(reportGroup("credit_card_fee")).toBeNull();
  });

  it("sums income and spending without counting a payment twice", () => {
    expect(incomeCentavos([{ amountCentavos: 20_000_00n }, { amountCentavos: -1n }])).toBe(
      20_000_00n,
    );
    expect(
      spendingCentavos([{ amountCentavos: 450_00n }, { amountCentavos: 80_00n }]),
    ).toBe(530_00n);
    expect(
      paymentCentavos([{ amountCentavos: -1_000_00n }, { amountCentavos: -1_000_00n }]),
    ).toBe(1_000_00n);
    expect(
      transferCentavos([{ amountCentavos: -700_00n }, { amountCentavos: 700_00n }]),
    ).toBe(700_00n);
  });

  it("totals cash and bank separately from card debt", () => {
    const accounts = [
      { kind: "cash", balanceCentavos: 500_00n },
      { kind: "bank", balanceCentavos: 12_000_00n },
      { kind: "savings", balanceCentavos: 8_000_00n },
      { kind: "credit_card", balanceCentavos: 3_000_00n },
      { kind: "credit_card", balanceCentavos: 250_00n },
    ];
    expect(cashOnHandCentavos(accounts)).toBe(12_500_00n);
    expect(cardDebtCentavos(accounts)).toBe(3_250_00n);
  });
});
