import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/index.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const connectStartedAt = Date.now();
    await this.$connect();
    this.logger.log("Prisma connected");
    this.logger.log(`[startup-timing] Prisma $connect: ${Date.now() - connectStartedAt}ms`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
