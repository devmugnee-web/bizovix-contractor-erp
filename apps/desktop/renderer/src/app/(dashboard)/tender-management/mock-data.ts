// Temporary structured mock data for panels that have no backend yet
// (Tender Search Team activity, Search Activity Share, Tender Costing,
// SLT Calculation, Item Price History). KPI counts on the page itself come
// from the real `useTenderStats()` API — only "Total Value" and the panels
// below are mocked. Replace with real API-backed hooks once those modules
// are implemented; the shapes here are intentionally close to the rest of
// this app's existing list/report DTOs so swapping in a real hook later is
// a drop-in change.

export type Priority = "High" | "Medium" | "Low";
export type SearchStatus = "New" | "In Progress" | "Qualified" | "Closed";
export type CostingStatus = "Completed" | "In Progress" | "Pending";

export interface TeamMember {
  id: string;
  name: string;
  initial: string;
  color: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  { id: "naimul", name: "Naimul Islam", initial: "N", color: "#2563EB" },
  { id: "rokon", name: "Rokon Hossain", initial: "R", color: "#F97316" },
  { id: "samiul", name: "Samiul Islam", initial: "S", color: "#64748B" },
  { id: "mithun", name: "Mithun Roy", initial: "M", color: "#DB2777" },
  { id: "arifur", name: "Arifur Rahman", initial: "A", color: "#DC2626" },
];

export interface TenderSearchActivity {
  id: string;
  tenderSearchId: string;
  workName: string;
  organization: string;
  source: string;
  searchDate: string;
  assignedTo: TeamMember;
  nextFollowUp: string;
  status: SearchStatus;
  priority: Priority;
}

