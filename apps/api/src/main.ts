import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { validationExceptionFactory } from "./common/utils/validation-exception-factory";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  const configService = app.get(ConfigService);
  const appConfig = configService.get<AppConfig>("app")!;

  await app.listen(appConfig.port);
  console.log(`${appConfig.appName} API running on http://localhost:${appConfig.port}/api/v1`);
}

bootstrap();
