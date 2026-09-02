export type LcCostCategoryKey =
  | "LC_BANKING"
  | "ORIGIN"
  | "FREIGHT"
  | "INSURANCE"
  | "CUSTOMS"
  | "TAX"
  | "CNF"
  | "PORT"
  | "DESTINATION_TRANSPORT"
  | "LOCAL"
  | "OTHER";

export type LcAllocationBasisKey = "PURCHASE_VALUE" | "USD_VALUE" | "QUANTITY" | "WEIGHT" | "CBM" | "EQUAL";
export type LcAllocationModeKey = "AUTO" | "MANUAL_AMOUNT" | "MANUAL_PERCENTAGE" | "HYBRID" | "DIRECT_PRODUCT";

export interface LcDefaultCostHeadSeed {
  name: string;
  code: string;
  category: LcCostCategoryKey;
  defaultAllocationMethod: LcAllocationBasisKey;
  fallbackAllocationMethod?: LcAllocationBasisKey;
  recommendedAllocationMode?: LcAllocationModeKey;
  includeInLandedCost?: boolean;
}

/** Matches the spec's "Default configured cost heads" list and the sample
 * acceptance dataset's named expenses exactly, so a fresh workspace can
 * immediately reproduce the BDT 4,854,296.45 acceptance total without first
 * having to configure anything in Configuration > Cost Heads. */
export const lcDefaultCostHeadSeeds: LcDefaultCostHeadSeed[] = [
  { name: "LC Payment", code: "LC_PAYMENT", category: "LC_BANKING", defaultAllocationMethod: "PURCHASE_VALUE" },
  { name: "LC Related Cost", code: "LC_RELATED_COST", category: "LC_BANKING", defaultAllocationMethod: "PURCHASE_VALUE" },
  { name: "TT Payment", code: "TT_PAYMENT", category: "LC_BANKING", defaultAllocationMethod: "PURCHASE_VALUE", includeInLandedCost: false },
  { name: "LC Cost", code: "LC_COST", category: "LC_BANKING", defaultAllocationMethod: "PURCHASE_VALUE" },
  {
    name: "Supplier Warehouse → Supplier Port",
    code: "ORIGIN_INLAND",
    category: "ORIGIN",
    defaultAllocationMethod: "WEIGHT",
    fallbackAllocationMethod: "PURCHASE_VALUE",
  },
  {
    name: "Ocean Freight",
    code: "OCEAN_FREIGHT",
    category: "FREIGHT",
    defaultAllocationMethod: "WEIGHT",
    fallbackAllocationMethod: "PURCHASE_VALUE",
  },
  { name: "Insurance", code: "INSURANCE", category: "INSURANCE", defaultAllocationMethod: "PURCHASE_VALUE" },
  {
    name: "Custom Duty",
    code: "CUSTOM_DUTY",
    category: "CUSTOMS",
    defaultAllocationMethod: "PURCHASE_VALUE",
    recommendedAllocationMode: "DIRECT_PRODUCT",
  },
  { name: "Global Tax", code: "GLOBAL_TAX", category: "TAX", defaultAllocationMethod: "PURCHASE_VALUE" },
  { name: "CNF Bill", code: "CNF_BILL", category: "CNF", defaultAllocationMethod: "PURCHASE_VALUE", fallbackAllocationMethod: "WEIGHT" },
  {
    name: "Chattogram → Dhaka Transport",
    code: "DEST_TRANSPORT",
    category: "DESTINATION_TRANSPORT",
    defaultAllocationMethod: "WEIGHT",
    fallbackAllocationMethod: "PURCHASE_VALUE",
  },
  { name: "Local Cost", code: "LOCAL_COST", category: "LOCAL", defaultAllocationMethod: "PURCHASE_VALUE" },
];
