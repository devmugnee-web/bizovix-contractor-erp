import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DesktopStore } from "../../../../packages/desktop-storage/src/index.mjs";
import { LocalError, createVaultKey, saveVault, unlockVault, validateCloudConfiguration, vaultLocation, verifyOfflineGrant } from "./security.mjs";
import { createProfileBackup, latestProfileBackup, exportProfileBackup } from "./backups.mjs";
import { queryOrganizations } from "./organization-queries.mjs";

const supportedTypes = new Set(["VENDOR", "MATERIAL", "SUBCONTRACTOR_TRADE", "DOCUMENT_PURCHASE"]);
const masterDomains = [
  { entityType: "uom", route: "uoms", readPermission: "masters.read", permission: "uom.manage" },
  { entityType: "paymentTerm", route: "payment-terms", readPermission: "masters.read", permission: "payment_terms.manage" },
  { entityType: "organizationMaster", route: "organizations", readPermission: null, permission: null },
];
const token = () => randomBytes(32).toString("base64url");
const matches = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class LocalApplication {
  constructor(config, { fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.now = now;
    this.active = null;
    this.authBusy = false;
    this.authGeneration = 0;
    this.loginAbort = null;
    this.lastSyncError = null;
    this.lastSyncedAt = null;
  }

  configured() { return validateCloudConfiguration(this.config); }

  async requestCloud(route, { method = "GET", body, accessToken, signal, headers = {}, raw = false } = {}) {
    const { baseUrl } = this.configured();
    const binaryBody = body instanceof Uint8Array || body instanceof Blob;
    const timeout = body instanceof Blob ? 120_000 : 8000;
    let response;
    try {
      response = await this.fetch(`${baseUrl}/${route.replace(/^\//, "")}`, {
        method, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
        headers: { ...(body === undefined || binaryBody ? {} : { "Content-Type": "application/json" }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...headers },
        body: body === undefined ? undefined : binaryBody ? body : JSON.stringify(body),
      });
    } catch (cause) {
      throw new LocalError(503, "Cloud connection is unavailable. Saved local work is preserved.", "CLOUD_UNAVAILABLE");
    }
    if (raw) return response;
    const envelope = await response.json().catch(() => ({}));
    if (!response.ok) throw new LocalError(response.status, typeof envelope.message === "string" ? envelope.message : "Cloud request was rejected.", "CLOUD_REJECTED");
    return envelope.data;
  }

  validateSession(session) {
    if (!session || this.active !== session) throw new LocalError(401, "Please sign in.");
    if (session.data.authorizationBlocked) throw new LocalError(403, "Cloud authorization changed. Connect and sign in again before using this profile.", "AUTHORIZATION_REVALIDATION_REQUIRED");
    const { key } = this.configured();
    const grant = verifyOfflineGrant(session.data.grant, { key, issuer: this.config.cloudIssuer, deviceId: session.data.deviceId, now: this.now() });
    if (session.data.lastUsedAt > this.now() + 300_000) throw new LocalError(403, "Device time changed. Reconnect and sign in to verify your session.", "CLOCK_CHANGED");
    return grant;
  }

  requireSession(bearer) {
    const session = this.active;
    if (!session || !matches(session.accessToken, bearer)) throw new LocalError(401, "Please sign in.");
    this.validateSession(session);
    return session;
  }

  requirePermission(session, permission, capability) {
    const grant = this.validateSession(session);
    if ((permission && !grant.permissions.includes(permission)) || (capability && !grant.capabilities.includes(capability))) {
      throw new LocalError(403, "Your account does not have permission for this action.");
    }
  }

  persist(session) {
    if (this.active !== session || session.abort.signal.aborted) throw new LocalError(401, "The active account changed.");
    session.data.lastUsedAt = this.now();
    saveVault(session.file, session.data, session.material);
  }

  blockAuthorization(session) {
    if (this.active !== session) return;
    session.data.authorizationBlocked = true;
    this.persist(session);
  }

  async refreshCloudAccess(session, deniedToken) {
    this.validateSession(session);
    // A concurrent request may already have rotated this token after our request was sent.
    if (session.data.cloudAccessToken !== deniedToken) return;
    if (session.cloudRefreshPromise) return session.cloudRefreshPromise;
    session.cloudRefreshPromise = (async () => {
      let refreshed;
      try {
        refreshed = await this.requestCloud("auth/refresh", { method: "POST", body: { refreshToken: session.data.cloudRefreshToken }, signal: session.abort.signal });
      } catch (error) {
        if ([401, 403].includes(error.status)) this.blockAuthorization(session);
        throw error;
      }
      this.validateSession(session);
      const grant = session.data.grant.payload;
      if (typeof refreshed?.accessToken !== "string" || !refreshed.accessToken || typeof refreshed.refreshToken !== "string" || !refreshed.refreshToken ||
          refreshed.user?.id !== grant.userId || refreshed.user?.organizationId !== grant.organizationId || !Array.isArray(refreshed.user?.permissions) ||
          !grant.permissions.every((permission) => refreshed.user.permissions.includes(permission))) {
        this.blockAuthorization(session);
        throw new LocalError(403, "Cloud authorization changed. Sign in again to verify your permissions.", "AUTHORIZATION_REVALIDATION_REQUIRED");
      }
      session.data.cloudAccessToken = refreshed.accessToken;
      session.data.cloudRefreshToken = refreshed.refreshToken;
      this.persist(session);
    })().finally(() => { session.cloudRefreshPromise = null; });
    return session.cloudRefreshPromise;
  }

  async cloudForSession(session, route, options = {}) {
    const work = (async () => {
      this.validateSession(session);
      const deniedToken = session.data.cloudAccessToken;
      let response = await this.requestCloud(route, { ...options, accessToken: deniedToken, signal: session.abort.signal, raw: true });
      this.validateSession(session);
      if (response.status === 401) {
        const denial = await response.clone().json().catch(() => null);
        // This is the current JWT guard's pre-controller denial. Unknown/business 401s
        // are never automatically replayed, particularly for financial POST requests.
        if (denial?.success === false && denial.message === "Unauthorized") {
          await response.body?.cancel();
          await this.refreshCloudAccess(session, deniedToken);
          this.validateSession(session);
          response = await this.requestCloud(route, { ...options, accessToken: session.data.cloudAccessToken, signal: session.abort.signal, raw: true });
          this.validateSession(session);
        }
      }
      if ([401, 403].includes(response.status)) this.blockAuthorization(session);
      if (options.raw) return response;
      const envelope = await response.json().catch(() => null);
      if (this.active !== session) throw new LocalError(401, "The active account changed.");
      if (!response.ok) throw new LocalError(response.status, typeof envelope?.message === "string" ? envelope.message : "Cloud request was rejected.", "CLOUD_REJECTED");
      if (!envelope || envelope.success !== true || !("data" in envelope)) throw new LocalError(502, "Cloud response could not be verified. Saved local work is preserved.", "CLOUD_RESPONSE_INVALID");
      return envelope.data;
    })();
    session.inFlight.add(work);
    try { return await work; } finally { session.inFlight.delete(work); }
  }

  async login({ email, password, previousPassword }) {
    if (this.authBusy) throw new LocalError(409, "A sign-in is already in progress.");
    if (typeof email !== "string" || !email.trim() || email.length > 320) throw new LocalError(400, "A valid email is required.");
    if (typeof password !== "string" || !password || password.length > 1024) throw new LocalError(400, "A valid password is required.");
    if (previousPassword !== undefined && (typeof previousPassword !== "string" || !previousPassword || previousPassword.length > 1024)) throw new LocalError(400, "A valid previous password is required.");
    const configuration = this.configured();
    this.authBusy = true;
    let attempt;
    let unlockedMaterial;
    let previousMaterial;
    let retainedMaterial = false;
    try {
      await this.logout();
      attempt = { generation: this.authGeneration, abort: new AbortController() };
      this.loginAbort = attempt.abort;
      const assertCurrent = () => {
        if (attempt.generation !== this.authGeneration || attempt.abort.signal.aborted) throw new LocalError(401, "Sign-in was cancelled. Please sign in again.", "LOGIN_CANCELLED");
      };
      const file = vaultLocation(this.config.rootDirectory, this.config.cloudIssuer, email);
      let previous;
      if (fs.existsSync(file)) {
        try { previous = unlockVault(file, password); } catch { /* Online authentication can recover changed credentials. */ }
        if (!previous && previousPassword) previous = unlockVault(file, previousPassword);
      }
      previousMaterial = previous?.material;
      unlockedMaterial = previous?.material;
      let material;
      let data;
      let authenticatedUser;
      let snapshot;
      let masterSnapshots = [];
      try {
        const login = await this.requestCloud("auth/login", { method: "POST", body: { email, password }, signal: attempt.abort.signal });
        assertCurrent();
        authenticatedUser = login.user;
        if (fs.existsSync(file) && !previous) {
          throw new LocalError(409, "This PC has an existing offline profile protected by your previous password. Its saved work has been preserved; unlock that profile before changing its credentials.", "PROFILE_RECOVERY_REQUIRED");
        }
        const deviceId = previous?.data.deviceId ?? randomUUID();
        const registration = await this.requestCloud("desktop-sync/register", { method: "POST", accessToken: login.accessToken, body: { deviceId, deviceName: "Bizovix Desktop" }, signal: attempt.abort.signal });
        assertCurrent();
        const grant = verifyOfflineGrant(registration.grant, { key: configuration.key, issuer: this.config.cloudIssuer, deviceId, now: this.now() });
        if (grant.userId !== login.user?.id || grant.organizationId !== login.user?.organizationId || grant.user.email.toLowerCase() !== email.trim().toLowerCase()) {
          throw new LocalError(403, "Desktop activation identity does not match your account.");
        }
        const oldGrant = previous?.data.grant?.payload;
        if (oldGrant && (oldGrant.userId !== grant.userId || oldGrant.organizationId !== grant.organizationId || oldGrant.issuer !== grant.issuer)) {
          throw new LocalError(409, "This sign-in belongs to a different company or account than the saved profile. Its credentials and local work have been preserved.", "PROFILE_IDENTITY_CHANGED");
        }
        if (grant.permissions.includes("masters.read")) {
          snapshot = await this.requestCloud(`desktop-sync/snapshot?deviceId=${encodeURIComponent(deviceId)}`, { accessToken: login.accessToken, signal: attempt.abort.signal });
          assertCurrent();
        }
        for (const { entityType, readPermission } of masterDomains) {
          if ((readPermission && !grant.permissions.includes(readPermission)) || !grant.capabilities.includes(`${entityType}.read`)) continue;
          const result = await this.requestCloud(`desktop-sync/masters/snapshot?deviceId=${encodeURIComponent(deviceId)}&entityType=${entityType}`, { accessToken: login.accessToken, signal: attempt.abort.signal });
          assertCurrent();
          this.validateMasterResponse(entityType, result, "snapshot");
          masterSnapshots.push(result);
        }
        material = previous && !previousPassword ? previous.material : createVaultKey(password);
        unlockedMaterial = material;
        data = { deviceId, grant: registration.grant, cloudAccessToken: login.accessToken, cloudRefreshToken: login.refreshToken, lastUsedAt: this.now() };
      } catch (error) {
        assertCurrent();
        // An explicit authentication/authorization/configuration rejection must never unlock an old grant.
        if ([401, 403].includes(error.status) && previous) {
          previous.data.authorizationBlocked = true;
          saveVault(file, previous.data, previous.material);
        }
        const unavailable = error.code === "CLOUD_UNAVAILABLE" || (error.code === "CLOUD_REJECTED" &&
          ([502, 503, 504].includes(error.status) || (error.status === 404 && error.message === "Desktop sync is not enabled")));
        if (!unavailable || previousPassword) throw error;
        // A temporary sync outage must not undo a permission withdrawal already
        // observed in the successful online login response.
        const previousGrant = previous?.data.grant?.payload;
        if (previousGrant && authenticatedUser && (authenticatedUser.id !== previousGrant.userId ||
            authenticatedUser.organizationId !== previousGrant.organizationId || !Array.isArray(authenticatedUser.permissions) ||
            !previousGrant.permissions.every((permission) => authenticatedUser.permissions.includes(permission)))) {
          previous.data.authorizationBlocked = true;
          saveVault(file, previous.data, previous.material);
          throw new LocalError(403, "Cloud authorization changed. Connect and sign in again before using this profile.", "AUTHORIZATION_REVALIDATION_REQUIRED");
        }
        // An incomplete new bootstrap cannot be mixed with the previous offline grant.
        snapshot = undefined;
        masterSnapshots = [];
        const unlocked = previous ?? unlockVault(file, password);
        material = unlocked.material;
        unlockedMaterial = material;
        data = unlocked.data;
        const verified = verifyOfflineGrant(data.grant, { key: configuration.key, issuer: this.config.cloudIssuer, deviceId: data.deviceId, now: this.now() });
        if (data.authorizationBlocked) throw new LocalError(403, "Cloud authorization changed. Connect and sign in again before using this profile.", "AUTHORIZATION_REVALIDATION_REQUIRED");
        if (typeof verified.user.email !== "string" || verified.user.email.toLowerCase() !== email.trim().toLowerCase()) throw new LocalError(403, "This offline profile belongs to another account.");
        if (data.lastUsedAt > this.now() + 300_000) throw new LocalError(403, "Device time changed. Reconnect to verify your session.");
      }
      const grant = data.grant.payload;
      assertCurrent();
      const store = new DesktopStore({ rootDirectory: this.config.rootDirectory, profile: { environmentId: this.config.cloudIssuer, organizationId: grant.organizationId, userId: grant.userId, deviceId: data.deviceId } });
      try {
        if (snapshot) store.applyCategorySnapshot(snapshot.categories, snapshot.cursor);
        for (const result of masterSnapshots) store.applyMasterSnapshot(result.entityType, result.records, result.cursor, result.queryIndex);
        const session = { data, store, file, material, accessToken: token(), refreshToken: token(), abort: new AbortController(), syncPromise: null, cloudRefreshPromise: null, grantRenewalPromise: null, backupPromise: null, lastBackup: await latestProfileBackup(store), lastBackupError: null, backupRetryAt: 0, inFlight: new Set() };
        data.lastUsedAt = this.now();
        // Keep a verified database and the old encrypted credential file before rekeying.
        // A failed backup leaves the original vault/password and all queued work intact.
        if (previousPassword && previous) session.lastBackup = await createProfileBackup(store, file, this.now());
        assertCurrent();
        saveVault(file, data, material);
        this.active = session;
        retainedMaterial = true;
        this.lastSyncError = null;
        return { user: grant.user, accessToken: session.accessToken, refreshToken: session.refreshToken };
      } catch (error) { store.close(); throw error; }
    } finally {
      if (!retainedMaterial) unlockedMaterial?.key.fill(0);
      if (previousMaterial !== unlockedMaterial) previousMaterial?.key.fill(0);
      if (this.loginAbort === attempt?.abort) this.loginAbort = null;
      this.authBusy = false;
    }
  }

  refresh(refreshToken) {
    const session = this.active;
    if (!session || !matches(session.refreshToken, refreshToken)) throw new LocalError(401, "Please sign in again.");
    this.validateSession(session);
    session.accessToken = token();
    session.refreshToken = token();
    return { user: session.data.grant.payload.user, accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  async logout() {
    this.authGeneration += 1;
    this.loginAbort?.abort();
    const previous = this.active;
    this.active = null;
    this.lastSyncedAt = null;
    this.lastSyncError = null;
    if (!previous) return;
    previous.abort.abort();
    await Promise.allSettled([previous.syncPromise, previous.backupPromise, previous.exportPromise, previous.grantRenewalPromise, ...previous.inFlight].filter(Boolean));
    previous.store.close();
    previous.material.key.fill(0);
  }

  status() {
    let configured = true;
    try { this.configured(); } catch { configured = false; }
    const storage = this.active?.store.status();
    const canReadMasters = this.active?.data.grant.payload.permissions.includes("masters.read");
    const offlineModules = this.active ? [...(canReadMasters ? ["master-categories"] : []), ...masterDomains.filter(({ entityType }) => this.masterEnabled(this.active, entityType) && this.masterInitialized(this.active, entityType)).map(({ route }) => route)] : [];
    const organizationDraftRecoveryAvailable = Boolean(this.active && this.masterEnabled(this.active, "organizationMaster") && this.active.store.readMasterCursor("organizationMaster"));
    const projectionRevision = storage ? createHash("sha256").update(JSON.stringify([storage.cursor, ...masterDomains.map(({ entityType }) => this.masterEnabled(this.active, entityType) ? this.active.store.readMasterCursor(entityType) : null), this.masterEnabled(this.active, "organizationMaster") ? this.active.store.readOrganizationQueryIndex() : null])).digest("hex") : undefined;
    return { configured, localAvailable: Boolean(this.active), offlineModules, organizationDraftRecoveryAvailable, rollout: "master-data-pilot", lastSyncedAt: this.lastSyncedAt, lastSyncError: this.lastSyncError, ...(storage ? { storage: { schemaVersion: storage.schemaVersion, pendingCount: storage.pendingCount, rejectedCount: storage.rejectedCount, cursor: storage.cursor, projectionRevision }, backup: { lastVerifiedAt: this.active.lastBackup?.createdAt ?? null, lastError: this.active.lastBackupError, running: Boolean(this.active.backupPromise) }, offlineAccessExpiresAt: this.active.data.grant.payload.expiresAt } : {}) };
  }

  async backup({ force = false } = {}) {
    const session = this.active;
    if (!session) return this.status();
    if (session.backupPromise) return session.backupPromise;
    if (!force && (session.backupRetryAt > this.now() || (session.lastBackup && this.now() - Date.parse(session.lastBackup.createdAt) < 24 * 3600_000))) return this.status();
    session.backupPromise = (async () => {
      try {
        session.lastBackup = await createProfileBackup(session.store, session.file, this.now());
        session.lastBackupError = null;
      } catch {
        session.lastBackupError = "Backup could not be verified. Check available disk space and retry; the working database has been preserved.";
        session.backupRetryAt = this.now() + 5 * 60_000;
      }
      return this.status();
    })().finally(() => { session.backupPromise = null; });
    return session.backupPromise;
  }

  async exportBackup(bearer, destinationDirectory) {
    const session = this.requireSession(bearer);
    if (session.exportPromise) throw new LocalError(409, "A backup export is already running.", "BACKUP_EXPORT_BUSY");
    if (typeof destinationDirectory !== "string" || !path.isAbsolute(destinationDirectory)) throw new LocalError(400, "Choose an existing backup folder.", "BACKUP_EXPORT_DESTINATION");
    const assertAuthorized = () => {
      if (this.requireSession(bearer) !== session) throw new LocalError(401, "The active account changed. Export a backup again after signing in.");
    };
    session.exportPromise = (async () => {
      // A concurrent automatic backup must finish first. Then capture a fresh
      // snapshot for this explicit export, rather than reuse yesterday's data.
      if (session.backupPromise) await session.backupPromise;
      assertAuthorized();
      await this.backup({ force: true });
      assertAuthorized();
      if (session.lastBackupError || !session.lastBackup) throw new LocalError(409, "A fresh backup could not be verified. No export was completed.", "BACKUP_EXPORT_FAILED");
      const backupDirectory = path.join(path.dirname(session.store.status().databasePath), "backups", session.lastBackup.id);
      return exportProfileBackup({ backupDirectory, destinationDirectory, assertAuthorized });
    })().finally(() => { session.exportPromise = null; });
    return session.exportPromise;
  }

  async renewOfflineGrant(session) {
    this.validateSession(session);
    const previous = session.data.grant.payload;
    const lifetime = Date.parse(previous.expiresAt) - Date.parse(previous.issuedAt);
    if (Date.parse(previous.expiresAt) - this.now() > Math.min(6 * 3600_000, lifetime / 4)) return;
    if (session.grantRenewalPromise) return session.grantRenewalPromise;
    session.grantRenewalPromise = (async () => {
      const registration = await this.cloudForSession(session, "desktop-sync/register", { method: "POST", body: { deviceId: session.data.deviceId, deviceName: "Bizovix Desktop" } });
      this.validateSession(session);
      const { key } = this.configured();
      const grant = verifyOfflineGrant(registration?.grant, { key, issuer: this.config.cloudIssuer, deviceId: session.data.deviceId, now: this.now() });
      if (grant.userId !== previous.userId || grant.organizationId !== previous.organizationId || grant.user.email.toLowerCase() !== previous.user.email.toLowerCase() || Date.parse(grant.expiresAt) <= Date.parse(previous.expiresAt)) {
        throw new LocalError(502, "Offline authorization renewal did not match this profile. Reconnect and sign in again.", "GRANT_RENEWAL_INVALID");
      }
      const prior = session.data.grant;
      session.data.grant = registration.grant;
      try { this.persist(session); } catch (error) { session.data.grant = prior; throw error; }
    })().finally(() => { session.grantRenewalPromise = null; });
    return session.grantRenewalPromise;
  }

  async sync() {
    const session = this.active;
    if (!session) return this.status();
    if (session.syncPromise) return session.syncPromise;
    session.syncPromise = this.syncSession(session).finally(() => { session.syncPromise = null; });
    return session.syncPromise;
  }

  async syncSession(session) {
    try {
      await this.renewOfflineGrant(session);
      if (session.data.grant.payload.permissions.includes("masters.read")) await this.syncCategorySession(session);
      for (const { entityType } of masterDomains) {
        if (this.active !== session) return this.status();
        if (this.masterEnabled(session, entityType)) await this.syncMasterSession(session, entityType);
      }
      this.persist(session);
      this.lastSyncedAt = new Date(this.now()).toISOString();
      this.lastSyncError = null;
    } catch (error) {
      if (this.active === session) this.lastSyncError = error instanceof LocalError ? error.message : "Sync paused; local work is preserved.";
    }
    return this.status();
  }

  async syncCategorySession(session) {
    this.requirePermission(session, "masters.read");
    for (const command of session.store.pendingCommands(50)) {
      if (this.active !== session) return this.status();
      try {
        const accepted = await this.cloudForSession(session, "desktop-sync/commands", { method: "POST", body: command });
        if (this.active !== session) return this.status();
        if (accepted?.operationId !== command.operationId) throw new LocalError(502, "Cloud acknowledgement did not match the queued operation. Local work is preserved.", "ACKNOWLEDGEMENT_MISMATCH");
        session.store.acceptCommand(command.operationId, accepted.category);
      } catch (error) {
        if (this.active !== session) return this.status();
        // Authorization loss or a paused/missing endpoint cannot prove that a
        // previous delivery did not commit. Preserve the operation for receipt replay.
        if ([400, 409, 422].includes(error.status)) {
          session.store.rejectCommand(command.operationId, error.status === 409 ? "CONFLICT" : "REJECTED", error.message);
        } else throw error;
      }
    }
    let more = true;
    let page = 0;
    while (more && page++ < 100 && this.active === session) {
      const cursor = session.store.readCursor();
      if (!cursor) {
        const snapshot = await this.cloudForSession(session, `desktop-sync/snapshot?deviceId=${encodeURIComponent(session.data.deviceId)}`);
        if (this.active !== session) return this.status();
        session.store.applyCategorySnapshot(snapshot.categories, snapshot.cursor);
        more = false;
      } else {
        let changes;
        try {
          changes = await this.cloudForSession(session, `desktop-sync/changes?deviceId=${encodeURIComponent(session.data.deviceId)}&cursor=${encodeURIComponent(cursor)}`);
        } catch (error) {
          if (error.status !== 409 || !error.message.startsWith("RESNAPSHOT_REQUIRED:")) throw error;
          const snapshot = await this.cloudForSession(session, `desktop-sync/snapshot?deviceId=${encodeURIComponent(session.data.deviceId)}`);
          if (this.active !== session) return this.status();
          // Accepted projection is rebuilt; the store keeps pending/rejected overlays intact.
          session.store.applyCategorySnapshot(snapshot.categories, snapshot.cursor);
          more = false;
          continue;
        }
        if (this.active !== session) return this.status();
        if (changes.hasMore && changes.cursor === cursor) throw new LocalError(502, "Cloud sync cursor did not advance. Local work is preserved.", "SYNC_CURSOR_STALLED");
        session.store.applyCategoryChanges(changes.changes, changes.cursor);
        more = Boolean(changes.hasMore);
      }
    }
    if (more && this.active === session) throw new LocalError(503, "Category sync will continue in the next cycle. Saved work is preserved.", "SYNC_MORE_PENDING");
  }

  masterEnabled(session, entityType) {
    const domain = masterDomains.find((entry) => entry.entityType === entityType);
    const grant = session.data.grant.payload;
    return Boolean(domain && (!domain.readPermission || grant.permissions.includes(domain.readPermission)) && grant.capabilities.includes(`${entityType}.read`));
  }

  masterInitialized(session, entityType) {
    return Boolean(session.store.readMasterCursor(entityType) && (entityType !== "organizationMaster" || session.store.readOrganizationQueryIndex()));
  }

  validateMasterResponse(entityType, value, kind) {
    if (!value || value.entityType !== entityType || typeof value.cursor !== "string" || !value.cursor ||
        (kind === "snapshot" && (value.schemaVersion !== 1 || !Array.isArray(value.records))) ||
        (kind === "changes" && (!Array.isArray(value.changes) || typeof value.hasMore !== "boolean")) ||
        (entityType === "organizationMaster" && (!value.queryIndex || value.queryIndex.formatVersion !== 1))) {
      throw new LocalError(502, "Cloud master-data response did not match the requested module. Local work is preserved.", "SYNC_RESPONSE_MISMATCH");
    }
  }

  async syncMasterSession(session, entityType) {
    const query = `deviceId=${encodeURIComponent(session.data.deviceId)}&entityType=${entityType}`;
    const refreshSnapshot = async () => {
      const result = await this.cloudForSession(session, `desktop-sync/masters/snapshot?${query}`);
      if (this.active !== session) return;
      this.validateMasterResponse(entityType, result, "snapshot");
      session.store.applyMasterSnapshot(entityType, result.records, result.cursor, result.queryIndex);
    };
    // A grant renewal can enable a new module on an already activated PC.
    // Bootstrap that module before exposing local queries or writes.
    if (!this.masterInitialized(session, entityType)) await refreshSnapshot();
    if (this.active !== session) return;
    for (const command of session.store.pendingMasterCommands(entityType, 50)) {
      if (this.active !== session) return;
      try {
        const result = await this.cloudForSession(session, "desktop-sync/masters/commands", { method: "POST", body: command });
        if (this.active !== session) return;
        if (result?.operationId !== command.operationId || result.entityType !== entityType || result.record?.id !== command.entityId) {
          throw new LocalError(502, "Cloud acknowledgement did not match the queued master operation. Local work is preserved.", "ACKNOWLEDGEMENT_MISMATCH");
        }
        session.store.acceptMasterCommand(command.operationId, result.record);
      } catch (error) {
        if (this.active !== session) return;
        if ([400, 409, 422].includes(error.status)) {
          session.store.rejectMasterCommand(command.operationId, error.status === 409 ? "CONFLICT" : "REJECTED", error.message);
        } else throw error;
      }
    }
    for (let page = 0; page < 100 && this.active === session; page += 1) {
      const cursor = session.store.readMasterCursor(entityType);
      let result;
      try {
        result = await this.cloudForSession(session, `desktop-sync/masters/changes?${query}&cursor=${encodeURIComponent(cursor)}`);
      } catch (error) {
        if (error.status !== 409 || !error.message.startsWith("RESNAPSHOT_REQUIRED:")) throw error;
        await refreshSnapshot();
        return;
      }
      if (this.active !== session) return;
      this.validateMasterResponse(entityType, result, "changes");
      if (result.hasMore && result.cursor === cursor) throw new LocalError(502, "Cloud sync cursor did not advance. Local work is preserved.", "SYNC_CURSOR_STALLED");
      session.store.applyMasterChanges(entityType, result.changes, result.cursor, result.queryIndex);
      if (!result.hasMore) return;
    }
    if (this.active === session) throw new LocalError(503, "Master-data sync will continue in the next cycle. Saved work is preserved.", "SYNC_MORE_PENDING");
  }

  categoryPayload(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !supportedTypes.has(value.type) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 200 ||
        Object.keys(value).some((key) => !["type", "name", "description", "isActive"].includes(key)) ||
        (value.description != null && (typeof value.description !== "string" || value.description.length > 5000)) ||
        (value.isActive !== undefined && typeof value.isActive !== "boolean")) {
      throw new LocalError(400, "Invalid category details.");
    }
    return value;
  }

  async handle(method, route, bearer, body, rawHeaders = {}) {
    const url = new URL(route, "http://127.0.0.1");
    const pathname = url.pathname;
    if (method === "POST" && pathname === "/auth/login") return { data: await this.login(body ?? {}) };
    if (method === "POST" && pathname === "/auth/refresh") return { data: this.refresh(body?.refreshToken) };
    if (pathname === "/auth/dev-login") throw new LocalError(403, "Desktop activation requires your account login.");
    // Revocation or grant expiry must still allow the renderer to destroy its local session.
    if (pathname === "/auth/logout" && method === "POST") {
      if (!this.active || !matches(this.active.accessToken, bearer)) throw new LocalError(401, "Please sign in.");
      await this.logout(); return { data: null };
    }
    const session = this.requireSession(bearer);
    if (pathname === "/auth/me" && method === "GET") return { data: session.data.grant.payload.user };
    if (pathname === "/desktop/status" && method === "GET") return { data: this.status() };
    if (pathname === "/desktop/sync" && method === "POST") return { data: await this.sync() };
    if (pathname === "/desktop/backup" && method === "POST") return { data: await this.backup({ force: true }) };
    const organizationDraft = /^\/desktop\/organization-drafts\/([^/]+)$/.exec(pathname);
    const organizationDraftList = pathname === "/desktop/organization-drafts" && method === "GET";
    const organizationRoute = pathname === "/organizations" || pathname === "/organizations/all";
    if (organizationDraftList || (organizationDraft && ["GET", "PATCH"].includes(method)) || (organizationRoute && this.masterEnabled(session, "organizationMaster") && (method === "GET" || (pathname === "/organizations" && method === "POST")))) {
      this.requirePermission(session, null, "organizationMaster.read");
      // Draft inspection/revision uses the bound profile's saved identity, not
      // cloud ordering. An ACK can invalidate that ordering before a failed pull;
      // keep already bootstrapped drafts recoverable during the resulting outage.
      const initialized = organizationDraftList || organizationDraft
        ? Boolean(session.store.readMasterCursor("organizationMaster"))
        : this.masterInitialized(session, "organizationMaster");
      if (!initialized) throw new LocalError(503, "Connect and sync organizations before using them offline. Existing local work is preserved.", "MODULE_BOOTSTRAP_REQUIRED");
      const withTenant = (record) => ({ ...record, organizationId: session.data.grant.payload.organizationId });
      if (organizationDraftList) return { data: session.store.listMasters("organizationMaster").filter((record) => ["PENDING", "REJECTED"].includes(record.syncStatus)).map(withTenant) };
      if (organizationDraft) {
        const id = decodeURIComponent(organizationDraft[1]);
        if (method === "GET") {
          const record = session.store.listMasters("organizationMaster").find((entry) => entry.id === id);
          if (!record) throw new LocalError(404, "Organization draft was not found.", "MASTER_NOT_FOUND");
          return { data: withTenant(record) };
        }
        this.requirePermission(session, null, "organizationMaster.create");
        this.persist(session);
        return { data: withTenant(session.store.stageMasterCreateRevision("organizationMaster", id, body, {
          authorizeCommand: (commandType) => this.requirePermission(session, null, commandType),
        }).record) };
      }
      if (method === "GET") {
        if (pathname === "/organizations/all") this.requirePermission(session, "masters.read", "organizationMaster.list");
        return { data: queryOrganizations(session.store, url, withTenant) };
      }
      this.requirePermission(session, null, "organizationMaster.create");
      this.persist(session);
      return { data: withTenant(session.store.stageMasterCreate("organizationMaster", body).record) };
    }
    // This is a local management hint, never part of the existing cloud API contract.
    if (organizationRoute && method === "GET") {
      url.searchParams.delete("includeLocal");
      route = `${url.pathname}${url.search}`;
    }
    for (const { entityType, route: masterRoute, permission } of masterDomains) {
      if (entityType === "organizationMaster") continue; // Create-only domain; accepted records have no PATCH endpoint.
      const parts = pathname.split("/");
      if (parts[1] !== masterRoute || !this.masterEnabled(session, entityType)) continue;
      const listing = parts.length === 2;
      const updating = parts.length === 3 && Boolean(parts[2]);
      if (!(listing && ["GET", "POST"].includes(method)) && !(updating && method === "PATCH")) continue;
      this.requirePermission(session, "masters.read", `${entityType}.read`);
      if (!session.store.readMasterCursor(entityType)) throw new LocalError(503, "Connect and sync this module before using it offline. Existing local work is preserved.", "MODULE_BOOTSTRAP_REQUIRED");
      if (method === "GET") return { data: session.store.listMasters(entityType) };
      this.requirePermission(session, permission);
      this.persist(session);
      if (method === "POST") {
        this.requirePermission(session, permission, `${entityType}.create`);
        return { data: session.store.stageMasterCreate(entityType, body).record };
      }
      return { data: session.store.stageMasterUpdate(entityType, decodeURIComponent(parts[2]), body, {
        authorizeCommand: (commandType) => this.requirePermission(session, permission, commandType),
      }).record };
    }
    if (pathname === "/master-categories" && method === "GET") {
      this.requirePermission(session, "masters.read");
      const type = url.searchParams.get("type") ?? undefined;
      if (type && !supportedTypes.has(type)) throw new LocalError(400, "Invalid category type.");
      return { data: session.store.listCategories(type) };
    }
    if (pathname === "/master-categories" && method === "POST") {
      this.requirePermission(session, "masters.read");
      this.requirePermission(session, "vendor.create", "masterCategory.create");
      const payload = this.categoryPayload(body);
      // Persist the independent credential/clock file first. A vault write failure
      // must not report an unsaved action after SQLite has already committed it.
      this.persist(session);
      const result = session.store.stageCategoryCreate(payload);
      return { data: result.category };
    }
    if (/^\/master-categories\/[^/]+$/.test(pathname) && method === "PATCH") {
      this.requirePermission(session, "masters.read");
      const payload = this.categoryPayload(body);
      this.persist(session);
      const result = session.store.stageCategoryUpdate(decodeURIComponent(pathname.split("/").pop()), payload, {
        authorizeCommand: (commandType) => this.requirePermission(session, commandType === "masterCategory.create" ? "vendor.create" : "vendor.update", commandType),
      });
      return { data: result.category };
    }
    // Other modules retain their real cloud services; no fabricated offline success or replay queue.
    // Only an explicit pre-controller JWT denial may be retried after token rotation.
    // Network failures and ambiguous business responses are never replayed here.
    const response = await this.cloudForSession(session, route, { method, body, headers: rawHeaders, raw: true });
    if (this.active !== session) { await response.body?.cancel(); throw new LocalError(401, "The active account changed."); }
    return { response, assertSession: () => { if (this.active !== session || session.abort.signal.aborted) throw new LocalError(401, "The active account changed."); } };
  }
}
