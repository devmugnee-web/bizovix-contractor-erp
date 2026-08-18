import { spawnSync } from "node:child_process";

function checkedTestUrl() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is required; integration tests never fall back to DATABASE_URL");
  const test = new URL(raw);
  const database = test.pathname.replace(/^\//, "").toLowerCase();
  if (!database.includes("test")) throw new Error(`Refusing unsafe TEST_DATABASE_URL database name: ${database}`);
  if (process.env.DATABASE_URL && raw === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  return raw;
}

const testUrl = checkedTestUrl();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  INTEGRATION_DB_VALIDATED: "1",
  APP_ENV: "test",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "bizovix-integration-access-secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "bizovix-integration-refresh-secret",
};
const root = new URL("../../../", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1");
const processOptions = { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" };
const migrate = spawnSync(pnpm, ["--filter", "@bizovix/database", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], processOptions);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const jestArgs = ["exec", "jest", "--config", "jest.integration.config.js", "--runInBand"];
const tests = spawnSync(pnpm, jestArgs, { ...processOptions, cwd: new URL("../", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1") });
process.exit(tests.status ?? 1);
