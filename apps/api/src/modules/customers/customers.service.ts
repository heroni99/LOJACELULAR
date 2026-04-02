import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ListEntitiesDto } from "../../common/dto/list-entities.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";

type CustomerAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListEntitiesDto) {
    const where: Prisma.CustomerWhereInput = {
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { cpfCnpj: { contains: filters.search, mode: "insensitive" } },
              { email: { contains: filters.search, mode: "insensitive" } },
              { phone: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    return this.prisma.customer.findMany({
      where,
      ...(filters.take === undefined ? {} : { take: filters.take }),
      orderBy: {
        name: "asc"
      }
    });
  }

  async findById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id
      }
    });

    if (!customer) {
      throw new NotFoundException("Cliente nao encontrado.");
    }

    return customer;
  }

  async create(payload: CreateCustomerDto, context: CustomerAuditContext) {
    const customer = await this.prisma.customer.create({
      data: {
        name: payload.name,
        cpfCnpj: payload.cpfCnpj || null,
        email: payload.email || null,
        phone: payload.phone,
        phone2: payload.phone2 || null,
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
      action: "customers.created",
      entity: "customers",
      entityId: customer.id,
      newData: customer,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return customer;
  }

  async update(
    id: string,
    payload: UpdateCustomerDto,
    context: CustomerAuditContext
  ) {
    const previous = await this.findById(id);

    const customer = await this.prisma.customer.update({
      where: {
        id
      },
      data: {
        name: payload.name ?? undefined,
        cpfCnpj:
          payload.cpfCnpj === undefined ? undefined : payload.cpfCnpj || null,
        email: payload.email === undefined ? undefined : payload.email || null,
        phone: payload.phone ?? undefined,
        phone2:
          payload.phone2 === undefined ? undefined : payload.phone2 || null,
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
      action: "customers.updated",
      entity: "customers",
      entityId: customer.id,
      oldData: previous,
      newData: customer,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return customer;
  }

  async remove(id: string, context: CustomerAuditContext) {
    const previous = await this.findById(id);
    const customer = await this.prisma.customer.update({
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
      action: "customers.deactivated",
      entity: "customers",
      entityId: customer.id,
      oldData: previous,
      newData: customer,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return customer;
  }
}