export const TENDER_SEARCH_ACTIVITIES: TenderSearchActivity[] = [
  {
    id: "1",
    tenderSearchId: "TSR-2024-2158",
    workName: "Supply of LED Display System",
    organization: "DPHE",
    source: "e-GP Portal",
    searchDate: "2024-05-28",
    assignedTo: TEAM_MEMBERS[0]!,
    nextFollowUp: "2024-06-02",
    status: "New",
    priority: "High",
  },
  {
    id: "2",
    tenderSearchId: "TSR-2024-2157",
    workName: "PA System for Conference Room",
    organization: "BUP",
    source: "Email",
    searchDate: "2024-05-30",
    assignedTo: TEAM_MEMBERS[1]!,
    nextFollowUp: "2024-06-03",
    status: "In Progress",
    priority: "Medium",
  },
  {
    id: "3",
    tenderSearchId: "TSR-2024-2156",
    workName: "Access Control System",
    organization: "CAAB",
    source: "e-GP Portal",
    searchDate: "2024-05-25",
    assignedTo: TEAM_MEMBERS[2]!,
    nextFollowUp: "2024-05-31",
    status: "In Progress",
    priority: "Medium",
  },
  {
    id: "4",
    tenderSearchId: "TSR-2024-2155",
    workName: "ICT Equipment Supply",
    organization: "LGED",
    source: "Direct Contact",
    searchDate: "2024-05-18",
    assignedTo: TEAM_MEMBERS[3]!,
    nextFollowUp: "2024-05-28",
    status: "Qualified",
    priority: "High",
  },
  {
    id: "5",
    tenderSearchId: "TSR-2024-2154",
    workName: "Solar Power System",
    organization: "WASA",
    source: "Newspaper",
    searchDate: "2024-05-12",
    assignedTo: TEAM_MEMBERS[4]!,
    nextFollowUp: "2024-05-20",
    status: "Closed",
    priority: "Low",
  },
  { id: "6", tenderSearchId: "TSR-2024-2153", workName: "Boundary Wall Construction", organization: "RHD", source: "e-GP Portal", searchDate: "2024-05-10", assignedTo: TEAM_MEMBERS[0]!, nextFollowUp: "2024-05-18", status: "Qualified", priority: "Medium" },
  { id: "7", tenderSearchId: "TSR-2024-2152", workName: "CCTV Surveillance Installation", organization: "DPHE", source: "Email", searchDate: "2024-05-09", assignedTo: TEAM_MEMBERS[1]!, nextFollowUp: "2024-05-17", status: "New", priority: "High" },
  { id: "8", tenderSearchId: "TSR-2024-2151", workName: "Water Treatment Plant Supply", organization: "WASA", source: "e-GP Portal", searchDate: "2024-05-08", assignedTo: TEAM_MEMBERS[2]!, nextFollowUp: "2024-05-16", status: "In Progress", priority: "High" },
  { id: "9", tenderSearchId: "TSR-2024-2150", workName: "Office Furniture Supply", organization: "BUP", source: "Direct Contact", searchDate: "2024-05-07", assignedTo: TEAM_MEMBERS[3]!, nextFollowUp: "2024-05-15", status: "Closed", priority: "Low" },
  { id: "10", tenderSearchId: "TSR-2024-2149", workName: "Road Marking & Signage", organization: "RHD", source: "Newspaper", searchDate: "2024-05-06", assignedTo: TEAM_MEMBERS[4]!, nextFollowUp: "2024-05-14", status: "Qualified", priority: "Medium" },
  { id: "11", tenderSearchId: "TSR-2024-2148", workName: "Generator Set Supply (250 KVA)", organization: "CAAB", source: "e-GP Portal", searchDate: "2024-05-05", assignedTo: TEAM_MEMBERS[0]!, nextFollowUp: "2024-05-13", status: "New", priority: "High" },
  { id: "12", tenderSearchId: "TSR-2024-2147", workName: "Fire Alarm System Installation", organization: "LGED", source: "Email", searchDate: "2024-05-04", assignedTo: TEAM_MEMBERS[1]!, nextFollowUp: "2024-05-12", status: "In Progress", priority: "Medium" },
  { id: "13", tenderSearchId: "TSR-2024-2146", workName: "Elevator Supply & Installation", organization: "DPHE", source: "e-GP Portal", searchDate: "2024-05-03", assignedTo: TEAM_MEMBERS[2]!, nextFollowUp: "2024-05-11", status: "Qualified", priority: "High" },
  { id: "14", tenderSearchId: "TSR-2024-2145", workName: "Network Cabling & Switching", organization: "BUP", source: "Direct Contact", searchDate: "2024-05-02", assignedTo: TEAM_MEMBERS[3]!, nextFollowUp: "2024-05-10", status: "New", priority: "Low" },
  { id: "15", tenderSearchId: "TSR-2024-2144", workName: "Drainage Improvement Works", organization: "WASA", source: "Newspaper", searchDate: "2024-05-01", assignedTo: TEAM_MEMBERS[4]!, nextFollowUp: "2024-05-09", status: "Closed", priority: "Medium" },
  { id: "16", tenderSearchId: "TSR-2024-2143", workName: "Air Conditioning System Supply", organization: "RHD", source: "e-GP Portal", searchDate: "2024-04-30", assignedTo: TEAM_MEMBERS[0]!, nextFollowUp: "2024-05-08", status: "In Progress", priority: "High" },
  { id: "17", tenderSearchId: "TSR-2024-2142", workName: "Solar Street Light Installation", organization: "CAAB", source: "Email", searchDate: "2024-04-29", assignedTo: TEAM_MEMBERS[1]!, nextFollowUp: "2024-05-07", status: "Qualified", priority: "Medium" },
  { id: "18", tenderSearchId: "TSR-2024-2141", workName: "Perimeter Fencing Works", organization: "LGED", source: "e-GP Portal", searchDate: "2024-04-28", assignedTo: TEAM_MEMBERS[2]!, nextFollowUp: "2024-05-06", status: "New", priority: "Low" },
  { id: "19", tenderSearchId: "TSR-2024-2140", workName: "Computer Lab Setup", organization: "DPHE", source: "Direct Contact", searchDate: "2024-04-27", assignedTo: TEAM_MEMBERS[3]!, nextFollowUp: "2024-05-05", status: "In Progress", priority: "Medium" },
  { id: "20", tenderSearchId: "TSR-2024-2139", workName: "Bridge Repair & Maintenance", organization: "RHD", source: "Newspaper", searchDate: "2024-04-26", assignedTo: TEAM_MEMBERS[4]!, nextFollowUp: "2024-05-04", status: "Closed", priority: "High" },
  { id: "21", tenderSearchId: "TSR-2024-2138", workName: "Public Address System Upgrade", organization: "BUP", source: "e-GP Portal", searchDate: "2024-04-25", assignedTo: TEAM_MEMBERS[0]!, nextFollowUp: "2024-05-03", status: "Qualified", priority: "Low" },
  { id: "22", tenderSearchId: "TSR-2024-2137", workName: "Overhead Water Tank Construction", organization: "WASA", source: "Email", searchDate: "2024-04-24", assignedTo: TEAM_MEMBERS[1]!, nextFollowUp: "2024-05-02", status: "New", priority: "Medium" },
  { id: "23", tenderSearchId: "TSR-2024-2136", workName: "Substation Equipment Supply", organization: "CAAB", source: "e-GP Portal", searchDate: "2024-04-23", assignedTo: TEAM_MEMBERS[2]!, nextFollowUp: "2024-05-01", status: "In Progress", priority: "High" },
  { id: "24", tenderSearchId: "TSR-2024-2135", workName: "Landscaping & Horticulture Works", organization: "LGED", source: "Direct Contact", searchDate: "2024-04-22", assignedTo: TEAM_MEMBERS[3]!, nextFollowUp: "2024-04-30", status: "Closed", priority: "Low" },
];

