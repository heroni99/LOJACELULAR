import { InternalServerErrorException } from "@nestjs/common";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new InternalServerErrorException(
      `Variavel de ambiente obrigatoria ausente: ${name}`
    );
  }

  return value;
}
