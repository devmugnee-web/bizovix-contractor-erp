import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import type { AppEnvironment } from "../config/env.schema.js";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly namespace: string;

  constructor(@Inject(ConfigService) configService: ConfigService<AppEnvironment, true>) {
    this.namespace = configService.get("REDIS_NAMESPACE", { infer: true });
    this.client = new Redis(configService.get("REDIS_URL", { infer: true }), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    this.client.on("error", (error: Error) => {
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });
  }

  private buildKey(key: string) {
    return `${this.namespace}:${key}`;
  }

  private async connectIfNeeded() {
    if (this.client.status === "ready" || this.client.status === "connect") {
      return true;
    }

    try {
      await this.client.connect();
      return true;
    } catch {
      return false;
    }
  }

  async increment(key: string, ttlSeconds: number) {
    const namespacedKey = this.buildKey(key);
    try {
      const connected = await this.connectIfNeeded();
      if (!connected) {
        return 0;
      }
      const value = await this.client.incr(namespacedKey);
      if (value === 1) {
        await this.client.expire(namespacedKey, ttlSeconds);
      }
      return value;
    } catch {
      return 0;
    }
  }

  async get(key: string) {
    try {
      const connected = await this.connectIfNeeded();
      if (!connected) {
        return null;
      }
      return this.client.get(this.buildKey(key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    try {
      const connected = await this.connectIfNeeded();
      if (!connected) {
        return;
      }
      await this.client.del(this.buildKey(key));
    } catch {
      return;
    }
  }

  async onModuleDestroy() {
    if (this.client.status !== "end") {
      await this.client.quit().catch(() => undefined);
    }
  }
}
