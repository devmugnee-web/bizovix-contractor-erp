import type { TenderCostingStatus } from "./enums";

export type TenderCostingSourcingType = "LOCAL" | "FOREIGN" | "LOCAL_AND_FOREIGN";
export type TenderCostingItemStatus = "NOT_COSTED" | "DRAFT" | "COSTED";
export type TenderCostingSelectedSource = "LOCAL" | "FOREIGN";
export type TenderCostingShippingMethod =
  | "DOOR_TO_DOOR_SEA"
  | "DOOR_TO_DOOR_AIR"
  | "LC_SEA"
  | "LC_AIR";
export type TenderCostingShippingRateBasis = "PER_CBM" | "PER_KG" | "FLAT";

export interface TenderCostingUser {
  id: string;
  name: string;
  email: string;
}

export interface TenderCostingItemRecord {
  id: string;
  organizationId: string;
  costingId: string;
  costingDate: string;
  preparedByUserId: string | null;
  preparedByName: string | null;
  description: string;
  secondaryDescription: string | null;
  unit: string;
  quantity: string;
  unitCost: string;
  marginPercent: string;
  totalCost: string;
  ourCost: string;
  sourcingType: TenderCostingSourcingType;
  costingStatus: TenderCostingItemStatus;
  selectedSource: TenderCostingSelectedSource | null;
  localSupplierName: string | null;
  localUnitPrice: string;
  localDiscountPercent: string;
  localVatPercent: string;
  localTaxPercent: string;
  localTransportCost: string;
  localOtherCost: string;
  localTotalCost: string;
  foreignSupplierName: string | null;
  foreignCountry: string | null;
  foreignCurrency: string;
  foreignUnitPrice: string;
  foreignExchangeRate: string;
  exchangeRateDate: string | null;
  foreignShippingMethod: TenderCostingShippingMethod;
  foreignShippingProvider: string | null;
  foreignDoorToDoorCharge: string;
  foreignImportDutyIncluded: boolean;
  foreignTransitDays: number | null;
  foreignShippingReference: string | null;
  foreignTransportCharge: string;
  customsDeclarationCharge: string;
  shippingWeightKg: string;
  shippingVolumeCbm: string;
  shippingRateBasis: TenderCostingShippingRateBasis;
  shippingRate: string;
  domesticTransportCost: string;
  foreignFreightCost: string;
  foreignInsuranceCost: string;
  customsDutyPercent: string;
  regulatoryDutyPercent: string;
  supplementaryDutyPercent: string;
  foreignVatPercent: string;
  foreignTaxPercent: string;
  cnfCharge: string;
  portHandlingCharge: string;
  bankLcCharge: string;
  foreignLocalTransportCost: string;
  foreignOtherCost: string;
  foreignProductValueBdt: string;
  foreignLandedCost: string;
  remarks: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenderCostingRecord {
  id: string;
  organizationId: string;
  tenderId: string;
  status: TenderCostingStatus;
  costingDate: string;
  source: string | null;
  currency: string;
  exchangeRate: string;
  costingVersion: number;
  remarks: string | null;
  preparedByUserId: string | null;
  preparedByName: string | null;
  costingBudget: string | null;
  estimatedValue: string;
  estimatedCost: string;
  ourCost: string;
  marginPercent: string;
  freightCost: string;
  installationCost: string;
  otherCost: string;
  contingencyPercent: string;
  contingencyAmount: string;
  validityDays: number | null;
  paymentTermId: string | null;
  deliveryTime: string | null;
  warranty: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  approvedForCostingAt: string;
  approvedForCostingById: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  tender: {
    id: string;
    egpTenderId: string | null;
    workName: string;
    category: string | null;
    contractValue: string;
    organizationMaster: { id: string; shortName: string; fullName: string } | null;
  };
  preparedBy: TenderCostingUser | null;
  assignedTo: TenderCostingUser | null;
  approvedForCostingBy: TenderCostingUser | null;
}

export interface TenderCostingDetail extends TenderCostingRecord {
  items: TenderCostingItemRecord[];
  paymentTerm: { id: string; name: string; days: number } | null;
}

export interface SaveTenderCostingItemInput {
  costingDate: string;
  preparedByUserId?: string;
  description: string;
  secondaryDescription?: string;
  unit: string;
  quantity: number;
  unitCost?: number;
  marginPercent?: number;
  sourcingType: TenderCostingSourcingType;
  costingStatus: TenderCostingItemStatus;
  selectedSource?: TenderCostingSelectedSource;
  localSupplierName?: string;
  localUnitPrice?: number;
  localDiscountPercent?: number;
  localVatPercent?: number;
  localTaxPercent?: number;
  localTransportCost?: number;
  localOtherCost?: number;
  foreignSupplierName?: string;
  foreignCountry?: string;
  foreignCurrency?: string;
  foreignUnitPrice?: number;
  foreignExchangeRate?: number;
  exchangeRateDate?: string;
  foreignShippingMethod?: TenderCostingShippingMethod;
  foreignShippingProvider?: string;
  foreignDoorToDoorCharge?: number;
  foreignImportDutyIncluded?: boolean;
  foreignTransitDays?: number;
  foreignShippingReference?: string;
  foreignTransportCharge?: number;
  customsDeclarationCharge?: number;
  shippingWeightKg?: number;
  shippingVolumeCbm?: number;
  shippingRateBasis?: TenderCostingShippingRateBasis;
  shippingRate?: number;
  domesticTransportCost?: number;
  foreignFreightCost?: number;
  foreignInsuranceCost?: number;
  customsDutyPercent?: number;
  regulatoryDutyPercent?: number;
  supplementaryDutyPercent?: number;
  foreignVatPercent?: number;
  foreignTaxPercent?: number;
  cnfCharge?: number;
  portHandlingCharge?: number;
  bankLcCharge?: number;
  foreignLocalTransportCost?: number;
  foreignOtherCost?: number;
  remarks?: string;
  sortOrder?: number;
}

export interface SaveTenderCostingInput {
  version: number;
  status: TenderCostingStatus;
  costingDate: string;
  source?: string;
  currency: string;
  exchangeRate: number;
  costingVersion: number;
  remarks?: string;
  preparedByUserId?: string;
  preparedByName?: string;
  freightCost: number;
  installationCost: number;
  otherCost: number;
  contingencyPercent: number;
  validityDays?: number;
  paymentTermId?: string;
  deliveryTime?: string;
  warranty?: string;
  assignedToUserId?: string;
  assignedToName?: string;
  items: SaveTenderCostingItemInput[];
}

export interface SetTenderCostingBudgetInput {
  version: number;
  costingBudget: number;
}

export interface TenderCostingQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: TenderCostingStatus;
  organizationMasterId?: string;
  assignedToUserId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface TenderCostingStats {
  total: number;
  ready: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalEstimatedValue: string;
  totalCostingBudget: string;
  totalEstimatedCost: string;
  totalOurCost: string;
}
