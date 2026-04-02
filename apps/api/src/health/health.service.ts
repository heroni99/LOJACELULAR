import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");

      return {
        status: "ok" as const,
        app: process.env.APP_NAME ?? "ALPHA TECNOLOGIA",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
        database: {
          status: "up" as const,
          message: "Conexao com PostgreSQL disponivel."
        }
      };
    } catch {
      return {
        status: "degraded" as const,
        app: process.env.APP_NAME ?? "ALPHA TECNOLOGIA",
        timestamp: new Date().toISOString(),
        version: "0.1.0",
        database: {
          status: "down" as const,
          message: "Nao foi possivel acessar o PostgreSQL."
        }
      };
    }
  }
}
