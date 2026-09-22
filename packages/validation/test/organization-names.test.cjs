const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createOrganizationMasterSchema } = require("../dist/index.js");

test("organization names retain spaces and case without normalization", () => {
  const input = { shortName: " Mixed  Name ", fullName: " Exact Full Name " };
  assert.deepEqual(createOrganizationMasterSchema.parse(input), input);
  assert.equal(createOrganizationMasterSchema.safeParse({ shortName: "", fullName: "Name" }).success, false);
});

test("organization name limits match cloud surrogate-pair and presentation-selector boundaries", () => {
  for (const character of ["A", "ক", "😀", "☑️", "☑︎", "😀️"]) {
    const accepted = { shortName: character.repeat(50), fullName: character.repeat(200) };
    assert.deepEqual(createOrganizationMasterSchema.parse(accepted), accepted);
    assert.equal(createOrganizationMasterSchema.safeParse({ ...accepted, shortName: character.repeat(51) }).success, false);
    assert.equal(createOrganizationMasterSchema.safeParse({ ...accepted, fullName: character.repeat(201) }).success, false);
  }
});

test("standalone presentation selectors retain the cloud validator's counting behavior", () => {
  assert.equal(createOrganizationMasterSchema.safeParse({ shortName: "️".repeat(51), fullName: "Name" }).success, false);
  assert.equal(createOrganizationMasterSchema.safeParse({ shortName: "a️️".repeat(25), fullName: "Name" }).success, true);
  assert.equal(createOrganizationMasterSchema.safeParse({ shortName: "a️️".repeat(26), fullName: "Name" }).success, false);
});
