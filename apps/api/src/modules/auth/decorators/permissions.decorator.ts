import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@lojacelular/shared";

export const REQUIRED_PERMISSIONS_KEY = "required-permissions";

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
