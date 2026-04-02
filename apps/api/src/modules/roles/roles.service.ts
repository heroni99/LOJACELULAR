import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

type RoleAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: true
      },
      orderBy: {
        name: "asc"
      }
    });
  }

  async findById(id: string) {
    const role = await this.prisma.role.findUnique({
      where: {
        id
      },
      include: {
        permissions: true
      }
    });

    if (!role) {
      throw new NotFoundException("Papel nao encontrado.");
    }

    return role;
  }

  async updatePermissions(
    id: string,
    permissions: string[],
    context: RoleAuditContext
  ) {
    const previous = await this.findById(id);

    const role = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: id
        }
      });

      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permissionKey) => ({
            roleId: id,
            permissionKey
          }))
        });
      }

      return tx.role.findUniqueOrThrow({
        where: {
          id
        },
        include: {
          permissions: true
        }
      });
    });

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "roles.permissions_updated",
      entity: "roles",
      entityId: role.id,
      oldData: previous,
      newData: role,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return role;
  }
}
