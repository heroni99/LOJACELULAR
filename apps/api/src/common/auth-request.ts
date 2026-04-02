import type { TokenPayload } from "@lojacelular/shared";
import type { Request } from "express";

export type AuthenticatedUser = TokenPayload & {
  permissions: string[];
  roleId: string;
  roleName: string;
  storeCode: string;
  storeName: string;
  storeDisplayName: string;
};

export type AuthenticatedRequest = Request & {
  authUser?: AuthenticatedUser;
};
