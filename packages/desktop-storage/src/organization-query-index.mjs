import { fail } from "./errors.mjs";

// Query metadata is additive: prior domain/outbox tables and migration bytes stay intact.
export const ORGANIZATION_QUERY_INDEX_MIGRATION = { version: 4, sql: `
CREATE TABLE organization_query_index (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  body TEXT CHECK(body IS NULL OR json_valid(body))
);
INSERT INTO organization_query_index(singleton,body) VALUES(1,NULL);
` };

function invalid(message) { fail("INVALID_MASTER", `Organization query index ${message}`); }
function postgresText(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("\0") &&
    ![...value].some(character => { const code = character.codePointAt(0); return code >= 0xD800 && code <= 0xDFFF; });
}

/** Validate the cloud's collation order/folding data without substituting host locale rules. */
export function organizationQueryIndex(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 3 || Object.keys(value).some(key => !["formatVersion", "orderedIds", "caseMappings"].includes(key)) ||
      value.formatVersion !== 1 || !Array.isArray(value.orderedIds) || !Array.isArray(value.caseMappings)) invalid("has an unsupported shape");
  const ids = new Set();
  const orderedIds = Array.from(value.orderedIds, id => {
    if (!postgresText(id) || id.length > 512 || ids.has(id)) invalid("contains an invalid or duplicate ID");
    ids.add(id); return id;
  });
  const sources = new Set();
  const caseMappings = Array.from(value.caseMappings, pair => {
    if (!Array.isArray(pair) || pair.length !== 2 || !postgresText(pair[0]) || [...pair[0]].length !== 1 ||
        !postgresText(pair[1]) || sources.has(pair[0])) invalid("contains an invalid or duplicate case mapping");
    sources.add(pair[0]); return [pair[0], pair[1]];
  });
  return { formatVersion: 1, orderedIds, caseMappings };
}
