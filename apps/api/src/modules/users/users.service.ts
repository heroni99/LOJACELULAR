import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ChangeUserPasswordDto } from "./dto/change-user-password.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { UpdateUserActiveDto } from "./dto/update-user-active.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const authUserInclude = {
  store: true,
  role: {
    include: {
      permissions: true
    }
  }
} satisfies Prisma.UserInclude;

const userListInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  },
  role: {
    select: {
      id: true,
      name: true,
      description: true,
      active: true
    }
  }
} satisfies Prisma.UserInclude;

type UserAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  roleName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type UserListRecord = Prisma.UserGetPayload<{
  include: typeof userListInclude;
}>;

export type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListUsersDto) {
    const where: Prisma.UserWhereInput = {
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.roleId ? { roleId: filters.roleId } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { email: { contains: filters.search, mode: "insensitive" } },
              { phone: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    return this.prisma.user.findMany({
      where,
      include: userListInclude,
      ...(filters.take === undefined ? {} : { take: filters.take }),
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id
      },
      include: userListInclude
    });

    if (!user) {
      throw new NotFoundException("Usuario nao encontrado.");
    }

    return user;
  }

  async create(payload: CreateUserDto, context: UserAuditContext) {
    const role = await this.findRoleOrThrow(payload.roleId);
    this.assertCanManageRole(context.roleName, null, role.name);
    const storeId = await this.resolveStoreId(payload.storeId, context.storeId);
    const passwordHash = await hash(payload.password, 10);

    try {
      const created = await this.prisma.user.create({
        data: {
          storeId,
          roleId: role.id,
          name: payload.name,
          email: payload.email.toLowerCase(),
          phone: payload.phone || null,
          passwordHash,
          active: true,
          mustChangePassword: payload.mustChangePassword ?? true
        }
      });
      const user = await this.findById(created.id);

      await this.auditService.log({
        storeId: context.storeId ?? user.store.id,
        userId: context.userId ?? null,
        action: "users.created",
        entity: "users",
        entityId: user.id,
        newData: user,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return user;
    } catch (error) {
      this.handleUniqueEmailConflict(error);
      throw error;
    }
  }

  async update(id: string, payload: UpdateUserDto, context: UserAuditContext) {
    const previous = await this.findManagedUser(id, context.roleName);
    const nextRole = payload.roleId
      ? await this.findRoleOrThrow(payload.roleId)
      : previous.role;
    const nextStoreId =
      payload.storeId === undefined
        ? previous.store.id
        : await this.resolveStoreId(payload.storeId, context.storeId);

    this.assertCanManageRole(context.roleName, previous.role.name, nextRole.name);

    try {
      await this.prisma.user.update({
        where: {
          id
        },
        data: {
          storeId: nextStoreId,
          roleId: nextRole.id,
          name: payload.name ?? undefined,
          email: payload.email?.toLowerCase() ?? undefined,
          phone: payload.phone === undefined ? undefined : payload.phone || null,
          mustChangePassword: payload.mustChangePassword ?? undefined
        }
      });
      const user = await this.findById(id);

      await this.auditService.log({
        storeId: context.storeId ?? user.store.id,
        userId: context.userId ?? null,
        action: "users.updated",
        entity: "users",
        entityId: user.id,
        oldData: previous,
        newData: user,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return user;
    } catch (error) {
      this.handleUniqueEmailConflict(error);
      throw error;
    }
  }

  async changePassword(
    id: string,
    payload: ChangeUserPasswordDto,
    context: UserAuditContext
  ) {
    const previous = await this.findManagedUser(id, context.roleName);
    const passwordHash = await hash(payload.newPassword, 10);

    await this.prisma.user.update({
      where: {
        id
      },
      data: {
        passwordHash,
        mustChangePassword: payload.mustChangePassword ?? false
      }
    });

    const user = await this.findById(id);

    await this.auditService.log({
      storeId: context.storeId ?? user.store.id,
      userId: context.userId ?? null,
      action: "users.password_changed",
      entity: "users",
      entityId: user.id,
      oldData: {
        mustChangePassword: previous.mustChangePassword
      },
      newData: {
        mustChangePassword: user.mustChangePassword
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return user;
  }

  async updateActive(
    id: string,
    payload: UpdateUserActiveDto,
    context: UserAuditContext
  ) {
    const previous = await this.findManagedUser(id, context.roleName);

    await this.prisma.user.update({
      where: {
        id
      },
      data: {
        active: payload.active
      }
    });

    const user = await this.findById(id);

    await this.auditService.log({
      storeId: context.storeId ?? user.store.id,
      userId: context.userId ?? null,
      action: payload.active ? "users.activated" : "users.deactivated",
      entity: "users",
      entityId: user.id,
      oldData: previous,
      newData: user,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return user;
  }

  async findByEmailForAuth(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase()
      },
      include: authUserInclude
    });
  }

  async findByIdForAuth(userId: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: {
        id: userId
      },
      include: authUserInclude
    });
  }

  async updateLastLoginAt(userId: string) {
    return this.prisma.user.update({
      where: {
        id: userId
      },
      data: {
        lastLoginAt: new Date()
      }
    });
  }

  private async findManagedUser(id: string, actorRoleName?: string | null) {
    const user = await this.findById(id);
    this.assertCanManageRole(actorRoleName, user.role.name, user.role.name);
    return user;
  }

  private async resolveStoreId(
    payloadStoreId: string | undefined,
    fallbackStoreId: string | null | undefined
  ) {
    const storeId = payloadStoreId ?? fallbackStoreId;

    if (storeId) {
      const store = await this.prisma.store.findUnique({
        where: {
          id: storeId
        },
        select: {
          id: true
        }
      });

      if (!store) {
        throw new NotFoundException("Loja nao encontrada.");
      }

      return store.id;
    }

    const store = await this.prisma.store.findFirst({
      where: {
        active: true
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true
      }
    });

    if (!store) {
      throw new NotFoundException("Nenhuma loja ativa encontrada.");
    }

    return store.id;
  }

  private async findRoleOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: {
        id: roleId
      },
      select: {
        id: true,
        name: true,
        active: true
      }
    });

    if (!role || !role.active) {
      throw new NotFoundException("Papel nao encontrado.");
    }

    return role;
  }

  private assertCanManageRole(
    actorRoleName: string | null | undefined,
    currentRoleName: string | null,
    nextRoleName: string | null
  ) {
    if (nextRoleName === "OWNER" && actorRoleName !== "OWNER") {
      throw new ForbiddenException("Somente OWNER pode criar ou promover outro OWNER.");
    }

    if (currentRoleName === "OWNER" && actorRoleName !== "OWNER") {
      throw new ForbiddenException("Somente OWNER pode alterar outro OWNER.");
    }
  }

  private handleUniqueEmailConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("Ja existe um usuario com esse e-mail.");
    }
  }
}
