import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@lojacelular/shared";
import { PUBLIC_ROUTE_KEY } from "../decorators/public.decorator";
import { REQUIRED_PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions =
      this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (!requiredPermissions.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      authUser?: { permissions?: string[] };
    }>();

    const userPermissions = new Set(request.authUser?.permissions ?? []);
    const missingPermission = requiredPermissions.find(
      (permission) => !userPermissions.has(permission)
    );

    if (missingPermission) {
      throw new ForbiddenException("Voce nao tem permissao para realizar esta acao.");
    }

    return true;
  }
}
