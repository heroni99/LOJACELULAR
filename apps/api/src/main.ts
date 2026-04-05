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

async function bootstrap() {
  const configuredOrigins = new Set(
    (process.env.API_CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
  const isDevelopment = (process.env.NODE_ENV ?? "development") !== "production";

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (
          configuredOrigins.has(origin) ||
          (isDevelopment && isLocalNetworkOrigin(origin))
        ) {
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

  const host = process.env.API_HOST ?? "0.0.0.0";
  const port = resolvePort();
  await app.listen(port, host);

  console.log(`API pronta em http://${host}:${port}/api`);
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

function resolvePort() {
  const value = process.env.PORT ?? process.env.API_PORT ?? "3000";
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Porta invalida para a API: ${value}`);
  }

  return port;
}

void bootstrap();