export const SEARCH_ACTIVITY_TOTAL_ENTRIES = TENDER_SEARCH_ACTIVITIES.length;

export interface SearchActivityShareItem {
  member: TeamMember;
  count: number;
}

export const SEARCH_ACTIVITY_SHARE: SearchActivityShareItem[] = [
  { member: TEAM_MEMBERS[0]!, count: 31 },
  { member: TEAM_MEMBERS[1]!, count: 28 },
  { member: TEAM_MEMBERS[2]!, count: 25 },
  { member: TEAM_MEMBERS[3]!, count: 22 },
  { member: TEAM_MEMBERS[4]!, count: 14 },
  { member: { id: "others", name: "Others", initial: "O", color: "#94A3B8" }, count: 8 },
];

export interface TenderCostingRow {
  id: string;
  tenderId: string;
  workName: string;
  estimatedCost: number;
  ourCost: number;
  marginPercent: number;
  status: CostingStatus;
}

export const TENDER_COSTING_ROWS: TenderCostingRow[] = [
  { id: "1", tenderId: "TDR-2024-1258", workName: "Supply of LED Display System", estimatedCost: 1_250_000, ourCost: 1_180_000, marginPercent: 5.6, status: "Completed" },
  { id: "2", tenderId: "TDR-2024-1257", workName: "PA System for Conf. Room", estimatedCost: 850_000, ourCost: 790_000, marginPercent: 7.06, status: "Completed" },
  { id: "3", tenderId: "TDR-2024-1256", workName: "Access Control System", estimatedCost: 680_000, ourCost: 630_000, marginPercent: 7.35, status: "In Progress" },
  { id: "4", tenderId: "TDR-2024-1255", workName: "ICT Equipment Supply", estimatedCost: 2_100_000, ourCost: 1_950_000, marginPercent: 7.14, status: "In Progress" },
  { id: "5", tenderId: "TDR-2024-1254", workName: "Solar Power System", estimatedCost: 1_750_000, ourCost: 1_620_000, marginPercent: 7.43, status: "Pending" },
];

export interface SltCalculationRow {
  id: string;
  tenderId: string;
  workName: string;
  organization: string;
  sltAmount: number;
  status: CostingStatus;
}

export const SLT_CALCULATION_ROWS: SltCalculationRow[] = [
  { id: "1", tenderId: "TDR-2024-1258", workName: "Supply of LED Display System", organization: "DPHE", sltAmount: 125_000, status: "Completed" },
  { id: "2", tenderId: "TDR-2024-1257", workName: "PA System for Conf. Room", organization: "BUP", sltAmount: 85_000, status: "Completed" },
  { id: "3", tenderId: "TDR-2024-1256", workName: "Access Control System", organization: "CAAB", sltAmount: 68_000, status: "In Progress" },
  { id: "4", tenderId: "TDR-2024-1255", workName: "ICT Equipment Supply", organization: "LGED", sltAmount: 210_000, status: "Pending" },
  { id: "5", tenderId: "TDR-2024-1254", workName: "Solar Power System", organization: "WASA", sltAmount: 175_000, status: "Pending" },
];

export interface ItemPriceHistoryRow {
  id: string;
  itemDescription: string;
  brandModel: string;
  supplier: string;
  latestPrice: number;
  updatedOn: string;
}

export const ITEM_PRICE_HISTORY_ROWS: ItemPriceHistoryRow[] = [
  { id: "1", itemDescription: "LED Display (2.5)", brandModel: "Novastar VX400", supplier: "Winiry Tech", latestPrice: 1_250_000, updatedOn: "2024-05-20" },
  { id: "2", itemDescription: "PA System 500W", brandModel: "TOA A-2120", supplier: "SoundTech BD", latestPrice: 85_000, updatedOn: "2024-05-18" },
  { id: "3", itemDescription: "Access Control", brandModel: "ZKTeco F18", supplier: "SecureTech", latestPrice: 68_000, updatedOn: "2024-05-15" },
  { id: "4", itemDescription: "Solar Panel 550W", brandModel: "Canadian Solar", supplier: "Solar Mart", latestPrice: 17_200, updatedOn: "2024-05-12" },
  { id: "5", itemDescription: "UPS 3KVA", brandModel: "APC Smart-UPS", supplier: "ElectroMart", latestPrice: 45_500, updatedOn: "2024-05-10" },
];
