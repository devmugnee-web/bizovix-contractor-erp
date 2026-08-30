export interface QuotationCostingItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
  unitPrice: number;
  referenceMargin: number;
}

export interface QuotationOverhead {
  id: string;
  description: string;
  amount: number;
}

export const REFERENCE_COSTING_ITEMS: QuotationCostingItem[] = [
  { id: "item-1", description: "Excavation Work", unit: "LS", quantity: 1, unitCost: 250_000, taxRate: 5, unitPrice: 420_000, referenceMargin: 40.48 },
  { id: "item-2", description: "Brick Work", unit: "Nos", quantity: 10_000, unitCost: 12, taxRate: 5, unitPrice: 18, referenceMargin: 50 },
  { id: "item-3", description: "Cement (50 KG)", unit: "Bag", quantity: 500, unitCost: 420, taxRate: 2.5, unitPrice: 520, referenceMargin: 23.81 },
  { id: "item-4", description: "Steel Reinforcement", unit: "MT", quantity: 2.5, unitCost: 75_000, taxRate: 5, unitPrice: 92_000, referenceMargin: 22.09 },
  { id: "item-5", description: "RCC Work", unit: "LS", quantity: 1, unitCost: 550_000, taxRate: 5, unitPrice: 820_000, referenceMargin: 32.71 },
  { id: "item-6", description: "Plaster Work", unit: "Sqft", quantity: 1_000, unitCost: 85, taxRate: 0, unitPrice: 120, referenceMargin: 29.17 },
  { id: "item-7", description: "Painting Work", unit: "Sqft", quantity: 1_000, unitCost: 45, taxRate: 0, unitPrice: 70, referenceMargin: 35.71 },
  { id: "item-8", description: "Electrical Work", unit: "LS", quantity: 1, unitCost: 180_000, taxRate: 5, unitPrice: 250_000, referenceMargin: 28 },
  { id: "item-9", description: "Plumbing Work", unit: "LS", quantity: 1, unitCost: 120_000, taxRate: 5, unitPrice: 170_000, referenceMargin: 29.41 },
  { id: "item-10", description: "Finishing Work", unit: "LS", quantity: 1, unitCost: 280_000, taxRate: 0, unitPrice: 400_000, referenceMargin: 30 },
];

export const REFERENCE_OVERHEADS: QuotationOverhead[] = [
  { id: "overhead-1", description: "Site Supervision & Management", amount: 80_000 },
  { id: "overhead-2", description: "Contingency", amount: 50_000 },
];

// The reference screenshot contains internally inconsistent arithmetic. These
// literals are used only for its untouched initial state; any local edit switches
// the page to formula-derived values.
export const REFERENCE_DISPLAY_TOTALS = {
  totalCost: 2_027_500,
  itemTax: 75_625,
  totalSelling: 2_940_000,
  margin: 31.09,
  profit: 912_500,
  overheads: 130_000,
  subtotalBeforeVat: 2_233_125,
  vatAmount: 167_484.38,
  grandAmount: 2_400_609.38,
} as const;
