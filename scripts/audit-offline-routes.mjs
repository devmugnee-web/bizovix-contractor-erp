/** Source-only coverage inventory: never loads the application, .env or a database. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => !["--write", "--json"].includes(argument))) throw new Error("Use --write and/or --json");

const localBusinessRoutes = new Set(["master-categories", "uoms", "payment-terms"].flatMap((base) => [
  `GET /${base}`, `POST /${base}`, `PATCH /${base}/:id`,
]));
for (const route of ["GET /organizations", "GET /organizations/all", "POST /organizations"]) localBusinessRoutes.add(route);
const localSessionRoutes = new Set(["POST /auth/login", "POST /auth/refresh", "POST /auth/logout", "GET /auth/me"]);
const verbs = new Map(["Get", "Post", "Put", "Patch", "Delete", "Options", "Head", "All"].map((name) => [name, name.toUpperCase()]));
const unresolved = [];
const routes = [];
let controllerClasses = 0;

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : entry.name.endsWith(".controller.ts") ? [full] : [];
  });
}
function decorators(node) {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).flatMap((decorator) => {
    const expression = decorator.expression;
    return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)
      ? [{ name: expression.expression.text, args: [...expression.arguments] }]
      : [];
  });
}
function literal(node) {
  if (node === undefined) return [""];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map(literal);
    return values.some((value) => value === null) ? null : values.flat();
  }
  return null;
}
function classification(key) {
  if (localBusinessRoutes.has(key)) return "local-business";
  if (localSessionRoutes.has(key)) return "local-session";
  if (key === "POST /auth/dev-login") return "desktop-disabled";
  return "cloud-required";
}

const controllerFiles = files(path.join(root, "apps/api/src"));
for (const filename of controllerFiles) {
  const relative = path.relative(root, filename).replaceAll(path.sep, "/");
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let foundController = false;
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const controller = decorators(statement).find((entry) => entry.name === "Controller");
    if (!controller) continue;
    foundController = true;
    controllerClasses++;
    if (statement.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)) {
      unresolved.push({ file: relative, kind: "inherited-routes", expression: statement.heritageClauses.map((clause) => clause.getText(source)).join(" ") });
    }
    const bases = literal(controller.args[0]);
    if (!bases) { unresolved.push({ file: relative, kind: "controller", expression: controller.args[0].getText(source) }); continue; }
    const classPermissions = decorators(statement).filter((entry) => entry.name === "RequirePermissions").flatMap((entry) => entry.args.flatMap((argument) => literal(argument) ?? [argument.getText(source)]));
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) continue;
      const metadata = decorators(member);
      const permissions = metadata.filter((entry) => entry.name === "RequirePermissions").flatMap((entry) => entry.args.flatMap((argument) => literal(argument) ?? [argument.getText(source)]));
      for (const decorator of metadata.filter((entry) => verbs.has(entry.name))) {
        const suffixes = literal(decorator.args[0]);
        if (!suffixes) { unresolved.push({ file: relative, kind: "route", expression: decorator.args[0].getText(source) }); continue; }
        for (const base of bases) for (const suffix of suffixes) {
          const route = `/${[base, suffix].filter(Boolean).join("/")}`.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
          const method = verbs.get(decorator.name), key = `${method} ${route}`;
          const moduleName = relative.split("/modules/")[1]?.split("/")[0] ?? "application";
          routes.push({ module: moduleName, method, route, desktop: classification(key),
            permissions: permissions.length ? permissions : classPermissions, file: relative,
            line: source.getLineAndCharacterOfPosition(member.getStart(source)).line + 1 });
        }
      }
    }
  }
  if (!foundController) unresolved.push({ file: relative, kind: "controller-not-recognized", expression: "Review aliases, namespaces or generated controller declarations" });
}
routes.sort((a, b) => a.module.localeCompare(b.module) || a.route.localeCompare(b.route) || a.method.localeCompare(b.method));
const counts = Object.fromEntries(["local-business", "local-session", "desktop-disabled", "cloud-required"].map((kind) => [kind, routes.filter((route) => route.desktop === kind).length]));
const missingLocalRoutes = [...localBusinessRoutes, ...localSessionRoutes].filter((key) => !routes.some((route) => `${route.method} ${route.route}` === key));
const modules = [...new Set(routes.map((route) => route.module))].map((name) => {
  const entries = routes.filter((route) => route.module === name);
  return { name, endpoints: entries.length, localBusiness: entries.filter((route) => route.desktop === "local-business").length,
    localSession: entries.filter((route) => route.desktop === "local-session").length,
    cloudRequired: entries.filter((route) => route.desktop === "cloud-required").length,
    desktopDisabled: entries.filter((route) => route.desktop === "desktop-disabled").length };
});
const report = { generatedAt: new Date().toISOString(), scope: "Static Nest controller inventory. Local classification is an explicit reviewed allowlist, not a business-parity test. Cloud-required includes intentional SaaS control-plane APIs; it is not a claim that every such endpoint should become offline.",
  permissionScope: "RequirePermissions declarations only; JWT, licensing, vendor and service-level checks remain separate.",
  localConditions: "Bound signed account, valid offline grant and permissions. UOM/Payment Terms/Organizations also require signed capabilities and initialized snapshots. Organization search/create require authenticated membership, while /organizations/all additionally requires masters.read and organizationMaster.list. Business pickers exclude pending/rejected organization creates. Web counterparts still use PostgreSQL.",
  localOnlyRoutes: ["GET /desktop/status", "POST /desktop/sync", "POST /desktop/backup", "GET /desktop/organization-drafts", "GET /desktop/organization-drafts/:id", "PATCH /desktop/organization-drafts/:id"],
  controllerFiles: controllerFiles.length, controllerClasses, endpoints: routes.length, counts, modules, unresolved, missingLocalRoutes, routes };
if (!routes.length || unresolved.length || missingLocalRoutes.length) {
  process.exitCode = 1;
  console.error(JSON.stringify({ unresolved, missingLocalRoutes, reason: "Incomplete inventory; no completion claim is allowed" }, null, 2));
}
if (arguments_.includes("--write") && !process.exitCode) {
  const destination = path.join(root, "docs/offline-first/route-coverage.json");
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, destination)}`);
}
if (arguments_.includes("--json")) console.log(JSON.stringify(report, null, 2));
else console.log(JSON.stringify({ endpoints: report.endpoints, controllerFiles: report.controllerFiles, controllerClasses, counts, modules: modules.length, unresolved: unresolved.length, missingLocalRoutes }, null, 2));
