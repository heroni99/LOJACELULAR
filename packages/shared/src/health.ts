import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  app: z.string(),
  timestamp: z.string(),
  version: z.string(),
  database: z.object({
    status: z.enum(["up", "down"]),
    message: z.string()
  })
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
