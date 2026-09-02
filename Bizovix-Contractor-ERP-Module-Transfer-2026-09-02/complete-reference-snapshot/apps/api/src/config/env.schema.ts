import { z } from "zod";

function isValidOriginList(value: string) {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins.length) {
    return false;
  }

  return origins.every((origin) => {
    try {
      const parsed = new URL(origin);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  APP_ORIGIN: z.string().refine(isValidOriginList, "APP_ORIGIN must be a comma-separated list of valid URLs").default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  DEMO_DATABASE_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().default("localhost"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_NAMESPACE: z.string().default("bizovix:erp"),
  DEMO_REDIS_NAMESPACE: z.string().default("bizovix:erp:demo"),
  SWAGGER_ENABLED: z.coerce.boolean().default(true),
  CLOUD_SYNC_TOKEN: z.string().min(12).optional(),
  CLOUD_SYNC_MAX_BACKUP_MB: z.coerce.number().int().positive().default(50),
  // Single-user desktop installs sign in automatically: the app is already behind
  // the machine's own login, so /auth/desktop-session issues a normal session for
  // the local owner account without asking for a password. Off for hosted SaaS.
  DESKTOP_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DESKTOP_USER_EMAIL: z.string().optional(),
  // Set only when the owner has opted this specific install into "server mode"
  // for the LAN multi-PC feature (desktop/main.cjs writes this into the API
  // child process's env, never the .env file, so it can never silently persist
  // across a mode change). Widens the API's bind host from loopback-only to
  // every interface — see main.ts's app.listen() — so it must never be on by
  // default; DESKTOP_MODE alone must keep binding to 127.0.0.1.
  DESKTOP_ALLOW_LAN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Testing-phase escalation of desktop-session: also drop the loopback-only
  // and single-member restrictions so every PC that can reach this API (still
  // gated by DESKTOP_ALLOW_LAN's bind-host setting) auto-signs in with no
  // credentials at all, as whichever account was most recently active. Set by
  // desktop/main.cjs, never the .env file; flip it off there once real
  // per-teammate login should be enforced again (e.g. once subscription
  // billing goes live).
  DESKTOP_SKIP_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type AppEnvironment = z.infer<typeof envSchema>;

export function parseEnvironment(rawEnv: NodeJS.ProcessEnv): AppEnvironment {
  return envSchema.parse(rawEnv);
}
