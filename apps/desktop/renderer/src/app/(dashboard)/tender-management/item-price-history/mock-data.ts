// Item Price History has no backend yet — this whole page is UI-only mock
// data, same as Tender Costing. The first 10 rows match the reference
// design's sample data exactly; the rest are generated deterministically
// (integer-mixing hash on the row index — see feedback memory on why a
// naive string hash of "field-${i}" templates was wrong here) so
// pagination/sorting/filtering stay stable across re-renders.

export type ChangeType = "Increased" | "Decreased" | "No Change";
export type PriceSource = "Tender Costing" | "Vendor Update" | "Negotiation";

export interface PriceHistoryPerson {
  name: string;
  initial: string;
  color: string;
}

export const PRICE_HISTORY_PEOPLE: PriceHistoryPerson[] = [
  { name: "Arifur Rahman", initial: "A", color: "#2563EB" },
  { name: "Naimul Islam", initial: "N", color: "#059669" },
  { name: "Rokon Hossain", initial: "R", color: "#F97316" },
  { name: "Mithun Roy", initial: "M", color: "#7C3AED" },
  { name: "Samiul Islam", initial: "S", color: "#64748B" },
];

export const UOM_OPTIONS = ["Nos", "Set", "Lot", "Pcs"];

export const SOURCE_OPTIONS: PriceSource[] = ["Tender Costing", "Vendor Update", "Negotiation"];

export const CHANGE_TYPE_OPTIONS: ChangeType[] = ["Increased", "Decreased", "No Change"];

export interface PriceHistoryRow {
  id: string;
  itemDescription: string;
  brandModel: string;
  supplier: string;
  uom: string;
  previousPrice: number;
  currentPrice: number;
  changeType: ChangeType;
  priceDate: string;
  updatedBy: PriceHistoryPerson;
  source: PriceSource;
}

const SAMPLE_ROWS: PriceHistoryRow[] = [
  {
    id: "1",
    itemDescription: "LED Display (P2.5)",
    brandModel: "Novastar VX400",
    supplier: "Winny Tech",
    uom: "Nos",
    previousPrice: 1_180_000,
    currentPrice: 1_250_000,
    changeType: "Increased",
    priceDate: "2024-05-20",
    updatedBy: PRICE_HISTORY_PEOPLE[0]!,
    source: "Tender Costing",
  },
  {
    id: "2",
    itemDescription: "PA System 500W",
    brandModel: "TOA A-2120",
    supplier: "SoundTech BD",
    uom: "Set",
    previousPrice: 78_000,
    currentPrice: 85_000,
    changeType: "Increased",
    priceDate: "2024-05-18",
    updatedBy: PRICE_HISTORY_PEOPLE[1]!,
    source: "Tender Costing",
  },
  {
    id: "3",
    itemDescription: "Access Control",
    brandModel: "ZKTeco F18",
    supplier: "SecureTech",
    uom: "Nos",
    previousPrice: 63_000,
    currentPrice: 68_000,
    changeType: "Increased",
    priceDate: "2024-05-15",
    updatedBy: PRICE_HISTORY_PEOPLE[2]!,
    source: "Vendor Update",
  },
  {
    id: "4",
    itemDescription: "Solar Panel 550W",
    brandModel: "Canadian Solar",
    supplier: "Solar Mart",
    uom: "Nos",
    previousPrice: 16_200,
    currentPrice: 17_200,
    changeType: "Increased",
    priceDate: "2024-05-12",
    updatedBy: PRICE_HISTORY_PEOPLE[3]!,
    source: "Vendor Update",
  },
  {
    id: "5",
    itemDescription: "UPS 3KVA",
    brandModel: "APC Smart-UPS",
    supplier: "ElectroMart",
    uom: "Nos",
    previousPrice: 42_000,
    currentPrice: 45_500,
    changeType: "Increased",
    priceDate: "2024-05-10",
    updatedBy: PRICE_HISTORY_PEOPLE[0]!,
    source: "Tender Costing",
  },
  {
    id: "6",
    itemDescription: "ICT Equipment Supply",
    brandModel: "Mixed Items",
    supplier: "LGED",
    uom: "Lot",
    previousPrice: 1_950_000,
    currentPrice: 1_950_000,
    changeType: "No Change",
    priceDate: "2024-05-10",
    updatedBy: PRICE_HISTORY_PEOPLE[4]!,
    source: "Tender Costing",
  },
  {
    id: "7",
    itemDescription: "Supply of LED Display System",
    brandModel: "Novastar VX400",
    supplier: "Winny Tech",
    uom: "Nos",
    previousPrice: 1_250_000,
    currentPrice: 1_180_000,
    changeType: "Decreased",
    priceDate: "2024-05-08",
    updatedBy: PRICE_HISTORY_PEOPLE[1]!,
    source: "Negotiation",
  },
  {
    id: "8",
    itemDescription: "Conference Room System",
    brandModel: "BOSCH CCS 1000D",
    supplier: "BUP",
    uom: "Set",
    previousPrice: 850_000,
    currentPrice: 820_000,
    changeType: "Decreased",
    priceDate: "2024-05-07",
    updatedBy: PRICE_HISTORY_PEOPLE[2]!,
    source: "Vendor Update",
  },
  {
    id: "9",
    itemDescription: "Fire Alarm System",
    brandModel: "Honeywell NFS2-640",
    supplier: "SecureTech",
    uom: "Set",
    previousPrice: 165_000,
    currentPrice: 150_000,
    changeType: "Decreased",
    priceDate: "2024-05-05",
    updatedBy: PRICE_HISTORY_PEOPLE[3]!,
    source: "Vendor Update",
  },
  {
    id: "10",
    itemDescription: "Networking Equipment",
    brandModel: "Cisco SG250-26",
    supplier: "BCMCL",
    uom: "Nos",
    previousPrice: 28_500,
    currentPrice: 30_000,
    changeType: "Increased",
    priceDate: "2024-05-04",
    updatedBy: PRICE_HISTORY_PEOPLE[0]!,
    source: "Tender Costing",
  },
];

