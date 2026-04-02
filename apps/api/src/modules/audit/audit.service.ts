import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ListAuditDto } from "./dto/list-audit.dto";

type AuditLogInput = {
  storeId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: Prisma.InputJsonValue | null;
  newData?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: ListAuditDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.action
        ? {
            action: {
              contains: filters.action,
              mode: "insensitive"
            }
          }
        : {}),
      ...(filters.entity
        ? {
            entity: {
              contains: filters.entity,
              mode: "insensitive"
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                action: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                entity: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                ipAddress: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        store: {
          select: {
            id: true,
            code: true,
            name: true,
            displayName: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: Math.min(filters.take ?? 100, 200)
    });
  }

  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        storeId: input.storeId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldData: input.oldData ?? undefined,
        newData: input.newData ?? undefined,
        metadata: input.metadata ?? undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: Array.isArray(input.userAgent)
          ? input.userAgent.join(", ")
          : input.userAgent ?? null
      }
    });
  }
}
