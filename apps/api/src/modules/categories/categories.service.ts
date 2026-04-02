import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ListEntitiesDto } from "../../common/dto/list-entities.dto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

type CategoryAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const SAFE_SEQUENCE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListEntitiesDto) {
    const where: Prisma.CategoryWhereInput = {
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { prefix: { contains: filters.search, mode: "insensitive" } },
              {
                sequenceName: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.category.findMany({
      where,
      ...(filters.take === undefined ? {} : { take: filters.take }),
      orderBy: {
        name: "asc"
      }
    });
  }

  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: {
        id
      }
    });

    if (!category) {
      throw new NotFoundException("Categoria nao encontrada.");
    }

    return category;
  }

  async create(payload: CreateCategoryDto, context: CategoryAuditContext) {
    this.assertSafeSequenceName(payload.sequenceName);

    try {
      const category = await this.prisma.$transaction(async (tx) => {
        const createdCategory = await tx.category.create({
          data: {
            name: payload.name,
            prefix: payload.prefix,
            description: payload.description || null,
            defaultSerialized: payload.defaultSerialized ?? false,
            sequenceName: payload.sequenceName
          }
        });

        await this.createSequence(tx, createdCategory.sequenceName);

        return createdCategory;
      });

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "categories.created",
        entity: "categories",
        entityId: category.id,
        newData: category,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return category;
    } catch (error) {
      if (this.isUniqueConstraintError(error) || this.isDuplicateRelationError(error)) {
        throw new ConflictException(
          "Ja existe uma categoria com esse nome, prefixo ou sequence_name."
        );
      }

      throw error;
    }
  }

  async update(
    id: string,
    payload: UpdateCategoryDto,
    context: CategoryAuditContext
  ) {
    const previous = await this.findById(id);
    const nextSequenceName = payload.sequenceName ?? previous.sequenceName;

    this.assertSafeSequenceName(nextSequenceName);

    try {
      const category = await this.prisma.$transaction(async (tx) => {
        if (payload.sequenceName && payload.sequenceName !== previous.sequenceName) {
          await this.createSequence(tx, previous.sequenceName);
          await this.renameSequence(
            tx,
            previous.sequenceName,
            payload.sequenceName
          );
        } else {
          await this.createSequence(tx, previous.sequenceName);
        }

        return tx.category.update({
          where: {
            id
          },
          data: {
            name: payload.name ?? undefined,
            prefix: payload.prefix ?? undefined,
            description:
              payload.description === undefined
                ? undefined
                : payload.description || null,
            defaultSerialized: payload.defaultSerialized ?? undefined,
            sequenceName: payload.sequenceName ?? undefined,
            active: payload.active ?? undefined
          }
        });
      });

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "categories.updated",
        entity: "categories",
        entityId: category.id,
        oldData: previous,
        newData: category,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return category;
    } catch (error) {
      if (this.isUniqueConstraintError(error) || this.isDuplicateRelationError(error)) {
        throw new ConflictException(
          "Ja existe uma categoria com esse nome, prefixo ou sequence_name."
        );
      }

      throw error;
    }
  }

  async remove(id: string, context: CategoryAuditContext) {
    const previous = await this.findById(id);
    const category = await this.prisma.category.update({
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
      action: "categories.deactivated",
      entity: "categories",
      entityId: category.id,
      oldData: previous,
      newData: category,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return category;
  }

  private assertSafeSequenceName(sequenceName: string) {
    if (!SAFE_SEQUENCE_NAME_REGEX.test(sequenceName)) {
      throw new InternalServerErrorException(
        "sequence_name invalido para criacao de sequence."
      );
    }
  }

  private async createSequence(
    prisma: Prisma.TransactionClient,
    sequenceName: string
  ) {
    this.assertSafeSequenceName(sequenceName);

    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${this.quoteIdentifier(sequenceName)} START WITH 1 INCREMENT BY 1`
    );
  }

  private async renameSequence(
    prisma: Prisma.TransactionClient,
    previousSequenceName: string,
    nextSequenceName: string
  ) {
    if (previousSequenceName === nextSequenceName) {
      return;
    }

    this.assertSafeSequenceName(previousSequenceName);
    this.assertSafeSequenceName(nextSequenceName);

    await prisma.$executeRawUnsafe(
      `ALTER SEQUENCE ${this.quoteIdentifier(previousSequenceName)} RENAME TO ${this.quoteIdentifier(nextSequenceName)}`
    );
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier}"`;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private isDuplicateRelationError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      typeof error.meta?.code === "string" &&
      error.meta.code === "42P07"
    );
  }
}
