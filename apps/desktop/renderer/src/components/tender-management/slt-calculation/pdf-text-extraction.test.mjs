import assert from "node:assert/strict";
import { extractOpeningReportTable } from "./pdf-text-extraction.ts";

const markerPage = {
  width: 600,
  height: 800,
  items: [
    { text: "Opening Report Header", x: 40, y: 700, width: 142 },
    { text: "(1)", x: 45, y: 665, width: 15 },
    { text: "(2)", x: 185, y: 665, width: 15 },
    { text: "(3)", x: 355, y: 665, width: 15 },
    { text: "(6)", x: 550, y: 665, width: 15 },
    { text: "1", x: 49, y: 625, width: 7 },
    { text: "M/S. Exact Bidder", x: 95, y: 625, width: 110 },
    { text: "3,000,000.000", x: 350, y: 625, width: 80 },
    { text: "3,126,700.000", x: 500, y: 625, width: 85 },
    { text: "Opening Report Footer", x: 40, y: 580, width: 140 },
  ],
};

assert.deepEqual(extractOpeningReportTable([markerPage]), [
  { serial: "1", name: "M/S. Exact Bidder", amount: "3126700.000" },
]);

const semanticPage = {
  width: 1900,
  height: 900,
  items: [
    { text: "Opening Report Header", x: 850, y: 700, width: 180 },
    { text: "S. No", x: 35, y: 660, width: 50 },
    { text: "Name of Tenderer", x: 200, y: 660, width: 150 },
    { text: "Quoted Amount (in BDT) Without Discount", x: 520, y: 660, width: 340 },
    { text: "Quoted Amount (in BDT) with Discount", x: 1550, y: 660, width: 320 },
    { text: "1", x: 52, y: 620, width: 8 },
    { text: "Mahmood & Co.", x: 100, y: 620, width: 120 },
    { text: "3064320.000", x: 790, y: 620, width: 100 },
    { text: "3064320.000", x: 1770, y: 620, width: 105 },
    { text: "Opening Report Footer", x: 20, y: 550, width: 180 },
  ],
};

assert.deepEqual(extractOpeningReportTable([semanticPage]), [
  { serial: "1", name: "Mahmood & Co.", amount: "3064320.000" },
]);

console.log("SLT PDF table extraction tests passed.");
