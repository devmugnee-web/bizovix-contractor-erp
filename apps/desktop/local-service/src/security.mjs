import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, scryptSync, verify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export class LocalError extends Error {
  constructor(status, message, code = "LOCAL_REQUEST_FAILED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function validateCloudConfiguration({ cloudApiUrl, cloudPublicKey, cloudIssuer, allowInsecureLocalCloud = false }) {
  if (!cloudApiUrl || !cloudPublicKey || !cloudIssuer) {
    throw new LocalError(503, "Desktop activation is not configured in this build. Contact your software provider.", "CLOUD_NOT_CONFIGURED");
  }
  let url;
  try { url = new URL(cloudApiUrl); } catch { throw new LocalError(503, "Invalid cloud API configuration."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(allowInsecureLocalCloud && local && url.protocol === "http:"))) {
    throw new LocalError(503, "Cloud API must use HTTPS; only explicit local development can use loopback HTTP.");
  }
  let key;
  try { key = createPublicKey(cloudPublicKey); } catch { throw new LocalError(503, "Invalid desktop grant verification key."); }
  if (key.asymmetricKeyType !== "ed25519") throw new LocalError(503, "Desktop grants require an Ed25519 verification key.");
  return { baseUrl: url.toString().replace(/\/$/, ""), key };
}

export function verifyOfflineGrant(grant, { key, issuer, deviceId, now = Date.now() }) {
  if (!grant?.payload || typeof grant.signature !== "string") throw new LocalError(403, "A signed offline grant is required.", "OFFLINE_GRANT_INVALID");
  const p = grant.payload;
  const issued = Date.parse(p.issuedAt);
  const expires = Date.parse(p.expiresAt);
  if (!verify(null, Buffer.from(canonicalJson(p)), key, Buffer.from(grant.signature, "base64url")) ||
      p.formatVersion !== 1 || p.issuer !== issuer || p.audience !== "bizovix-desktop" || p.deviceId !== deviceId ||
      !p.organizationId || !p.userId || p.user?.id !== p.userId || p.user?.organizationId !== p.organizationId ||
      !Array.isArray(p.permissions) || !Array.isArray(p.user?.permissions) || !Array.isArray(p.capabilities) ||
      canonicalJson([...p.permissions].sort()) !== canonicalJson([...p.user.permissions].sort()) ||
      !Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 168 * 3600_000 || issued > now + 300_000) {
    throw new LocalError(403, "The offline authorization could not be verified.", "OFFLINE_GRANT_INVALID");
  }
  if (expires <= now) throw new LocalError(403, "Offline authorization has expired. Connect to the internet and sign in again.", "OFFLINE_GRANT_EXPIRED");
  return p;
}

export function vaultLocation(root, issuer, email) {
  const key = createHash("sha256").update(`${issuer}\0${email.trim().toLowerCase()}`).digest("hex");
  return path.join(root, "credentials", `${key}.vault`);
}

export function createVaultKey(password, salt = randomBytes(32)) {
  if (typeof password !== "string" || !password || password.length > 1024) throw new LocalError(400, "A valid password is required.");
  return { key: scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }), salt };
}

export function saveVault(file, data, material) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material.key, iv);
  cipher.setAAD(Buffer.from("bizovix-desktop-vault-v1"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const document = { version: 1, salt: material.salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  const handle = fs.openSync(temporary, "wx", 0o600);
  try { fs.writeFileSync(handle, JSON.stringify(document)); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  try { fs.renameSync(temporary, file); } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
}

export function unlockVault(file, password) {
  if (!fs.existsSync(file)) throw new LocalError(503, "First sign-in requires an internet connection and desktop activation.", "OFFLINE_PROFILE_MISSING");
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw new LocalError(401, "Unable to unlock this offline profile.", "OFFLINE_UNLOCK_FAILED");
  return unlockVaultBytes(fs.readFileSync(file), password);
}

export function unlockVaultBytes(bytes, password) {
  let document;
  let material;
  try {
    if (!Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024) throw new Error("Invalid vault bytes");
    document = JSON.parse(bytes.toString("utf8"));
    if (document.version !== 1 || Buffer.from(document.salt, "base64").length !== 32) throw new Error("Invalid vault");
    material = createVaultKey(password, Buffer.from(document.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", material.key, Buffer.from(document.iv, "base64"));
    decipher.setAAD(Buffer.from("bizovix-desktop-vault-v1"));
    decipher.setAuthTag(Buffer.from(document.tag, "base64"));
    const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(document.ciphertext, "base64")), decipher.final()]).toString("utf8"));
    return { material, data };
  } catch {
    material?.key.fill(0);
    throw new LocalError(401, "Unable to unlock this offline profile. Check your password or reconnect to sign in.", "OFFLINE_UNLOCK_FAILED");
  }
}
