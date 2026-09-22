/**
 * Read-only source inventory for the desktop/offline migration.
 * Never reads .env, connects to a database, or changes application files.
 * Usage: node scripts/audit-offline-readiness.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const normalized = (value) => value.split(path.sep).join("/");

function filesIn(relative, extension) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...filesIn(child, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) result.push(child);
  }
  return result.sort();
}

function locations(files, pattern) {
  const result = [];
  for (const file of files) {
    const lines = read(file).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) result.push({ file: normalized(file), line: index + 1 });
    });
  }
  return result;
}

function installedVersion(packagePath, dependency) {
  try {
    const require = createRequire(path.join(root, packagePath));
    return require(`${dependency}/package.json`).version;
  } catch {
    return "not installed";
  }
}

const schemaPath = "packages/database/prisma/schema.prisma";
const schema = read(schemaPath);
const enumNames = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]));
const builtInScalarNames = new Set(["String", "Int", "BigInt", "Float", "Boolean", "DateTime", "Decimal", "Json", "Bytes"]);
const modelFields = [];
let model = null;
for (const [index, raw] of schema.split(/\r?\n/).entries()) {
  const line = raw.replace(/\/\/.*$/, "").trim();
  const start = /^model\s+(\w+)\s*\{/.exec(line);
  if (start) { model = start[1]; continue; }
  if (model && line === "}") { model = null; continue; }
  if (!model) continue;
  const field = /^(\w+)\s+(\w+)(\[\]|\?)?(?:\s|$)/.exec(line);
  if (!field) continue;
  const native = /@db\.(\w+)(?:\(([^)]*)\))?/.exec(line);
  modelFields.push({
    model, field: field[1], type: field[2], modifier: field[3] ?? "",
    native: native?.[1] ?? null, nativeArguments: native?.[2]?.replace(/\s/g, "") ?? null,
    line: index + 1,
  });
}
const decimals = modelFields.filter((field) => field.type === "Decimal");
const decimalScales = {};
for (const field of decimals) {
  const key = field.nativeArguments ?? "default";
  decimalScales[key] = (decimalScales[key] ?? 0) + 1;
}
const apiFiles = filesIn("apps/api/src/modules", ".ts").filter((file) => !file.endsWith(".spec.ts"));
const migrations = filesIn("packages/database/prisma/migrations", ".sql");
const features = {
  rowLocks: locations(apiFiles, /\bFOR\s+UPDATE\b/i),
  rawSql: locations(apiFiles, /\$(?:queryRaw|executeRaw)/),
  insensitiveSearch: locations(apiFiles, /mode:\s*["']insensitive["']/),
  skipDuplicates: locations(apiFiles, /skipDuplicates:/),
  isolationLevels: locations(apiFiles, /(?:isolationLevel:|TransactionIsolationLevel\.)/),
  databaseAggregations: locations(apiFiles, /\.(?:aggregate|groupBy)\(|\b(?:increment|decrement):/),
  migrationCheckConstraints: locations(migrations, /\bCHECK\s*\(/i),
  migrationWhereCandidates: locations(migrations, /\bWHERE\b/i),
  migrationTriggers: locations(migrations, /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\b/i),
};

const report = {
  purpose: "Source inventory only; not an offline readiness certification or database validation",
  generatedAt: new Date().toISOString(),
  databaseProvider: /datasource\s+db\s*\{[^}]*provider\s*=\s*"([^"]+)"/s.exec(schema)?.[1],
  models: (schema.match(/^model\s+/gm) ?? []).length,
  enums: (schema.match(/^enum\s+/gm) ?? []).length,
  decimalFields: decimals.length,
  decimalTypes: decimalScales,
  largePrecisionDecimalFields: decimals.filter((field) => Number(field.nativeArguments?.split(",")[0]) > 18),
  nativeTypeFields: modelFields.filter((field) => field.native !== null).length,
  jsonFields: modelFields.filter((field) => field.type === "Json").length,
  scalarArrays: modelFields.filter((field) => field.modifier === "[]" && (builtInScalarNames.has(field.type) || enumNames.has(field.type))),
  builtInScalarArrays: modelFields.filter((field) => field.modifier === "[]" && builtInScalarNames.has(field.type)),
  enumArrays: modelFields.filter((field) => field.modifier === "[]" && enumNames.has(field.type)),
  sqlMigrationFiles: migrations.length,
  apiSourceFilesInspected: apiFiles.length,
  installed: {
    node: process.version,
    prismaClient: installedVersion("packages/database/package.json", "@prisma/client"),
    electron: installedVersion("apps/desktop/electron/package.json", "electron"),
  },
  featureLocationCounts: Object.fromEntries(Object.entries(features).map(([key, value]) => [key, value.length])),
  featureLocations: features,
  notes: [
    "Location counts count matching lines, not executed queries or distinct business workflows.",
    "Scalar arrays include built-in and declared enum types; model relationship arrays are excluded. The original inventory omitted Party.roles (PartyRole[]).",
    "migrationWhereCandidates is a WHERE candidate list, not an index count; review complete SQL to classify it.",
    "No environment files, application records, database credentials or external services were read.",
    "Current PostgreSQL provider and application behavior remain unchanged.",
  ],
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  const { featureLocations, ...summary } = report;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write("Use --json for the full file/line inventory.\n");
}
