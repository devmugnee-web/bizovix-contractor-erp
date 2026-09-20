import assert from "node:assert/strict";
import { calculateMetrics, classifyBidders } from "./calculator.ts";

const bidders = [
  { id: "one", name: "Bidder One", amount: "900,000", included: true },
  { id: "two", name: "Bidder Two", amount: "1,100,000", included: true },
  { id: "excluded", name: "Excluded", amount: "1", included: false },
];

const metrics = calculateMetrics(bidders, 1_000_000, 89);
assert.equal(metrics.totalValidBidders, 2);
assert.equal(metrics.averageBid, 1_000_000);
assert.equal(metrics.nppiAmount, 890_000);
assert.equal(metrics.weightedAverage, 967_000);
assert.ok(metrics.standardDeviation > 0);

const classified = classifyBidders(bidders, 1_000_000, metrics.sltPrice);
assert.equal(classified.valid.length, 2);
assert.equal(classified.nonResponsive.length + classified.responsive.length, 2);
assert.equal(
  classified.valid.some((bidder) => bidder.name === "Excluded"),
  false,
);

console.log("SLT calculator tests passed.");
