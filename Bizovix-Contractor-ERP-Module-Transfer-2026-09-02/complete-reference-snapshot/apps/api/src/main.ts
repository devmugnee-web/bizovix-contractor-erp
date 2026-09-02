import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter.js";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor.js";
import type { AppEnvironment } from "./config/env.schema.js";

/** Headroom for the largest allowed attachment pair once base64-encoded. */
const REQUEST_BODY_LIMIT = "12mb";

// Startup-performance audit instrumentation (logging only — see desktop/main.cjs
// for the matching Electron-side timing). Captures when this module was first
// evaluated so bootstrap() can report how long Nest's own DI graph construction
// and lifecycle hooks (onModuleInit/onApplicationBootstrap) take, separately
// from app.listen() itself.
const MODULE_LOAD_AT = Date.now();

function parseAllowedOrigins(rawOrigin: string) {
  return rawOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isDevelopmentLocalOrigin(origin: string) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }

    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) {
      return true;
    }

    return /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}

async function bootstrap() {
  const startupLogger = new Logger("Startup");
  startupLogger.log(`[startup-timing] Module evaluated -> bootstrap() entered: ${Date.now() - MODULE_LOAD_AT}ms`);

  const nestCreateStartedAt = Date.now();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
  });
  startupLogger.log(
    `[startup-timing] NestFactory.create (DI graph + all onModuleInit/onApplicationBootstrap hooks): ${Date.now() - nestCreateStartedAt}ms`,
  );

  // A voucher can carry an attached image (2 MB) and document (5 MB) inline as base64,
  // which inflates them by about a third. The 100 kB default rejected such a request
  // before it was even read, so the whole voucher failed to save.
  app.useBodyParser("json", { limit: REQUEST_BODY_LIMIT });
  app.useBodyParser("urlencoded", { extended: true, limit: REQUEST_BODY_LIMIT });

  const configService = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  const logger = new Logger("Bootstrap");
  const port = configService.get("PORT", { infer: true });
  const appOrigin = configService.get("APP_ORIGIN", { infer: true });
  const nodeEnv = configService.get("NODE_ENV", { infer: true });
  const desktopMode = configService.get("DESKTOP_MODE", { infer: true });
  const desktopAllowLan = configService.get("DESKTOP_ALLOW_LAN", { infer: true });
  const allowedOrigins = new Set(parseAllowedOrigins(appOrigin));

  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      // The desktop renderer is always served from this machine, but Electron/Next
      // may canonicalize the loopback host between localhost and 127.0.0.1. Accept
      // loopback/private origins only in desktop mode so a packaged install cannot
      // lock itself out while hosted production keeps the strict allow-list.
      if ((desktopMode || nodeEnv !== "production") && isDevelopmentLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  });
  app.setGlobalPrefix("api/v1");

  if (configService.get("SWAGGER_ENABLED", { infer: true })) {
    const swaggerStartedAt = Date.now();
    const swaggerDocument = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Bizovix ERP API")
        .setDescription("Tenant-safe SaaS ERP foundation APIs")
        .setVersion("1.0.0")
        .addCookieAuth("access_token")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, swaggerDocument);
    startupLogger.log(`[startup-timing] Swagger doc generation (SWAGGER_ENABLED=true): ${Date.now() - swaggerStartedAt}ms`);
  } else {
    startupLogger.log("[startup-timing] Swagger doc generation: skipped (SWAGGER_ENABLED=false)");
  }

  // A desktop install only ever has one client — the Electron renderer on the same
  // machine — so binding to every network interface would needlessly expose it (and
  // its unauthenticated /auth/desktop-session auto-login) to the whole LAN. The
  // hosted/cloud deployment still needs 0.0.0.0 to accept traffic through its own
  // reverse proxy. DESKTOP_ALLOW_LAN is the one deliberate exception: the owner
  // opted this specific install into "server mode" for the multi-PC LAN feature
  // (desktop/main.cjs only ever sets it when network-mode.json says {mode:"server"}).
  // desktop-session itself stays loopback-only regardless — see its own guard in
  // auth.controller.ts — so widening the bind host here never exposes that
  // password-free endpoint off-machine, only the normal password-protected routes.
  const host = desktopMode && !desktopAllowLan ? "127.0.0.1" : "0.0.0.0";
  const listenStartedAt = Date.now();
  await app.listen(port, host);
  startupLogger.log(`[startup-timing] app.listen: ${Date.now() - listenStartedAt}ms`);
  startupLogger.log(`[startup-timing] TOTAL: module evaluated -> listening: ${Date.now() - MODULE_LOAD_AT}ms`);
  logger.log(`API listening on http://${host}:${String(port)}/api/v1`);
  logger.log(`Allowed web origins: ${Array.from(allowedOrigins).join(", ")}`);
}

void bootstrap();