const ITEM_TEMPLATES = [
  ["CCTV Camera 5MP", "Hikvision DS-2CE"],
  ["Water Pump 2HP", "Grundfos CR Series"],
  ["Air Conditioner 2 Ton", "Carrier XPower"],
  ["Server Rack 42U", "APC NetShelter"],
  ["Fiber Optic Cable", "Corning SMF-28"],
  ["Biometric Scanner", "Suprema BioStation"],
  ["Projector 5000 Lumens", "Epson EB-2250U"],
  ["Interactive Whiteboard", "SMART Board 6000"],
  ["Generator 100KVA", "Cummins C100D5"],
  ["Voltage Stabilizer", "Servo Digital"],
  ["Fire Extinguisher", "Ceasefire ABC"],
  ["Smoke Detector", "System Sensor"],
  ["Router Enterprise", "Cisco ISR4331"],
  ["Switch 48 Port", "Juniper EX3400"],
  ["Laptop Business", "Dell Latitude 5540"],
  ["Desktop Workstation", "HP Z2 Tower"],
  ["Printer Laser", "HP LaserJet Pro"],
  ["Scanner Document", "Fujitsu fi-7160"],
  ["Cable Tray Galvanized", "Legrand"],
  ["Circuit Breaker", "Schneider Electric"],
] as const;

const SUPPLIER_OPTIONS = [
  "Winny Tech",
  "SoundTech BD",
  "SecureTech",
  "Solar Mart",
  "ElectroMart",
  "LGED",
  "BUP",
  "BCMCL",
  "TechSource BD",
  "National Traders",
  "City Enterprise",
  "Prime Suppliers",
  "Global Tech Ltd",
  "Reliable Vendors",
  "Standard Trading",
];

