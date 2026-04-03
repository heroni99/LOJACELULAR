import "reflect-metadata";
import "./common/load-env";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AppModule } from "./app.module";
import { getRequiredEnv } from "./common/env";
import { formatValidationErrors } from "./common/validation-errors";

getRequiredEnv("DATABASE_URL");
getRequiredEnv("JWT_SECRET");
getRequiredEnv("JWT_REFRESH_SECRET");

let app: NestExpressApplication;

async function bootstrap() {
  const configuredOrigins = new Set(
    (process.env.API_CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";

  app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (configuredOrigins.has(origin) || (isDevelopment && isLocalNetworkOrigin(origin))) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origem nao permitida pelo CORS: ${origin}`), false);
      },
      credentials: true
    }
  });

  const uploadsRoot = join(process.cwd(), "uploads");
  if (!existsSync(uploadsRoot)) {
    mkdirSync(uploadsRoot, { recursive: true });
  }

  app.useStaticAssets(uploadsRoot, {
    prefix: "/uploads/"
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(formatValidationErrors(errors))
    })
  );

  await app.init();
}

function isLocalNetworkOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);

    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return true;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    const private172Match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (!private172Match) {
      return false;
    }

    const secondOctet = Number(private172Match[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  } catch {
    return false;
  }
}

export default async (req: any, res: any) => {
  if (!app) {
    await bootstrap();
  }

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp(req, res);
};
