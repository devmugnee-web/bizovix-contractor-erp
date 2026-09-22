import { LocalError } from "./security.mjs";

// Match Prisma's PostgreSQL `contains` pattern (%...%) without evaluating an
// arbitrary regular expression. LIKE wildcards remain compatible with web search.
const asciiCaseMappings = Array.from({ length: 26 }, (_, index) => [String.fromCharCode(65 + index), String.fromCharCode(97 + index)]);
export function containsPattern(search, caseMappings = asciiCaseMappings) {
  const mapping = new Map(caseMappings);
  // A missing mapping means identity. JS/ICU lowercasing differs from PostgreSQL
  // libc for characters such as dotted I and capital sharp S on Windows.
  const lower = (value) => [...value].map((character) => mapping.get(character) ?? character).join("");
  const source = [...`%${lower(search)}%`];
  const pattern = [];
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (character === "\\") pattern.push({ literal: source[++i] });
    else if (character === "%" || character === "_") pattern.push({ wildcard: character });
    else pattern.push({ literal: character });
  }
  return (value) => {
    const characters = [...lower(value)];
    let previous = new Uint8Array(characters.length + 1); previous[0] = 1;
    for (const token of pattern) {
      const next = new Uint8Array(characters.length + 1);
      if (token.wildcard === "%") next[0] = previous[0];
      for (let index = 1; index <= characters.length; index += 1) {
        next[index] = token.wildcard === "%" ? previous[index] || next[index - 1]
          : previous[index - 1] && (token.wildcard === "_" || token.literal === characters[index - 1]);
      }
      previous = next;
    }
    return Boolean(previous[characters.length]);
  };
}

export function queryOrganizations(store, url, mapRecord = (value) => value) {
  const paginated = url.pathname === "/organizations/all";
  const params = url.searchParams;
  const known = new Set(["search", "includeLocal", ...(paginated ? ["page", "limit", "fromDate", "toDate"] : [])]);
  for (const name of new Set(params.keys())) {
    if ((paginated && !known.has(name)) || (known.has(name) && params.getAll(name).length !== 1)) throw new LocalError(400, "Invalid organization query.");
  }
  const includeLocal = params.get("includeLocal");
  if (includeLocal !== null && !["true", "false"].includes(includeLocal)) throw new LocalError(400, "Invalid local draft option.");
  const integer = (name, fallback) => {
    const value = params.has(name) ? Number(params.get(name)) : fallback;
    if (!Number.isSafeInteger(value) || value < 1) throw new LocalError(400, `${name} must be a positive integer.`);
    return value;
  };
  const page = paginated ? integer("page", 1) : 1;
  const limit = paginated ? integer("limit", 8) : undefined;
  if (paginated && !Number.isSafeInteger((page - 1) * limit)) throw new LocalError(400, "Requested page is too large.");
  const search = paginated ? params.get("search") ?? "" : (params.get("search") ?? "").trim();
  if (!paginated && search.length === 1) return [];
  // Business pickers must never reference an ID that only exists in an outbox.
  // Filter BEFORE caps, total count and pagination, not in the renderer afterward.
  const index = store.readOrganizationQueryIndex();
  if (!index) throw new LocalError(503, "Connect and sync organizations before searching them offline.", "MODULE_BOOTSTRAP_REQUIRED");
  const rows = store.listMasters("organizationMaster", { includeLocalDrafts: includeLocal === "true" });
  const accepted = new Map(rows.filter((row) => row.syncStatus === "SYNCED").map((row) => [row.id, row]));
  const drafts = rows.filter((row) => row.syncStatus !== "SYNCED").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  // Server collation determines accepted ordering, including punctuation and
  // Unicode. Unaccepted management drafts are shown first, outside that order.
  const ordered = [...drafts, ...index.orderedIds.flatMap((id) => accepted.has(id) ? [accepted.get(id)] : [])];
  const match = search ? containsPattern(search, index.caseMappings) : () => true;
  const filtered = ordered.filter((row) => match(row.shortName) || match(row.fullName));
  if (!paginated) return filtered.slice(0, search.length >= 2 ? 20 : 100).map(mapRecord);
  return { items: filtered.slice((page - 1) * limit, page * limit).map(mapRecord),
    meta: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) } };
}
