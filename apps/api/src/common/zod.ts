import { BadRequestException } from "@nestjs/common";
import type { ZodTypeAny } from "zod";

export function parseWithSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  payload: unknown
) {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new BadRequestException({
      message: "Payload invalido.",
      issues: result.error.flatten()
    });
  }

  return result.data;
}
