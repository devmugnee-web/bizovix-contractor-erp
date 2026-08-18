import type { PartyRole, PartyStatus } from "./enums";

export interface PartyContactRecord {
  id: string;
  organizationMasterId: string | null;
  partyId: string | null;
  contactRole: string | null;
  name: string;
  designation: string;
  mobile: string;
  email: string | null;
  address: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubcontractorProfileRecord {
  id: string;
  partyId: string;
  tradeCategoryId: string | null;
  tradeCategory: { id: string; name: string } | null;
  specialization: string | null;
  defaultRetentionPct: string | null;
  performanceRating: string | null;
}

export interface PartyRecord {
  id: string;
  code: string;
  name: string;
  displayName: string | null;
  roles: PartyRole[];
  status: PartyStatus;
  contactPerson: string | null;
  phone: string | null;
  alternatePhone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  district: string | null;
  country: string | null;
  binVat: string | null;
  tinNo: string | null;
  tradeLicenseNo: string | null;
  registrationNo: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  bankBranch: string | null;
  bankRoutingSwift: string | null;
  paymentTermId: string | null;
  paymentTerm: { id: string; name: string; days: number } | null;
  defaultCurrency: string | null;
  creditLimit: string | null;
  categoryId: string | null;
  category: { id: string; name: string; type: string } | null;
  notes: string | null;
  archivedAt: string | null;
  subcontractorProfile: SubcontractorProfileRecord | null;
  contacts: PartyContactRecord[];
  outstandingPayable?: string;
  /** Present only on create/update responses — soft duplicate-detection warnings, never blocking. */
  duplicateWarnings?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PartyDetail extends PartyRecord {
  linked: {
    payables: Array<{ id: string; billNo: string; billDate: string; amount: string; paidAmount: string; status: string }>;
    documents: Array<{ id: string; name: string; category: string | null; expiryDate: string | null; status: string }>;
    projectsAssigned: number;
  };
  outstandingPayable: string;
}

export interface PartyStats {
  total: number;
  active: number;
  suspendedOrInactive: number;
  outstandingPayable: string;
}

export interface SubcontractorProfileInput {
  tradeCategoryId?: string;
  specialization?: string;
  defaultRetentionPct?: number;
  performanceRating?: number;
}

export interface SavePartyInput {
  code?: string;
  name: string;
  displayName?: string;
  roles: PartyRole[];
  status?: PartyStatus;
  contactPerson?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  website?: string;
  address?: string;
  district?: string;
  country?: string;
  binVat?: string;
  tinNo?: string;
  tradeLicenseNo?: string;
  registrationNo?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankBranch?: string;
  bankRoutingSwift?: string;
  paymentTermId?: string;
  defaultCurrency?: string;
  creditLimit?: number;
  categoryId?: string;
  notes?: string;
  subcontractor?: SubcontractorProfileInput;
}

export interface PartyQuery {
  page?: number;
  limit?: number;
  search?: string;
  roles?: string;
  status?: PartyStatus;
  categoryId?: string;
  district?: string;
}

export interface SavePartyContactInput {
  contactRole?: string;
  name: string;
  designation: string;
  mobile: string;
  email?: string;
  address: string;
}
