import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

const SAFE_SEQUENCE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SequenceClient = Pick<
  Prisma.TransactionClient,
  "$executeRawUnsafe" | "$queryRawUnsafe"
>;

export function assertSafeSequenceName(sequenceName: string) {
  if (!SAFE_SEQUENCE_NAME_REGEX.test(sequenceName)) {
    throw new BadRequestException("sequence_name invalido para geracao de numerador.");
  }
}

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

export async function ensureSequenceExists(
  client: SequenceClient,
  sequenceName: string
) {
  assertSafeSequenceName(sequenceName);
  await client.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS ${quoteIdentifier(sequenceName)} START WITH 1 INCREMENT BY 1`
  );
}

export async function getNextSequenceValue(
  client: SequenceClient,
  sequenceName: string
) {
  assertSafeSequenceName(sequenceName);
  const result = await client.$queryRawUnsafe<Array<{ next_value: bigint | number }>>(
    `SELECT nextval('${quoteIdentifier(sequenceName)}') AS next_value`
  );

  const nextValue = result[0]?.next_value;

  if (nextValue === undefined || nextValue === null) {
    throw new BadRequestException(
      "Nao foi possivel obter o proximo valor da sequence."
    );
  }

  return Number(nextValue);
}

export function buildSequenceDocumentNumber(prefix: string, sequenceValue: number) {
  return `${prefix}-${String(sequenceValue).padStart(6, "0")}`;
}
