import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ListEntitiesDto } from "../../common/dto/list-entities.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";

type SupplierAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListEntitiesDto) {
    const where: Prisma.SupplierWhereInput = {
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { tradeName: { contains: filters.search, mode: "insensitive" } },
              { cnpj: { contains: filters.search, mode: "insensitive" } },
              {
                stateRegistration: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.supplier.findMany({
      where,
      ...(filters.take === undefined ? {} : { take: filters.take }),
      orderBy: {
        name: "asc"
      }
    });
  }

  async findById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: {
        id
      }
    });

    if (!supplier) {
      throw new NotFoundException("Fornecedor nao encontrado.");
    }

    return supplier;
  }

  async create(payload: CreateSupplierDto, context: SupplierAuditContext) {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: payload.name,
        tradeName: payload.tradeName || null,
        cnpj: payload.cnpj || null,
        stateRegistration: payload.stateRegistration || null,
        email: payload.email || null,
        phone: payload.phone || null,
        contactName: payload.contactName || null,
        zipCode: payload.zipCode || null,
        address: payload.address || null,
        city: payload.city || null,
        state: payload.state || null,
        notes: payload.notes || null
      }
    });

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "suppliers.created",
      entity: "suppliers",
      entityId: supplier.id,
      newData: supplier,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return supplier;
  }

  async update(
    id: string,
    payload: UpdateSupplierDto,
    context: SupplierAuditContext
  ) {
    const previous = await this.findById(id);

    const supplier = await this.prisma.supplier.update({
      where: {
        id
      },
      data: {
        name: payload.name ?? undefined,
        tradeName:
          payload.tradeName === undefined ? undefined : payload.tradeName || null,
        cnpj: payload.cnpj === undefined ? undefined : payload.cnpj || null,
        stateRegistration:
          payload.stateRegistration === undefined
            ? undefined
            : payload.stateRegistration || null,
        email: payload.email === undefined ? undefined : payload.email || null,
        phone: payload.phone === undefined ? undefined : payload.phone || null,
        contactName:
          payload.contactName === undefined
            ? undefined
            : payload.contactName || null,
        zipCode:
          payload.zipCode === undefined ? undefined : payload.zipCode || null,
        address:
          payload.address === undefined ? undefined : payload.address || null,
        city: payload.city === undefined ? undefined : payload.city || null,
        state: payload.state === undefined ? undefined : payload.state || null,
        notes: payload.notes === undefined ? undefined : payload.notes || null,
        active: payload.active ?? undefined
      }
    });

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "suppliers.updated",
      entity: "suppliers",
      entityId: supplier.id,
      oldData: previous,
      newData: supplier,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return supplier;
  }

  async remove(id: string, context: SupplierAuditContext) {
    const previous = await this.findById(id);
    const supplier = await this.prisma.supplier.update({
      where: {
        id
      },
      data: {
        active: false
      }
    });

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "suppliers.deactivated",
      entity: "suppliers",
      entityId: supplier.id,
      oldData: previous,
      newData: supplier,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return supplier;
  }
}
