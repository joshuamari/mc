export type StarterCategory = {
  name: string;
  group:
    | "housing"
    | "utilities"
    | "food"
    | "transport"
    | "pet"
    | "want"
    | "emergency"
    | "savings"
    | "irregular"
    | "income";
  reportTreatment: "consumption" | "savings_allocation" | "income";
  essential: boolean;
  monthlyCentavos: bigint | null;
};

/**
 * Editable first-month template. Amounts are seeds for a later budget,
 * not permanent rules. Names must match the database seed.
 */
export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  {
    name: "Rent",
    group: "housing",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 450_000n,
  },
  {
    name: "Water bill",
    group: "utilities",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 120_000n,
  },
  {
    name: "Electricity bill",
    group: "utilities",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 800_000n,
  },
  {
    name: "Internet bill",
    group: "utilities",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 229_800n,
  },
  {
    name: "Office transportation",
    group: "transport",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 219_600n,
  },
  {
    name: "Office lunch",
    group: "food",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 400_000n,
  },
  {
    name: "Cat litter",
    group: "pet",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 60_000n,
  },
  {
    name: "Cat wet food",
    group: "pet",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 150_000n,
  },
  {
    name: "Groceries",
    group: "food",
    reportTreatment: "consumption",
    essential: true,
    monthlyCentavos: 300_000n,
  },
  {
    name: "Wants and personal spending",
    group: "want",
    reportTreatment: "consumption",
    essential: false,
    monthlyCentavos: 250_000n,
  },
  {
    name: "Emergency fund contribution",
    group: "emergency",
    reportTreatment: "savings_allocation",
    essential: false,
    monthlyCentavos: 700_000n,
  },
  {
    name: "Long-term savings and investments",
    group: "savings",
    reportTreatment: "savings_allocation",
    essential: false,
    monthlyCentavos: 700_000n,
  },
  {
    name: "Irregular expenses buffer",
    group: "irregular",
    reportTreatment: "consumption",
    essential: false,
    monthlyCentavos: 320_600n,
  },
  {
    name: "Salary",
    group: "income",
    reportTreatment: "income",
    essential: false,
    monthlyCentavos: null,
  },
  {
    name: "Other income",
    group: "income",
    reportTreatment: "income",
    essential: false,
    monthlyCentavos: null,
  },
];
