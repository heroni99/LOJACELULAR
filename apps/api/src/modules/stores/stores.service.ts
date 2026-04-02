import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UpdateStoreBrandingDto } from "./dto/update-store-branding.dto";

type StoreAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll() {
    return this.prisma.store.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  async findById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: {
        id
      }
    });

    if (!store) {
      throw new NotFoundException("Loja nao encontrada.");
    }

    return store;
  }

  async findDefaultStore() {
    const store = await this.prisma.store.findFirst({
      where: {
        active: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!store) {
      throw new NotFoundException("Nenhuma loja ativa encontrada.");
    }

    return store;
  }

  async updateBranding(
    id: string,
    payload: UpdateStoreBrandingDto,
    context: StoreAuditContext
  ) {
    const previous = await this.findById(id);

    try {
      const store = await this.prisma.store.update({
        where: {
          id
        },
        data: {
          name: payload.name ?? undefined,
          displayName: payload.displayName ?? undefined,
          primaryColor: payload.primaryColor ?? undefined,
          secondaryColor: payload.secondaryColor ?? undefined,
          accentColor: payload.accentColor ?? undefined,
          logoUrl:
            payload.logoUrl === undefined
              ? undefined
              : payload.logoUrl || null,
          bannerUrl:
            payload.bannerUrl === undefined
              ? undefined
              : payload.bannerUrl || null,
          heroBannerEnabled: payload.heroBannerEnabled ?? undefined
        }
      });

      await this.auditService.log({
        storeId: context.storeId ?? store.id,
        userId: context.userId ?? null,
        action: "stores.settings.updated",
        entity: "stores",
        entityId: store.id,
        oldData: previous,
        newData: store,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return store;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Ja existe outra loja com esse codigo.");
      }

      throw error;
    }
  }
}
