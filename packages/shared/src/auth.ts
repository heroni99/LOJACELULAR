import { z } from "zod";

export const permissionKeys = [
  "stores.read",
  "stores.update",
  "users.read",
  "users.create",
  "users.update",
  "users.change_password",
  "users.activate",
  "roles.read",
  "roles.update",
  "customers.read",
  "customers.create",
  "customers.update",
  "suppliers.read",
  "suppliers.create",
  "suppliers.update",
  "categories.read",
  "categories.create",
  "categories.update",
  "products.read",
  "products.create",
  "products.update",
  "inventory.read",
  "inventory.entry",
  "inventory.adjust",
  "inventory.transfer",
  "cash.read",
  "cash.open",
  "cash.move",
  "cash.close",
  "sales.read",
  "sales.checkout",
  "sales.cancel",
  "sales.refund",
  "accounts-payable.read",
  "accounts-payable.create",
  "accounts-payable.update",
  "accounts-payable.pay",
  "accounts-receivable.read",
  "accounts-receivable.create",
  "accounts-receivable.update",
  "accounts-receivable.receive",
  "service-orders.read",
  "service-orders.create",
  "service-orders.update",
  "purchase-orders.read",
  "purchase-orders.create",
  "purchase-orders.update",
  "purchase-orders.receive",
  "sale-returns.read",
  "sale-returns.create",
  "financial.read",
  "commissions.read",
  "commissions.manage",
  "reports.read",
  "audit.read",
  "fiscal.read",
  "fiscal.issue",
  "fiscal.cancel"
] as const;

export const phase1PermissionKeys = permissionKeys;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail.")
    .email("Informe um e-mail valido."),
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
});

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token ausente.")
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  mustChangePassword: z.boolean(),
  permissions: z.array(z.enum(permissionKeys)).catch([]),
  role: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),
  store: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    displayName: z.string()
  })
});

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.string().min(1),
  refreshToken: z.string().min(1),
  refreshExpiresIn: z.string().min(1),
  user: authUserSchema
});

export const tokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: z.string(),
  storeId: z.string().uuid()
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type TokenPayload = z.infer<typeof tokenPayloadSchema>;
export type PermissionKey = (typeof permissionKeys)[number];
export type Phase1PermissionKey = PermissionKey;
