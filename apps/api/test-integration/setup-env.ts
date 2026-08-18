const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL is required; refusing to use DATABASE_URL");
const url = new URL(raw);
if (!url.pathname.toLowerCase().includes("test")) throw new Error("TEST_DATABASE_URL database name must contain test");
if (process.env.DATABASE_URL && raw === process.env.DATABASE_URL && process.env.INTEGRATION_DB_VALIDATED !== "1") {
  throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL unless the fail-closed runner validated it");
}
process.env.DATABASE_URL = raw;
process.env.APP_ENV = "test";
process.env.JWT_ACCESS_SECRET ||= "bizovix-integration-access-secret";
process.env.JWT_REFRESH_SECRET ||= "bizovix-integration-refresh-secret";
