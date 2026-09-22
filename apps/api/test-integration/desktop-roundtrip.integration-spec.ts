import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { generateKeyPairSync, randomBytes, randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { createInterface } from "readline";
import type { AddressInfo } from "net";
import { createServer, request as relayRequest, type Server } from "http";
import { AppModule } from "../src/app.module";
import { validationExceptionFactory } from "../src/common/utils/validation-exception-factory";
import { PrismaService } from "../src/modules/prisma/prisma.service";
import { assertIsolatedTestDatabase, createIdentityFixture } from "./fixtures";

type Envelope<T> = { success: boolean; data: T; message?: string; code?: string; meta?: { page: number; limit: number; total: number; totalPages: number } };
type Login = { user: { id: string; organizationId: string }; accessToken: string; refreshToken: string };
type Category = { id: string; name: string; version: number; createdAt: string; syncStatus?: string; syncError?: { kind: string; message: string }; cloudCategory?: Category };
type Master = { id: string; name: string; version: number; createdAt: string; code?: string; days?: number; operationId?: string; syncStatus?: string; syncError?: { kind: string; message: string }; cloudRecord?: Master };
type OrganizationMaster = { id: string; organizationId: string; shortName: string; fullName: string; createdAt: string; updatedAt: string; operationId?: string; syncStatus?: string };
type DesktopStatus = { lastSyncError: string | null; storage: { pendingCount: number; rejectedCount: number }; backup: { lastVerifiedAt: string | null; lastError: string | null } };
type OwnedDesktop = { child: ChildProcessWithoutNullStreams; origin: string; capability: string };

/** Real JWT + cloud service + separate Node SQLite process; no mocks, reset or business seed. */
describe("desktop local/cloud HTTP roundtrip", () => {
  let app: INestApplication | null = null;
  let prisma: PrismaService;
  let local: OwnedDesktop | null = null;
  let secondLocal: OwnedDesktop | null = null;
  let gateway: Server | null = null;
  let temporaryRoot: string | undefined;
  const additionalRoots: string[] = [];
  let cloudUrl: string;
  let publicKey: string;
  let fixture: Awaited<ReturnType<typeof createIdentityFixture>>;
  const envKeys = ["DESKTOP_SYNC_ENABLED", "DESKTOP_SYNC_PRIVATE_KEY_PEM", "DESKTOP_SYNC_ISSUER", "DESKTOP_SYNC_OFFLINE_HOURS"] as const;
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));

  async function request<T>(url: string, { method = "GET", body, token, capability }: { method?: string; body?: unknown; token?: string; capability?: string } = {}) {
    const response = await fetch(url, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(capability ? { "X-Bizovix-Local-Capability": capability } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as Envelope<T>;
    return { status: response.status, ...envelope };
  }

  function localRequest<T>(route: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    if (!local) throw new Error("Owned local service is unavailable");
    return request<T>(`${local.origin}/api/v1/${route}`, { ...options, capability: local.capability });
  }

  function desktopRequest<T>(desktop: OwnedDesktop, route: string, options: { method?: string; body?: unknown; token?: string } = {}) {
    return request<T>(`${desktop.origin}/api/v1/${route}`, { ...options, capability: desktop.capability });
  }

  async function startDesktop({ rootDirectory = temporaryRoot!, apiUrl = cloudUrl }: { rootDirectory?: string; apiUrl?: string } = {}): Promise<OwnedDesktop> {
    const capability = randomBytes(32).toString("base64url");
    const instanceId = randomUUID();
    const child = spawn(process.execPath, [path.resolve(__dirname, "../../desktop/local-service/src/main.mjs")], {
      cwd: path.resolve(__dirname, "../../.."), windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      // Do not pass cloud private keys, JWT secrets or database URLs to the desktop process.
      env: {
        SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP,
        PORT: "0", BIZOVIX_LOCAL_DATA_ROOT: rootDirectory, BIZOVIX_LOCAL_CAPABILITY: capability,
        BIZOVIX_LOCAL_INSTANCE_ID: instanceId, BIZOVIX_CLOUD_API_URL: apiUrl,
        BIZOVIX_CLOUD_ISSUER: cloudUrl, BIZOVIX_CLOUD_PUBLIC_KEY: publicKey,
        BIZOVIX_ALLOW_INSECURE_LOCAL_CLOUD: "true",
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-4096); });
    try {
      const port = await new Promise<number>((resolve, reject) => {
        const lines = createInterface({ input: child.stdout });
        const timeout = setTimeout(() => { cleanup(); reject(new Error(`Owned desktop did not become ready: ${stderr}`)); }, 15_000);
        const fail = (error: Error) => { cleanup(); reject(error); };
        const ended = (code: number | null) => fail(new Error(`Owned desktop exited before readiness (${code}): ${stderr}`));
        const cleanup = () => { clearTimeout(timeout); lines.close(); child.off("error", fail); child.off("exit", ended); };
        child.once("error", fail);
        child.once("exit", ended);
        lines.on("line", (line) => {
          try {
            const message = JSON.parse(line) as { type?: string; instanceId?: string; port?: number };
            if (message.type === "ready" && message.instanceId === instanceId && Number.isInteger(message.port) && message.port! > 0) {
              cleanup(); resolve(message.port!);
            }
          } catch { /* Ignore non-protocol diagnostics; they cannot establish readiness. */ }
        });
      });
      return { child, origin: `http://127.0.0.1:${port}`, capability };
    } catch (error) {
      child.kill();
      throw error;
    }
  }

  async function stopDesktop(owned = local) {
    if (!owned) return;
    if (owned.child.exitCode !== null || owned.child.signalCode !== null) {
      if (owned === local) local = null;
      if (owned === secondLocal) secondLocal = null;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { owned.child.kill(); }, 5_000);
      const forcedTimeout = setTimeout(() => { clearTimeout(timeout); reject(new Error("Owned desktop process did not exit; refusing to remove its open data directory")); }, 8_000);
      owned.child.once("exit", () => { clearTimeout(timeout); clearTimeout(forcedTimeout); resolve(); });
      if (!owned.child.stdin.destroyed) owned.child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`);
      else owned.child.kill();
    });
    if (owned === local) local = null;
    if (owned === secondLocal) secondLocal = null;
  }

  async function closeGateway() {
    if (!gateway) return;
    gateway.closeAllConnections();
    await new Promise<void>((resolve) => gateway!.close(() => resolve()));
    gateway = null;
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw new Error("Isolated TEST_DATABASE_URL required");
    const pair = generateKeyPairSync("ed25519");
    publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_ENABLED = "true";
    process.env.DESKTOP_SYNC_PRIVATE_KEY_PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.DESKTOP_SYNC_OFFLINE_HOURS = "24";
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }));
    await app.listen(0, "127.0.0.1");
    cloudUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v1`;
    process.env.DESKTOP_SYNC_ISSUER = cloudUrl;
    prisma = app.get(PrismaService);
    await assertIsolatedTestDatabase(prisma);
    const locale = await prisma.$queryRaw<Array<{ database: string; provider: string; collate: string; ctype: string }>>`SELECT datname AS database, datlocprovider::text AS provider, datcollate AS collate, datctype AS ctype FROM pg_database WHERE datname=current_database()`;
    console.log(`Organization query parity database locale: ${JSON.stringify(locale[0])}`);
    fixture = await createIdentityFixture(prisma, `DESKTOP-${randomUUID().slice(0, 8)}`, ["masters.read", "vendor.create", "vendor.update", "uom.manage", "payment_terms.manage"]);
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "bizovix-desktop-roundtrip-"));
    local = await startDesktop();
  }, 60_000);

  afterAll(async () => {
    await stopDesktop(secondLocal);
    await stopDesktop();
    await closeGateway();
    await app?.close();
    app = null;
    for (const directory of [temporaryRoot, ...additionalRoots].filter((value): value is string => Boolean(value))) {
      const resolved = path.resolve(directory);
      if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("bizovix-desktop-roundtrip-")) {
        throw new Error("Refusing cleanup outside the owned temporary desktop profile");
      }
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it("synchronizes a second real PC and preserves its offline edit after a stale-version conflict", async () => {
    const credentials = { email: fixture.user.email, password: fixture.password };
    const firstLogin = await localRequest<Login>("auth/login", { method: "POST", body: credentials });
    expect(firstLogin.status).toBe(200);
    const firstToken = firstLogin.data.accessToken;
    const original = await localRequest<Category>("master-categories", { method: "POST", token: firstToken, body: { type: "MATERIAL", name: "Two-PC baseline category" } });
    expect(original.status).toBe(200);
    expect((await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: firstToken })).data.lastSyncError).toBeNull();

    // A transport-only gateway lets the second PC lose connectivity while the real cloud and first PC continue.
    let secondConnected = true;
    gateway = createServer((incoming, outgoing) => {
      if (!secondConnected) { incoming.socket.destroy(); return; }
      const target = new URL(incoming.url ?? "/", cloudUrl);
      const upstream = relayRequest(target, { method: incoming.method, headers: incoming.headers }, (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      upstream.on("error", () => outgoing.destroy());
      outgoing.on("close", () => upstream.destroy());
      incoming.pipe(upstream);
    });
    await new Promise<void>((resolve) => gateway!.listen(0, "127.0.0.1", resolve));
    const gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/api/v1`;
    const secondRoot = await mkdtemp(path.join(tmpdir(), "bizovix-desktop-roundtrip-"));
    additionalRoots.push(secondRoot);
    secondLocal = await startDesktop({ rootDirectory: secondRoot, apiUrl: gatewayUrl });

    try {
      const secondLogin = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(secondLogin.status).toBe(200);
      const secondToken = secondLogin.data.accessToken;
      const snapshot = await desktopRequest<Category[]>(secondLocal, "master-categories", { token: secondToken });
      expect(snapshot.data.some((category) => category.id === original.data.id && category.version === 1)).toBe(true);
      const originalCreatedAt = (await prisma.masterCategory.findUniqueOrThrow({ where: { id: original.data.id } })).createdAt.toISOString();
      expect(snapshot.data.find((category) => category.id === original.data.id)?.createdAt).toBe(originalCreatedAt);
      const enrolled = await prisma.desktopSyncDevice.findMany({ where: { organizationId: fixture.organization.id, userId: fixture.user.id }, select: { id: true } });
      expect(enrolled).toHaveLength(2);
      expect(new Set(enrolled.map((device) => device.id)).size).toBe(2);
      expect((await desktopRequest(secondLocal, "master-categories", { token: firstToken })).status).toBe(401);

      const later = await localRequest<Category>("master-categories", { method: "POST", token: firstToken, body: { type: "VENDOR", name: "Arrived through real change feed" } });
      expect(later.status).toBe(200);
      await localRequest("desktop/sync", { method: "POST", token: firstToken });
      const pulled = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token: secondToken });
      expect(pulled.data.lastSyncError).toBeNull();
      expect((await desktopRequest<Category[]>(secondLocal, "master-categories", { token: secondToken })).data.some((category) => category.id === later.data.id)).toBe(true);

      secondConnected = false;
      gateway!.closeAllConnections();
      const pending = await desktopRequest<Category>(secondLocal, `master-categories/${original.data.id}`, { method: "PATCH", token: secondToken, body: { type: "MATERIAL", name: "Second PC offline work to preserve" } });
      expect(pending.status).toBe(200);
      expect(pending.data.syncStatus).toBe("PENDING");
      const offlineSync = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token: secondToken });
      expect(offlineSync.data.lastSyncError).toContain("unavailable");
      expect(offlineSync.data.storage.pendingCount).toBe(1);

      expect((await localRequest(`master-categories/${original.data.id}`, { method: "PATCH", token: firstToken, body: { type: "MATERIAL", name: "First PC accepted version two" } })).status).toBe(200);
      expect((await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: firstToken })).data.lastSyncError).toBeNull();
      secondConnected = true;
      const conflicting = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token: secondToken });
      expect(conflicting.data.storage.pendingCount).toBe(0);
      expect(conflicting.data.storage.rejectedCount).toBe(1);
      const retained = (await desktopRequest<Category[]>(secondLocal, "master-categories", { token: secondToken })).data.find((category) => category.id === original.data.id);
      expect(retained?.name).toBe("Second PC offline work to preserve");
      expect(retained?.syncStatus).toBe("REJECTED");
      expect(retained?.syncError?.kind).toBe("CONFLICT");
      expect(retained?.syncError?.message).toContain("VERSION_CONFLICT");
      expect(retained?.cloudCategory?.name).toBe("First PC accepted version two");
      expect(retained?.cloudCategory?.version).toBe(2);
      expect(retained?.cloudCategory?.createdAt).toBe(originalCreatedAt);
      expect((await prisma.masterCategory.findUniqueOrThrow({ where: { id: original.data.id } })).name).toBe("First PC accepted version two");
      expect((await prisma.masterCategory.findUniqueOrThrow({ where: { id: original.data.id } })).createdAt.toISOString()).toBe(originalCreatedAt);

      await stopDesktop(secondLocal);
      secondConnected = false;
      gateway!.closeAllConnections();
      secondLocal = await startDesktop({ rootDirectory: secondRoot, apiUrl: gatewayUrl });
      const reopened = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(reopened.status).toBe(200);
      const persistedConflict = (await desktopRequest<Category[]>(secondLocal, "master-categories", { token: reopened.data.accessToken })).data.find((category) => category.id === original.data.id);
      expect(persistedConflict?.name).toBe("Second PC offline work to preserve");
      expect(persistedConflict?.syncError?.kind).toBe("CONFLICT");
      expect(persistedConflict?.cloudCategory?.name).toBe("First PC accepted version two");
    } finally {
      await stopDesktop(secondLocal);
      await closeGateway();
    }
  }, 90_000);

  it("syncs UOM and payment terms between real PCs, retains stale edits and replays a lost acknowledgment once", async () => {
    const credentials = { email: fixture.user.email, password: fixture.password };
    const firstLogin = await localRequest<Login>("auth/login", { method: "POST", body: credentials });
    expect(firstLogin.status).toBe(200);
    const firstToken = firstLogin.data.accessToken;
    const inputs = [
      { route: "uoms", payload: { code: `ROUND-${randomUUID().slice(0, 8)}`, name: "Roundtrip unit", symbol: "RT" } },
      { route: "payment-terms", payload: { name: `Roundtrip term ${randomUUID()}`, days: 21, description: "Kept across devices" } },
    ];
    const originals: Master[] = [];
    for (const input of inputs) {
      const created = await localRequest<Master>(input.route, { method: "POST", token: firstToken, body: input.payload });
      expect(created.status).toBe(200);
      expect(created.data.syncStatus).toBe("PENDING");
      originals.push(created.data);
    }
    expect((await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: firstToken })).data.lastSyncError).toBeNull();
    let connected = true;
    let dropNextMasterAck = false;
    gateway = createServer((incoming, outgoing) => {
      if (!connected) { incoming.socket.destroy(); return; }
      const loseAck = dropNextMasterAck && incoming.method === "POST" && incoming.url?.split("?")[0] === "/api/v1/desktop-sync/masters/commands";
      if (loseAck) dropNextMasterAck = false;
      const upstream = relayRequest(new URL(incoming.url ?? "/", cloudUrl), { method: incoming.method, headers: incoming.headers }, response => {
        if (loseAck && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          response.resume();
          response.on("end", () => outgoing.destroy());
        } else { outgoing.writeHead(response.statusCode ?? 502, response.headers); response.pipe(outgoing); }
      });
      upstream.on("error", () => outgoing.destroy());
      outgoing.on("close", () => upstream.destroy());
      incoming.pipe(upstream);
    });
    await new Promise<void>(resolve => gateway!.listen(0, "127.0.0.1", resolve));
    const gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/api/v1`;
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "bizovix-desktop-roundtrip-masters-"));
    additionalRoots.push(rootDirectory);
    secondLocal = await startDesktop({ rootDirectory, apiUrl: gatewayUrl });
    try {
      const login = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(login.status).toBe(200);
      const token = login.data.accessToken;
      for (const [index, input] of inputs.entries()) {
        expect((await desktopRequest<Master[]>(secondLocal, input.route, { token })).data.find(row => row.id === originals[index]!.id)).toMatchObject({ version: 1, syncStatus: "SYNCED" });
      }
      connected = false;
      gateway.closeAllConnections();
      for (const [index, input] of inputs.entries()) {
        const edited = await desktopRequest<Master>(secondLocal, `${input.route}/${originals[index]!.id}`, { method: "PATCH", token, body: { ...input.payload, name: `Second PC offline ${input.route}` } });
        expect(edited.status).toBe(200);
        expect(edited.data.syncStatus).toBe("PENDING");
        expect((await localRequest(`${input.route}/${originals[index]!.id}`, { method: "PATCH", token: firstToken, body: { ...input.payload, name: `First PC accepted ${input.route}` } })).status).toBe(200);
      }
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token })).data.storage.pendingCount).toBe(2);
      expect((await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: firstToken })).data.lastSyncError).toBeNull();
      connected = true;
      const conflict = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token });
      expect(conflict.data.storage.pendingCount).toBe(0);
      expect(conflict.data.storage.rejectedCount).toBe(2);
      for (const [index, input] of inputs.entries()) {
        const row = (await desktopRequest<Master[]>(secondLocal, input.route, { token })).data.find(record => record.id === originals[index]!.id);
        expect(row).toMatchObject({ name: `Second PC offline ${input.route}`, syncStatus: "REJECTED", cloudRecord: { name: `First PC accepted ${input.route}`, version: 2 } });
        expect(row!.syncError!.message).toContain("VERSION_CONFLICT");
      }
      const revision = await desktopRequest<Master>(secondLocal, `uoms/${originals[0]!.id}`, { method: "PATCH", token, body: { ...inputs[0]!.payload, name: "Reviewed unit after conflict" } });
      expect(revision.status).toBe(200);
      expect(revision.data.operationId).toBeTruthy();
      dropNextMasterAck = true;
      const lost = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token });
      expect(lost.data.lastSyncError).toContain("unavailable");
      expect(lost.data.storage.pendingCount).toBe(1);
      expect((await prisma.unitOfMeasurement.findUniqueOrThrow({ where: { id: originals[0]!.id } })).name).toBe("Reviewed unit after conflict");
      expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: fixture.organization.id, operationId: revision.data.operationId! } })).toBe(1);
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token })).data.lastSyncError).toBeNull();
      expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: fixture.organization.id, operationId: revision.data.operationId! } })).toBe(1);
      expect(await prisma.desktopMasterSyncChange.count({ where: { organizationId: fixture.organization.id, operationId: revision.data.operationId! } })).toBe(1);
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/backup", { method: "POST", token })).data.backup.lastError).toBeNull();

      await stopDesktop(secondLocal);
      connected = false;
      gateway.closeAllConnections();
      secondLocal = await startDesktop({ rootDirectory, apiUrl: gatewayUrl });
      const reopened = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(reopened.status).toBe(200);
      expect((await desktopRequest<Master[]>(secondLocal, "uoms", { token: reopened.data.accessToken })).data.find(row => row.id === originals[0]!.id)).toMatchObject({ name: "Reviewed unit after conflict", version: 3, syncStatus: "SYNCED" });
      expect((await desktopRequest<Master[]>(secondLocal, "payment-terms", { token: reopened.data.accessToken })).data.find(row => row.id === originals[1]!.id)).toMatchObject({ name: "Second PC offline payment-terms", syncStatus: "REJECTED", cloudRecord: { version: 2 } });
    } finally { await stopDesktop(secondLocal); await closeGateway(); }
  }, 90_000);

  it("matches real PostgreSQL organization queries and preserves rejected create identity through offline revision", async () => {
    const identity = await createIdentityFixture(prisma, `ORG-ROUNDTRIP-${randomUUID()}`, ["masters.read"]);
    // Historical accepted fixtures precede enrollment; mutations below use the real HTTP services.
    const names = [" Alpha ", "alpha", "ALPHA", "A.B", "A_B", "A%B", "A\\B", "A😀B", "বাংলা", "বাংলা-নাম", "Éclair", "İstanbul", "istanbul", "Straße", "STRAẞE", "Z-case", "z-case", "trail%", "trail\\", "Full-only", "Space Name"];
    await prisma.organizationMaster.createMany({ data: [
      ...names.map(shortName => ({ organizationId: identity.organization.id, shortName, fullName: shortName === "Full-only" ? "বাংলা Alpha full name" : `Full ${shortName}` })),
      ...Array.from({ length: 105 }, (_, index) => ({ organizationId: identity.organization.id, shortName: `LOOK-${String(index).padStart(3, "0")}`, fullName: `Lookup ${index}` })),
    ] });
    const credentials = { email: identity.user.email, password: identity.password };
    const cloudLogin = await request<Login>(`${cloudUrl}/auth/login`, { method: "POST", body: credentials });
    expect(cloudLogin.status).toBe(201);
    const cloudToken = cloudLogin.data.accessToken;
    const rootDirectory = await mkdtemp(path.join(tmpdir(), "bizovix-desktop-roundtrip-organizations-"));
    additionalRoots.push(rootDirectory);
    let connected = true;
    let loseAcknowledgment = false;
    gateway = createServer((incoming, outgoing) => {
      if (!connected) { incoming.socket.destroy(); return; }
      const relay = relayRequest(`${cloudUrl.replace(/\/api\/v1$/, "")}${incoming.url}`, { method: incoming.method, headers: incoming.headers }, (response) => {
        if (loseAcknowledgment && incoming.method === "POST" && incoming.url === "/api/v1/desktop-sync/masters/commands" && response.statusCode === 201) {
          loseAcknowledgment = false;
          response.resume();
          response.on("end", () => outgoing.destroy());
          return;
        }
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      });
      relay.on("error", () => outgoing.destroy());
      incoming.pipe(relay);
    });
    await new Promise<void>(resolve => gateway!.listen(0, "127.0.0.1", resolve));
    const gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/api/v1`;
    secondLocal = await startDesktop({ rootDirectory, apiUrl: gatewayUrl });
    try {
      const login = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(login.status).toBe(200);
      const token = login.data.accessToken;
      const core = (row: OrganizationMaster) => ({ id: row.id, organizationId: row.organizationId, shortName: row.shortName, fullName: row.fullName, createdAt: row.createdAt, updatedAt: row.updatedAt });
      const searches = ["", "A", "alpha", "  alpha  ", "বাংলা", "😀", "%%", "__", "A_", "A%", "A\\%", "A\\_", "A\\\\", "trail\\", "Full-only", "Éc", "İs", "is", "ße", "ẞE", "look"];
      for (const search of searches) {
        for (const paginated of [false, true]) {
          const route = `organizations${paginated ? "/all" : ""}?search=${encodeURIComponent(search)}${paginated ? "&limit=200" : ""}`;
          const cloud = await request<OrganizationMaster[]>(`${cloudUrl}/${route}`, { token: cloudToken });
          const desktop = await desktopRequest<OrganizationMaster[]>(secondLocal, route, { token });
          expect({ route, status: desktop.status }).toEqual({ route, status: cloud.status });
          expect(cloud.status).toBe(200);
          expect({ route, data: desktop.data.map(core), meta: desktop.meta }).toEqual({ route, data: cloud.data.map(core), meta: cloud.meta });
        }
      }
      for (const route of ["organizations/all", "organizations/all?search=LOOK&page=3&limit=7", "organizations/all?search=missing&page=9&limit=5"]) {
        const cloud = await request<OrganizationMaster[]>(`${cloudUrl}/${route}`, { token: cloudToken });
        const desktop = await desktopRequest<OrganizationMaster[]>(secondLocal, route, { token });
        expect(desktop.meta).toEqual(cloud.meta);
        expect(desktop.data.map(core)).toEqual(cloud.data.map(core));
      }

      const selectorNames = { shortName: "☑️".repeat(50), fullName: "☑️".repeat(200) };
      const selector = await desktopRequest<OrganizationMaster>(secondLocal, "organizations", { method: "POST", token, body: selectorNames });
      expect(selector.status).toBe(200);
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token })).data.lastSyncError).toBeNull();
      expect(await prisma.organizationMaster.findUnique({ where: { id: selector.data.id } })).toMatchObject(selectorNames);
      const tooLong = { shortName: "☑️".repeat(51), fullName: "Valid" };
      expect((await desktopRequest(secondLocal, "organizations", { method: "POST", token, body: tooLong })).status).toBe(400);
      expect((await request(`${cloudUrl}/organizations`, { method: "POST", token: cloudToken, body: tooLong })).status).toBe(400);

      connected = false;
      gateway.closeAllConnections();
      const pending = await desktopRequest<OrganizationMaster>(secondLocal, "organizations", { method: "POST", token, body: { shortName: "LOCAL-RACE", fullName: "Offline exact name " } });
      expect(pending.status).toBe(200);
      expect(pending.data.syncStatus).toBe("PENDING");
      expect((await desktopRequest<OrganizationMaster[]>(secondLocal, "organizations?search=LOCAL-RACE", { token })).data).toEqual([]);
      expect((await desktopRequest<OrganizationMaster[]>(secondLocal, "organizations?search=LOCAL-RACE&includeLocal=true", { token })).data[0]!.id).toBe(pending.data.id);
      const duplicate = await request<OrganizationMaster>(`${cloudUrl}/organizations`, { method: "POST", token: cloudToken, body: { shortName: "LOCAL-RACE", fullName: "Created on web during disconnection" } });
      expect(duplicate.status).toBe(201);
      connected = true;
      const rejected = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token });
      expect(rejected.data.lastSyncError).toBeNull();
      expect(rejected.data.storage.rejectedCount).toBe(1);
      expect((await desktopRequest<OrganizationMaster[]>(secondLocal, "organizations?search=LOCAL-RACE", { token })).data.map(row => row.id)).toEqual([duplicate.data.id]);
      const revision = await desktopRequest<OrganizationMaster>(secondLocal, `desktop/organization-drafts/${pending.data.id}`, { method: "PATCH", token, body: { shortName: "LOCAL-REVIEWED", fullName: "Offline exact name " } });
      expect(revision.status).toBe(200);
      expect(revision.data).toMatchObject({ id: pending.data.id, createdAt: pending.data.createdAt, syncStatus: "PENDING" });
      expect(revision.data.operationId).not.toBe(pending.data.operationId);
      loseAcknowledgment = true;
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token })).data.storage.pendingCount).toBe(1);
      expect(await prisma.organizationMaster.count({ where: { id: pending.data.id, organizationId: identity.organization.id } })).toBe(1);
      process.env.DESKTOP_SYNC_ENABLED = "false";
      try {
        const paused = await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token });
        expect(paused.data.storage.pendingCount).toBe(1);
        expect(paused.data.storage.rejectedCount).toBe(0);
        expect(paused.data.lastSyncError).not.toBeNull();
      } finally { process.env.DESKTOP_SYNC_ENABLED = "true"; }
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token })).data.lastSyncError).toBeNull();
      expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: identity.organization.id, operationId: revision.data.operationId } })).toBe(1);
      expect(await prisma.desktopMasterSyncChange.count({ where: { organizationId: identity.organization.id, operationId: revision.data.operationId } })).toBe(1);
      expect((await desktopRequest<OrganizationMaster[]>(secondLocal, "organizations?search=LOCAL-REVIEWED", { token })).data).toEqual([expect.objectContaining({ id: pending.data.id, fullName: "Offline exact name ", syncStatus: "SYNCED" })]);
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/backup", { method: "POST", token })).data.backup.lastError).toBeNull();
      await stopDesktop(secondLocal);
      connected = false;
      gateway.closeAllConnections();
      secondLocal = await startDesktop({ rootDirectory, apiUrl: gatewayUrl });
      const reopened = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(reopened.status).toBe(200);
      expect((await desktopRequest<OrganizationMaster[]>(secondLocal, "organizations?search=LOCAL-REVIEWED", { token: reopened.data.accessToken })).data[0]).toMatchObject({ id: pending.data.id, syncStatus: "SYNCED" });
    } finally { await stopDesktop(secondLocal); await closeGateway(); }
  }, 90_000);

  it("recovers a changed cloud password through the real reset service without losing pending local work", async () => {
    const identity = await createIdentityFixture(prisma, `RECOVERY-${randomUUID().slice(0, 8)}`, ["masters.read", "vendor.create", "vendor.update", "user.manage"]);
    const recoveryRoot = await mkdtemp(path.join(tmpdir(), "bizovix-desktop-roundtrip-recovery-"));
    additionalRoots.push(recoveryRoot);
    secondLocal = await startDesktop({ rootDirectory: recoveryRoot });
    const credentials = { email: identity.user.email, password: identity.password };
    const newPassword = `Changed-${randomUUID()}-Password!`;
    try {
      const login = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: credentials });
      expect(login.status).toBe(200);
      const saved = await desktopRequest<Category>(secondLocal, "master-categories", { method: "POST", token: login.data.accessToken, body: { type: "MATERIAL", name: "Preserved through password reset" } });
      expect(saved.status).toBe(200);
      expect(saved.data.syncStatus).toBe("PENDING");
      expect((await desktopRequest(secondLocal, "auth/logout", { method: "POST", token: login.data.accessToken })).status).toBe(200);

      const cloudLogin = await request<Login>(`${cloudUrl}/auth/login`, { method: "POST", body: credentials });
      expect((await request(`${cloudUrl}/settings/users/${identity.user.id}/reset-password`, { method: "POST", token: cloudLogin.data.accessToken, body: { newPassword } })).status).toBe(201);
      const needsRecovery = await desktopRequest(secondLocal, "auth/login", { method: "POST", body: { email: credentials.email, password: newPassword } });
      expect(needsRecovery.status).toBe(409);
      expect(needsRecovery.code).toBe("PROFILE_RECOVERY_REQUIRED");
      const recovered = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: { email: credentials.email, password: newPassword, previousPassword: credentials.password } });
      expect(recovered.status).toBe(200);
      const retained = await desktopRequest<Category[]>(secondLocal, "master-categories", { token: recovered.data.accessToken });
      expect(retained.data.find((entry) => entry.id === saved.data.id)?.syncStatus).toBe("PENDING");
      const backup = await desktopRequest<DesktopStatus>(secondLocal, "desktop/backup", { method: "POST", token: recovered.data.accessToken });
      expect(backup.status).toBe(200);
      expect(backup.data.backup.lastVerifiedAt).not.toBeNull();
      expect(backup.data.backup.lastError).toBeNull();
      expect((await desktopRequest<DesktopStatus>(secondLocal, "desktop/sync", { method: "POST", token: recovered.data.accessToken })).data.lastSyncError).toBeNull();
      expect(await prisma.masterCategory.count({ where: { id: saved.data.id, organizationId: identity.organization.id } })).toBe(1);
      expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: identity.organization.id } })).toBe(1);

      await stopDesktop(secondLocal);
      secondLocal = await startDesktop({ rootDirectory: recoveryRoot, apiUrl: "http://127.0.0.1:1/api/v1" });
      const offline = await desktopRequest<Login>(secondLocal, "auth/login", { method: "POST", body: { email: credentials.email, password: newPassword } });
      expect(offline.status).toBe(200);
      expect((await desktopRequest<Category[]>(secondLocal, "master-categories", { token: offline.data.accessToken })).data.some((entry) => entry.id === saved.data.id)).toBe(true);
    } finally { await stopDesktop(secondLocal); }
  }, 90_000);

  it("syncs a real locally saved category, then unlocks and preserves work through offline restarts", async () => {
    const initialReceiptCount = await prisma.desktopSyncReceipt.count({ where: { organizationId: fixture.organization.id } });
    expect((await request(`${cloudUrl}/desktop-sync/snapshot?deviceId=${randomUUID()}`)).status).toBe(401);
    expect((await request(`${local!.origin}/api/v1/auth/login`, { method: "POST", body: { email: fixture.user.email, password: fixture.password } })).status).toBe(403);
    const login = await localRequest<Login>("auth/login", { method: "POST", body: { email: fixture.user.email, password: fixture.password } });
    expect(login.status).toBe(200);
    expect(login.success).toBe(true);
    expect(login.data.user.id).toBe(fixture.user.id);
    const localToken = login.data.accessToken;
    expect((await request(`${cloudUrl}/master-categories`, { token: localToken })).status).toBe(401);

    const create = await localRequest<Category>("master-categories", { method: "POST", token: localToken, body: { type: "MATERIAL", name: "Roundtrip category", description: "Saved locally then accepted by real cloud services" } });
    expect(create.status).toBe(200);
    const acceptedId = create.data.id;
    const synced = await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: localToken });
    expect(synced.status).toBe(200);
    expect(synced.data.lastSyncError).toBeNull();
    expect(synced.data.storage.pendingCount).toBe(0);
    expect(synced.data.storage.rejectedCount).toBe(0);
    const secondSync = await localRequest<DesktopStatus>("desktop/sync", { method: "POST", token: localToken });
    expect(secondSync.data.lastSyncError).toBeNull();

    const cloudLogin = await request<Login>(`${cloudUrl}/auth/login`, { method: "POST", body: { email: fixture.user.email, password: fixture.password } });
    expect(cloudLogin.status).toBe(201);
    const cloudCategories = await request<Category[]>(`${cloudUrl}/master-categories`, { token: cloudLogin.data.accessToken });
    expect(cloudCategories.status).toBe(200);
    expect(cloudCategories.data.filter((category) => category.id === acceptedId)).toHaveLength(1);
    expect(await prisma.desktopSyncReceipt.count({ where: { organizationId: fixture.organization.id } })).toBe(initialReceiptCount + 1);
    expect(await prisma.auditLog.count({ where: { organizationId: fixture.organization.id, entityId: acceptedId, action: "MASTER_CATEGORY_CREATED" } })).toBe(1);

    expect((await localRequest("auth/logout", { method: "POST", token: localToken, body: { refreshToken: login.data.refreshToken } })).status).toBe(200);
    expect((await localRequest("master-categories", { token: localToken })).status).toBe(401);
    await stopDesktop();
    await app!.close();
    app = null; // Cloud really is unreachable for subsequent login and local writes.
    local = await startDesktop();

    const offlineLogin = await localRequest<Login>("auth/login", { method: "POST", body: { email: fixture.user.email, password: fixture.password } });
    expect(offlineLogin.status).toBe(200);
    const offlineToken = offlineLogin.data.accessToken;
    const cached = await localRequest<Category[]>("master-categories", { token: offlineToken });
    expect(cached.data.some((category) => category.id === acceptedId && category.name === "Roundtrip category")).toBe(true);
    const offlineCreate = await localRequest<Category>("master-categories", { method: "POST", token: offlineToken, body: { type: "VENDOR", name: "Offline draft survives restart" } });
    expect(offlineCreate.status).toBe(200);
    expect((await localRequest<DesktopStatus>("desktop/status", { token: offlineToken })).data.storage.pendingCount).toBe(1);

    await stopDesktop();
    local = await startDesktop();
    const reopened = await localRequest<Login>("auth/login", { method: "POST", body: { email: fixture.user.email, password: fixture.password } });
    expect(reopened.status).toBe(200);
    const persisted = await localRequest<Category[]>("master-categories", { token: reopened.data.accessToken });
    expect(persisted.data.some((category) => category.id === acceptedId)).toBe(true);
    expect(persisted.data.some((category) => category.id === offlineCreate.data.id && category.name === "Offline draft survives restart")).toBe(true);
    expect((await localRequest<DesktopStatus>("desktop/status", { token: reopened.data.accessToken })).data.storage.pendingCount).toBe(1);
  }, 90_000);
});
