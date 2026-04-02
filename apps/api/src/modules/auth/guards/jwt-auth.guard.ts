import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { verify } from "jsonwebtoken";
import { tokenPayloadSchema } from "@lojacelular/shared";
import { getRequiredEnv } from "../../../common/env";
import { UsersService } from "../../users/users.service";
import { PUBLIC_ROUTE_KEY } from "../decorators/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<
        Request & {
          authUser?: Record<string, unknown>;
        }
      >();

    const [scheme, token] = request.headers.authorization?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("Token ausente.");
    }

    let payload: ReturnType<typeof tokenPayloadSchema.parse>;

    try {
      const decoded = verify(token, process.env.JWT_ACCESS_SECRET ?? getRequiredEnv("JWT_SECRET"));
      payload = tokenPayloadSchema.parse(decoded);
    } catch {
      throw new UnauthorizedException("Token invalido.");
    }

    const user = await this.usersService.findByIdForAuth(payload.sub);

    if (!user || !user.active) {
      throw new UnauthorizedException("Sessao invalida.");
    }

    request.authUser = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      storeId: user.storeId,
      permissions: user.role.permissions
        .map((permission) => permission.permissionKey)
        .sort((left, right) => left.localeCompare(right)),
      roleId: user.role.id,
      roleName: user.role.name,
      storeCode: user.store.code,
      storeName: user.store.name,
      storeDisplayName: user.store.displayName
    };

    return true;
  }
}
