import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { compare } from "bcryptjs";
import { decode, sign, verify } from "jsonwebtoken";
import type {
  AuthSession,
  AuthUser,
  LoginInput,
  PermissionKey,
  RefreshSessionInput
} from "@lojacelular/shared";
import { getRequiredEnv } from "../../common/env";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService, type AuthUserRecord } from "../users/users.service";

type LoginContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
  jti: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService
  ) {}

  async login(input: LoginInput, context: LoginContext): Promise<AuthSession> {
    const email = input.email.toLowerCase();
    const user = await this.usersService.findByEmailForAuth(email);

    if (!user || !user.active) {
      await this.auditService.log({
        storeId: user?.storeId ?? null,
        userId: user?.id ?? null,
        action: "auth.login.failed",
        entity: "users",
        entityId: user?.id ?? null,
        newData: { email },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      throw new UnauthorizedException("Credenciais invalidas.");
    }

    const passwordMatches = await compare(input.password, user.passwordHash);

    if (!passwordMatches) {
      await this.auditService.log({
        storeId: user.storeId,
        userId: user.id,
        action: "auth.login.failed",
        entity: "users",
        entityId: user.id,
        newData: { email },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      throw new UnauthorizedException("Credenciais invalidas.");
    }

    await this.usersService.updateLastLoginAt(user.id);

    const session = await this.issueSession(user);

    await this.auditService.log({
      storeId: user.storeId,
      userId: user.id,
      action: "auth.login.success",
      entity: "users",
      entityId: user.id,
      newData: { email: user.email },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return session;
  }

  async refresh(
    input: RefreshSessionInput,
    context: LoginContext
  ): Promise<AuthSession> {
    const refreshTokenHash = this.hashToken(input.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash: refreshTokenHash
      }
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt <= new Date()) {
      await this.auditService.log({
        action: "auth.refresh.failed",
        entity: "refresh_tokens",
        entityId: storedToken?.id ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      throw new UnauthorizedException("Sessao expirada. Faca login novamente.");
    }

    try {
      const payload = verify(
        input.refreshToken,
        process.env.JWT_REFRESH_SECRET ?? getRequiredEnv("JWT_REFRESH_SECRET")
      ) as RefreshTokenPayload;

      if (!payload?.sub || !payload?.jti || payload.type !== "refresh") {
        throw new UnauthorizedException("Refresh token invalido.");
      }
    } catch {
      await this.auditService.log({
        action: "auth.refresh.failed",
        entity: "refresh_tokens",
        entityId: storedToken.id,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      throw new UnauthorizedException("Sessao expirada. Faca login novamente.");
    }

    const user = await this.usersService.findByIdForAuth(storedToken.userId);

    if (!user || !user.active) {
      throw new UnauthorizedException("Sessao invalida.");
    }

    await this.prisma.refreshToken.update({
      where: {
        id: storedToken.id
      },
      data: {
        revokedAt: new Date()
      }
    });

    const session = await this.issueSession(user);

    await this.auditService.log({
      storeId: user.storeId,
      userId: user.id,
      action: "auth.refresh.success",
      entity: "refresh_tokens",
      entityId: storedToken.id,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return session;
  }

  async logout(input: RefreshSessionInput, context: LoginContext) {
    const tokenHash = this.hashToken(input.refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash
      }
    });

    if (storedToken && !storedToken.revokedAt) {
      await this.prisma.refreshToken.update({
        where: {
          id: storedToken.id
        },
        data: {
          revokedAt: new Date()
        }
      });

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? storedToken.userId,
        action: "auth.logout",
        entity: "refresh_tokens",
        entityId: storedToken.id,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });
    }

    return {
      success: true
    };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.usersService.findByIdForAuth(userId);

    if (!user || !user.active) {
      throw new UnauthorizedException("Sessao invalida.");
    }

    return this.buildAuthenticatedUser(user);
  }

  private async issueSession(user: AuthUserRecord): Promise<AuthSession> {
    const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? "15m";
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? "7d";
    const refreshTokenId = randomUUID();
    const accessToken = sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role.name,
        storeId: user.storeId
      },
      process.env.JWT_ACCESS_SECRET ?? getRequiredEnv("JWT_SECRET"),
      {
        expiresIn: expiresIn as any
      }
    );
    const refreshToken = sign(
      {
        sub: user.id,
        type: "refresh",
        jti: refreshTokenId
      } satisfies RefreshTokenPayload,
      process.env.JWT_REFRESH_SECRET ?? getRequiredEnv("JWT_REFRESH_SECRET"),
      {
        expiresIn: refreshExpiresIn as any
      }
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.resolveExpiresAt(refreshToken)
      }
    });

    return {
      accessToken,
      expiresIn,
      refreshToken,
      refreshExpiresIn,
      user: this.buildAuthenticatedUser(user)
    };
  }

  private buildAuthenticatedUser(user: AuthUserRecord): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      permissions: user.role.permissions
        .map((permission) => permission.permissionKey)
        .sort((left, right) => left.localeCompare(right)) as PermissionKey[],
      role: {
        id: user.role.id,
        name: user.role.name
      },
      store: {
        id: user.store.id,
        code: user.store.code,
        name: user.store.name,
        displayName: user.store.displayName
      }
    };
  }

  private hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  private resolveExpiresAt(token: string) {
    const decoded = decode(token);

    if (
      !decoded ||
      typeof decoded !== "object" ||
      typeof decoded.exp !== "number"
    ) {
      throw new UnauthorizedException("Refresh token invalido.");
    }

    return new Date(decoded.exp * 1000);
  }
}