// Integer hash (Thomas Wang mix) — a simple string hash on "field-${i}"
// templates has poor avalanche for sequential inputs and clusters values.
function hashSeed(index: number, salt: number): number {
  let x = (index * 7919 + salt) | 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) | 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) | 0;
  x = (x >> 16) ^ x;
  return Math.abs(x);
}

const ITEM_SALT = 131;
const SUPPLIER_SALT = 233;
const UOM_SALT = 337;
const PRICE_SALT = 439;
const CHANGE_TYPE_SALT = 541;
const INCREASE_PCT_SALT = 643;
const DECREASE_PCT_SALT = 751;
const DAYS_SALT = 857;
const PERSON_SALT = 953;

const TOTAL_ROWS = 1256;
const INCREASED_COUNT = 752;
const DECREASED_COUNT = 412;
const NO_CHANGE_COUNT = 92;
const EXTRA_COUNT = TOTAL_ROWS - SAMPLE_ROWS.length;

const sampleChangeCounts = SAMPLE_ROWS.reduce(
  (acc, row) => ({ ...acc, [row.changeType]: acc[row.changeType] + 1 }),
  { Increased: 0, Decreased: 0, "No Change": 0 } as Record<ChangeType, number>,
);

const extraChangeTypePool: ChangeType[] = [
  ...Array.from({ length: INCREASED_COUNT - sampleChangeCounts.Increased }, () => "Increased" as const),
  ...Array.from({ length: DECREASED_COUNT - sampleChangeCounts.Decreased }, () => "Decreased" as const),
  ...Array.from({ length: NO_CHANGE_COUNT - sampleChangeCounts["No Change"] }, () => "No Change" as const),
]
  .map((changeType, i) => ({ changeType, sortKey: hashSeed(i, CHANGE_TYPE_SALT) }))
  .sort((a, b) => a.sortKey - b.sortKey)
  .map((x) => x.changeType);

const extraRows: PriceHistoryRow[] = Array.from({ length: EXTRA_COUNT }, (_, i) => {
  const [itemDescription, brandModel] = ITEM_TEMPLATES[hashSeed(i, ITEM_SALT) % ITEM_TEMPLATES.length]!;
  const supplier = SUPPLIER_OPTIONS[hashSeed(i, SUPPLIER_SALT) % SUPPLIER_OPTIONS.length]!;
  const uom = UOM_OPTIONS[hashSeed(i, UOM_SALT) % UOM_OPTIONS.length]!;
  const previousPrice = 15_000 + (hashSeed(i, PRICE_SALT) % 400) * 5_000;
  const changeType = extraChangeTypePool[i]!;

  let currentPrice = previousPrice;
  if (changeType === "Increased") {
    const pct = 8 + (hashSeed(i, INCREASE_PCT_SALT) % 1100) / 100; // 8.00 - 18.99%
    currentPrice = Math.round((previousPrice * (1 + pct / 100)) / 100) * 100;
  } else if (changeType === "Decreased") {
    const pct = 2 + (hashSeed(i, DECREASE_PCT_SALT) % 500) / 100; // 2.00 - 6.99%
    currentPrice = Math.round((previousPrice * (1 - pct / 100)) / 100) * 100;
  }

  const cumulativeDays = 3 + i * 2 + (hashSeed(i, DAYS_SALT) % 3);
  const priceDate = new Date(2024, 4, 4);
  priceDate.setDate(priceDate.getDate() - cumulativeDays);

  return {
    id: `extra-${i}`,
    itemDescription,
    brandModel,
    supplier,
    uom,
    previousPrice,
    currentPrice,
    changeType,
    priceDate: priceDate.toISOString().slice(0, 10),
    updatedBy: PRICE_HISTORY_PEOPLE[hashSeed(i, PERSON_SALT) % PRICE_HISTORY_PEOPLE.length]!,
    source: SOURCE_OPTIONS[hashSeed(i, SUPPLIER_SALT + 1) % SOURCE_OPTIONS.length]!,
  };
});

export const PRICE_HISTORY_ROWS: PriceHistoryRow[] = [...SAMPLE_ROWS, ...extraRows];
