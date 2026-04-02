import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  Product,
  ProductUnitStatus,
  StockLocation,
  StockMovementType
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateInventoryAdjustmentDto } from "./dto/create-inventory-adjustment.dto";
import { CreateInventoryEntryDto } from "./dto/create-inventory-entry.dto";
import { CreateInventoryTransferDto } from "./dto/create-inventory-transfer.dto";
import { CreateProductUnitsDto, type CreateProductUnitItemDto } from "./dto/create-product-units.dto";
import { CreateStockLocationDto } from "./dto/create-stock-location.dto";
import { ListInventoryBalancesDto } from "./dto/list-inventory-balances.dto";
import { ListInventoryMovementsDto } from "./dto/list-inventory-movements.dto";
import { ListProductUnitsDto } from "./dto/list-product-units.dto";
import { ListStockLocationsDto } from "./dto/list-stock-locations.dto";
import { TransferProductUnitDto } from "./dto/transfer-product-unit.dto";
import { UpdateProductUnitDto } from "./dto/update-product-unit.dto";
import { UpdateStockLocationDto } from "./dto/update-stock-location.dto";

type InventoryAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const inventoryProductInclude = {
  category: {
    select: {
      id: true,
      name: true,
      prefix: true
    }
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  balances: {
    include: {
      location: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          active: true
        }
      }
    }
  }
} satisfies Prisma.ProductInclude;

const stockMovementInclude = {
  product: {
    select: {
      id: true,
      name: true,
      internalCode: true,
      supplierCode: true,
      isService: true
    }
  },
  productUnit: {
    select: {
      id: true,
      imei: true,
      imei2: true,
      serialNumber: true,
      unitStatus: true
    }
  },
  location: {
    select: {
      id: true,
      name: true,
      isDefault: true,
      active: true
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
} satisfies Prisma.StockMovementInclude;

const productUnitInclude = {
  product: {
    select: {
      id: true,
      name: true,
      internalCode: true,
      supplierCode: true,
      imageUrl: true,
      hasSerialControl: true,
      costPrice: true
    }
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  currentLocation: {
    select: {
      id: true,
      name: true,
      isDefault: true,
      active: true
    }
  }
} satisfies Prisma.ProductUnitInclude;

type InventoryProductRecord = Prisma.ProductGetPayload<{
  include: typeof inventoryProductInclude;
}>;

type InventoryBalanceLocationSummary = {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
};

type InventoryLocationRecord = Prisma.StockLocationGetPayload<{
  include: {
    balances: {
      select: {
        quantity: true;
      };
    };
  };
}>;

type BalanceSnapshot = {
  product: {
    id: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    stockMin: number;
    hasSerialControl: boolean;
    category: {
      id: string;
      name: string;
      prefix: string;
    };
    supplier: {
      id: string;
      name: string;
      tradeName: string | null;
    } | null;
  };
  location: InventoryBalanceLocationSummary;
  currentQuantity: number;
  totalStock: number;
  lowStock: boolean;
};

type ProductUnitRecord = Prisma.ProductUnitGetPayload<{
  include: typeof productUnitInclude;
}>;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async listStockLocations(storeId: string, filters: ListStockLocationsDto) {
    const where: Prisma.StockLocationWhereInput = {
      storeId,
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.search
        ? {
            OR: [
              {
                name: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                description: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    const locations = await this.prisma.stockLocation.findMany({
      where,
      include: {
        balances: {
          select: {
            quantity: true
          }
        }
      },
      orderBy: [{ isDefault: "desc" }, { active: "desc" }, { name: "asc" }],
      take: filters.take ?? 100
    });

    return locations.map((location) => this.serializeLocation(location));
  }

  async createStockLocation(
    storeId: string,
    payload: CreateStockLocationDto,
    context: InventoryAuditContext
  ) {
    const activeLocations = await this.prisma.stockLocation.findMany({
      where: {
        storeId
      },
      select: {
        id: true,
        isDefault: true,
        active: true
      }
    });

    const shouldBeDefault =
      activeLocations.length === 0 ? true : payload.isDefault ?? false;
    const shouldBeActive =
      activeLocations.length === 0 ? true : payload.active ?? true;

    if (shouldBeDefault && !shouldBeActive) {
      throw new BadRequestException("O local padrao precisa estar ativo.");
    }

    const location = await this.prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.stockLocation.updateMany({
          where: {
            storeId,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        });
      }

      return tx.stockLocation.create({
        data: {
          storeId,
          name: payload.name,
          description: payload.description ?? null,
          isDefault: shouldBeDefault,
          active: shouldBeActive
        },
        include: {
          balances: {
            select: {
              quantity: true
            }
          }
        }
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "stock_locations.created",
      entity: "stock_locations",
      entityId: location.id,
      newData: location,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.serializeLocation(location);
  }

  async updateStockLocation(
    id: string,
    storeId: string,
    payload: UpdateStockLocationDto,
    context: InventoryAuditContext
  ) {
    const previous = await this.getStockLocationWithBalancesOrFail(id, storeId);

    if (previous.isDefault && payload.isDefault === false) {
      throw new BadRequestException(
        "Defina outro local como padrao antes de remover o padrao deste registro."
      );
    }

    if (previous.isDefault && payload.active === false) {
      throw new BadRequestException(
        "Defina outro local como padrao antes de inativar o local padrao atual."
      );
    }

    const nextIsDefault = payload.isDefault ?? previous.isDefault;
    const nextActive = payload.active ?? previous.active;

    if (nextIsDefault && !nextActive) {
      throw new BadRequestException("O local padrao precisa permanecer ativo.");
    }

    const location = await this.prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.stockLocation.updateMany({
          where: {
            storeId,
            isDefault: true,
            id: {
              not: previous.id
            }
          },
          data: {
            isDefault: false
          }
        });
      }

      return tx.stockLocation.update({
        where: {
          id: previous.id
        },
        data: {
          name: payload.name ?? undefined,
          description:
            payload.description === undefined ? undefined : payload.description,
          isDefault: payload.isDefault ?? undefined,
          active: payload.active ?? undefined
        },
        include: {
          balances: {
            select: {
              quantity: true
            }
          }
        }
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "stock_locations.updated",
      entity: "stock_locations",
      entityId: location.id,
      oldData: previous,
      newData: location,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.serializeLocation(location);
  }

  async listBalances(storeId: string, filters: ListInventoryBalancesDto) {
    const selectedLocation = filters.locationId
      ? await this.findLocationSummaryOrFail(storeId, filters.locationId)
      : null;

    const products = await this.prisma.product.findMany({
      where: {
        isService: false,
        ...(filters.productId ? { id: filters.productId } : {}),
        ...(filters.active === undefined ? {} : { active: filters.active }),
        ...(filters.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: "insensitive" } },
                {
                  internalCode: {
                    contains: filters.search.toUpperCase(),
                    mode: "insensitive"
                  }
                },
                {
                  supplierCode: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                { brand: { contains: filters.search, mode: "insensitive" } },
                { model: { contains: filters.search, mode: "insensitive" } },
                {
                  units: {
                    some: {
                      OR: [
                        { imei: { contains: filters.search } },
                        { imei2: { contains: filters.search } },
                        { serialNumber: { contains: filters.search, mode: "insensitive" } }
                      ]
                    }
                  }
                }
              ]
            }
          : {})
      },
      include: {
        ...inventoryProductInclude,
        balances: {
          where: {
            location: {
              storeId,
              ...(filters.locationId ? { id: filters.locationId } : {})
            }
          },
          include: {
            location: {
              select: {
                id: true,
                name: true,
                isDefault: true,
                active: true
              }
            }
          }
        }
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: filters.take ?? 120
    });

    const rows = products
      .map((product) => this.serializeInventoryProduct(product, selectedLocation))
      .filter((row) => (filters.lowStockOnly ? row.lowStock : true));

    return rows;
  }

  async listMovements(storeId: string, filters: ListInventoryMovementsDto) {
    return this.prisma.stockMovement.findMany({
      where: {
        product: {
          isService: false
        },
        location: {
          storeId,
          ...(filters.locationId ? { id: filters.locationId } : {})
        },
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.movementType ? { movementType: filters.movementType } : {}),
        ...(filters.startDate || filters.endDate
          ? {
              createdAt: {
                ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
                ...(filters.endDate ? { lte: this.endOfDay(filters.endDate) } : {})
              }
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                {
                  product: {
                    name: {
                      contains: filters.search,
                      mode: "insensitive"
                    }
                  }
                },
                {
                  product: {
                    internalCode: {
                      contains: filters.search.toUpperCase(),
                      mode: "insensitive"
                    }
                  }
                },
                {
                  location: {
                    name: {
                      contains: filters.search,
                      mode: "insensitive"
                    }
                  }
                },
                {
                  notes: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  productUnit: {
                    imei: {
                      contains: filters.search
                    }
                  }
                },
                {
                  productUnit: {
                    imei2: {
                      contains: filters.search
                    }
                  }
                },
                {
                  productUnit: {
                    serialNumber: {
                      contains: filters.search,
                      mode: "insensitive"
                    }
                  }
                }
              ]
            }
          : {})
      },
      include: stockMovementInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: filters.take ?? 120
    });
  }

  async createEntry(
    storeId: string,
    payload: CreateInventoryEntryDto,
    context: InventoryAuditContext
  ) {
    const product = await this.getInventoryProductOrFail(payload.productId);
    const location = await this.getOperationalLocationOrFail(storeId, payload.locationId);

    if (product.hasSerialControl) {
      throw new BadRequestException(
        "Produto serializado deve entrar pela gestao de unidades."
      );
    }

    const unitCost = payload.unitCost ?? product.costPrice;
    const notes = this.normalizeOptionalText(payload.notes);
    const referenceId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const previousQuantity = await this.getCurrentBalanceQuantity(
        tx,
        product.id,
        location.id
      );

      await this.incrementBalance(tx, product.id, location.id, payload.quantity);

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          locationId: location.id,
          movementType: StockMovementType.ENTRY,
          quantity: payload.quantity,
          unitCost,
          referenceType: "inventory_entry",
          referenceId,
          notes,
          userId: context.userId ?? null
        }
      });

      const snapshot = await this.getBalanceSnapshot(tx, storeId, product.id, location.id);

      return {
        referenceId,
        previousQuantity,
        currentQuantity: snapshot.currentQuantity,
        totalStock: snapshot.totalStock,
        snapshot
      };
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.entry.created",
      entity: "stock_movements",
      entityId: referenceId,
      newData: {
        productId: product.id,
        locationId: location.id,
        quantity: payload.quantity,
        unitCost,
        notes,
        result
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  async createAdjustment(
    storeId: string,
    payload: CreateInventoryAdjustmentDto,
    context: InventoryAuditContext
  ) {
    const product = await this.getInventoryProductOrFail(payload.productId);
    const location = await this.getOperationalLocationOrFail(storeId, payload.locationId);

    if (product.hasSerialControl) {
      throw new BadRequestException(
        "Produto serializado deve ser ajustado pela gestao de unidades."
      );
    }

    const reason = payload.reason.trim();
    const referenceId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const previousQuantity = await this.getCurrentBalanceQuantity(
        tx,
        product.id,
        location.id
      );
      const delta = payload.countedQuantity - previousQuantity;

      if (delta === 0) {
        throw new BadRequestException(
          "O saldo contado ja corresponde ao saldo atual desse local."
        );
      }

      await this.setBalanceQuantity(
        tx,
        product.id,
        location.id,
        payload.countedQuantity
      );

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          locationId: location.id,
          movementType: StockMovementType.ADJUSTMENT,
          quantity: Math.abs(delta),
          unitCost: product.costPrice,
          referenceType: "inventory_adjustment",
          referenceId,
          notes: `${reason} | saldo ${previousQuantity} -> ${payload.countedQuantity}`,
          userId: context.userId ?? null
        }
      });

      const snapshot = await this.getBalanceSnapshot(tx, storeId, product.id, location.id);

      return {
        referenceId,
        previousQuantity,
        currentQuantity: snapshot.currentQuantity,
        delta,
        totalStock: snapshot.totalStock,
        snapshot
      };
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.adjustment.created",
      entity: "stock_movements",
      entityId: referenceId,
      newData: {
        productId: product.id,
        locationId: location.id,
        countedQuantity: payload.countedQuantity,
        reason,
        result
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  async listUnits(storeId: string, filters: ListProductUnitsDto) {
    const search = filters.search?.trim();
    const searchWhere: Prisma.ProductUnitWhereInput | undefined = search
      ? {
          OR: [
            {
              imei: {
                contains: search
              }
            },
            {
              imei2: {
                contains: search
              }
            },
            {
              serialNumber: {
                contains: search,
                mode: Prisma.QueryMode.insensitive
              }
            },
            {
              product: {
                name: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive
                }
              }
            },
            {
              product: {
                internalCode: {
                  contains: search.toUpperCase(),
                  mode: Prisma.QueryMode.insensitive
                }
              }
            },
            {
              product: {
                supplierCode: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive
                }
              }
            }
          ]
        }
      : undefined;

    const units = await this.prisma.productUnit.findMany({
      where: {
        product: {
          isService: false,
          hasSerialControl: true,
          ...(filters.productId ? { id: filters.productId } : {})
        },
        ...(filters.locationId ? { currentLocationId: filters.locationId } : {}),
        ...(filters.status ? { unitStatus: filters.status } : {}),
        AND: [
          {
            OR: [
              {
                currentLocation: {
                  storeId
                }
              },
              {
                movements: {
                  some: {
                    location: {
                      storeId
                    }
                  }
                }
              },
              {
                saleItems: {
                  some: {
                    sale: {
                      storeId
                    }
                  }
                }
              }
            ]
          },
          ...(searchWhere ? [searchWhere] : [])
        ]
      },
      include: productUnitInclude,
      orderBy: [{ createdAt: "desc" }],
      take: filters.take ?? 120
    });

    return units.map((unit) => this.serializeUnit(unit));
  }

  async createUnits(
    storeId: string,
    payload: CreateProductUnitsDto,
    context: InventoryAuditContext
  ) {
    const product = await this.getInventoryProductOrFail(payload.productId);
    const location = await this.getOperationalLocationOrFail(storeId, payload.locationId);

    if (!product.hasSerialControl) {
      throw new BadRequestException(
        "Use entrada agregada apenas para produto nao serializado."
      );
    }

    const purchasePrice = payload.purchasePrice ?? product.costPrice;
    const baseNotes = this.normalizeOptionalText(payload.notes);
    const referenceId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const createdUnits: ProductUnitRecord[] = [];

      for (const item of payload.units) {
        const identifiers = this.normalizeUnitIdentifiers(item);
        this.assertUnitHasIdentifier(identifiers);
        await this.assertUnitIdentifiersAvailable(tx, identifiers);

        const unit = await tx.productUnit.create({
          data: {
            productId: product.id,
            supplierId: product.supplier?.id ?? null,
            currentLocationId: location.id,
            purchasePrice,
            unitStatus: ProductUnitStatus.IN_STOCK,
            imei: identifiers.imei,
            imei2: identifiers.imei2,
            serialNumber: identifiers.serialNumber,
            notes: this.composeUnitNotes(baseNotes, item.notes)
          },
          include: productUnitInclude
        });

        await this.incrementBalance(tx, product.id, location.id, 1);
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            productUnitId: unit.id,
            locationId: location.id,
            movementType: StockMovementType.ENTRY,
            quantity: 1,
            unitCost: purchasePrice,
            referenceType: "inventory_unit_entry",
            referenceId,
            notes: unit.notes,
            userId: context.userId ?? null
          }
        });

        createdUnits.push(unit);
      }

      const snapshot = await this.getBalanceSnapshot(tx, storeId, product.id, location.id);

      return {
        referenceId,
        units: createdUnits.map((unit) => this.serializeUnit(unit)),
        snapshot
      };
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.units.created",
      entity: "product_units",
      entityId: referenceId,
      newData: {
        productId: product.id,
        locationId: location.id,
        quantity: result.units.length,
        unitIds: result.units.map((unit) => unit.id),
        snapshot: result.snapshot
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  async updateUnit(
    id: string,
    storeId: string,
    payload: UpdateProductUnitDto,
    context: InventoryAuditContext
  ) {
    const previous = await this.getProductUnitOrFail(id, storeId);

    if (previous.unitStatus === ProductUnitStatus.SOLD) {
      const onlyNotesChange =
        payload.notes !== undefined &&
        payload.imei === undefined &&
        payload.imei2 === undefined &&
        payload.serialNumber === undefined &&
        payload.supplierId === undefined &&
        payload.purchasePrice === undefined &&
        payload.unitStatus === undefined;

      if (!onlyNotesChange) {
        throw new BadRequestException(
          "Unidade vendida nao pode ter identificadores, status ou fornecedor alterados."
        );
      }
    }

    const nextIdentifiers = this.normalizeUnitIdentifiers({
      imei: payload.imei ?? previous.imei ?? undefined,
      imei2: payload.imei2 ?? previous.imei2 ?? undefined,
      serialNumber: payload.serialNumber ?? previous.serialNumber ?? undefined
    });

    this.assertUnitHasIdentifier(nextIdentifiers);
    await this.assertUnitIdentifiersAvailable(this.prisma, nextIdentifiers, previous.id);

    const nextStatus = payload.unitStatus ?? previous.unitStatus;

    if (nextStatus === ProductUnitStatus.SOLD) {
      throw new BadRequestException(
        "Use o fluxo de venda para concluir a saida da unidade serializada."
      );
    }

    if (!previous.currentLocationId) {
      throw new BadRequestException(
        "A unidade nao possui local atual para ser atualizada."
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const shouldRemoveFromBalance =
        this.countsTowardAvailableStock(previous.unitStatus) &&
        !this.countsTowardAvailableStock(nextStatus) &&
        previous.currentLocationId;
      const shouldReturnToBalance =
        !this.countsTowardAvailableStock(previous.unitStatus) &&
        this.countsTowardAvailableStock(nextStatus) &&
        previous.currentLocationId;

      if (shouldRemoveFromBalance) {
        await this.decrementBalanceOrFail(
          tx,
          previous.product.id,
          previous.currentLocationId!,
          1,
          `${previous.product.name} nao possui saldo disponivel para alterar a unidade.`
        );
      }

      if (shouldReturnToBalance) {
        await this.incrementBalance(tx, previous.product.id, previous.currentLocationId!, 1);
      }

      const unit = await tx.productUnit.update({
        where: {
          id: previous.id
        },
        data: {
          imei: nextIdentifiers.imei,
          imei2: nextIdentifiers.imei2,
          serialNumber: nextIdentifiers.serialNumber,
          supplierId: payload.supplierId === undefined ? undefined : payload.supplierId,
          purchasePrice:
            payload.purchasePrice === undefined ? undefined : payload.purchasePrice,
          unitStatus: nextStatus,
          notes:
            payload.notes === undefined ? undefined : this.normalizeOptionalText(payload.notes)
        },
        include: productUnitInclude
      });

      if (previous.unitStatus !== nextStatus && previous.currentLocationId) {
        await tx.stockMovement.create({
          data: {
            productId: previous.product.id,
            productUnitId: previous.id,
            locationId: previous.currentLocationId,
            movementType: StockMovementType.ADJUSTMENT,
            quantity: 1,
            unitCost: unit.purchasePrice ?? previous.product.costPrice,
            referenceType: "product_unit_status_update",
            referenceId: previous.id,
            notes: `Status da unidade ${previous.unitStatus} -> ${nextStatus}`,
            userId: context.userId ?? null
          }
        });
      }

      return unit;
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.unit.updated",
      entity: "product_units",
      entityId: previous.id,
      oldData: this.serializeUnit(previous),
      newData: this.serializeUnit(result),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.serializeUnit(result);
  }

  async transferUnit(
    id: string,
    storeId: string,
    payload: TransferProductUnitDto,
    context: InventoryAuditContext
  ) {
    const previous = await this.getProductUnitOrFail(id, storeId);

    if (!previous.currentLocationId || !previous.currentLocation) {
      throw new BadRequestException("A unidade nao possui local de origem disponivel.");
    }

    if (previous.unitStatus === ProductUnitStatus.SOLD) {
      throw new BadRequestException("Unidade vendida nao pode ser transferida.");
    }

    const toLocation = await this.getOperationalLocationOrFail(storeId, payload.toLocationId);

    if (toLocation.id === previous.currentLocationId) {
      throw new BadRequestException(
        "Selecione um local de destino diferente do local atual da unidade."
      );
    }

    const notes = this.normalizeOptionalText(payload.notes);
    const referenceId = randomUUID();
    const fromLocation = previous.currentLocation;

    const result = await this.prisma.$transaction(async (tx) => {
      if (this.countsTowardAvailableStock(previous.unitStatus)) {
        await this.decrementBalanceOrFail(
          tx,
          previous.product.id,
          previous.currentLocationId!,
          1,
          `Saldo indisponivel para transferir a unidade de ${previous.product.name}.`
        );
        await this.incrementBalance(tx, previous.product.id, toLocation.id, 1);
      }

      const unit = await tx.productUnit.update({
        where: {
          id: previous.id
        },
        data: {
          currentLocationId: toLocation.id
        },
        include: productUnitInclude
      });

      await tx.stockMovement.createMany({
        data: [
          {
            productId: previous.product.id,
            productUnitId: previous.id,
            locationId: previous.currentLocationId!,
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: 1,
            unitCost: previous.purchasePrice ?? previous.product.costPrice,
            referenceType: "product_unit_transfer",
            referenceId,
            notes: notes
              ? `${notes} | destino ${toLocation.name}`
              : `Transferencia da unidade para ${toLocation.name}`,
            userId: context.userId ?? null
          },
          {
            productId: previous.product.id,
            productUnitId: previous.id,
            locationId: toLocation.id,
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 1,
            unitCost: previous.purchasePrice ?? previous.product.costPrice,
            referenceType: "product_unit_transfer",
            referenceId,
            notes: notes
              ? `${notes} | origem ${fromLocation.name}`
              : `Transferencia da unidade vinda de ${fromLocation.name}`,
            userId: context.userId ?? null
          }
        ]
      });

      return {
        referenceId,
        unit: this.serializeUnit(unit)
      };
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.unit.transferred",
      entity: "product_units",
      entityId: previous.id,
      oldData: this.serializeUnit(previous),
      newData: result.unit,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  async createTransfer(
    storeId: string,
    payload: CreateInventoryTransferDto,
    context: InventoryAuditContext
  ) {
    if (payload.fromLocationId === payload.toLocationId) {
      throw new BadRequestException(
        "Selecione locais de origem e destino diferentes para a transferencia."
      );
    }

    const product = await this.getInventoryProductOrFail(payload.productId);

    if (product.hasSerialControl) {
      throw new BadRequestException(
        "Transferencia de produto serializado ainda nao e suportada na etapa atual."
      );
    }

    const fromLocation = await this.getOperationalLocationOrFail(
      storeId,
      payload.fromLocationId
    );
    const toLocation = await this.getOperationalLocationOrFail(storeId, payload.toLocationId);
    const notes = this.normalizeOptionalText(payload.notes);
    const referenceId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      const fromPreviousQuantity = await this.getCurrentBalanceQuantity(
        tx,
        product.id,
        fromLocation.id
      );
      const toPreviousQuantity = await this.getCurrentBalanceQuantity(
        tx,
        product.id,
        toLocation.id
      );

      const updatedSourceBalance = await tx.stockBalance.updateMany({
        where: {
          productId: product.id,
          locationId: fromLocation.id,
          quantity: {
            gte: payload.quantity
          }
        },
        data: {
          quantity: {
            decrement: payload.quantity
          }
        }
      });

      if (!updatedSourceBalance.count) {
        throw new BadRequestException(
          `Saldo insuficiente em ${fromLocation.name} para concluir a transferencia.`
        );
      }

      await this.incrementBalance(tx, product.id, toLocation.id, payload.quantity);

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          locationId: fromLocation.id,
          movementType: StockMovementType.TRANSFER_OUT,
          quantity: payload.quantity,
          unitCost: product.costPrice,
          referenceType: "inventory_transfer",
          referenceId,
          notes: notes
            ? `${notes} | destino ${toLocation.name}`
            : `Transferencia para ${toLocation.name}`,
          userId: context.userId ?? null
        }
      });

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          locationId: toLocation.id,
          movementType: StockMovementType.TRANSFER_IN,
          quantity: payload.quantity,
          unitCost: product.costPrice,
          referenceType: "inventory_transfer",
          referenceId,
          notes: notes
            ? `${notes} | origem ${fromLocation.name}`
            : `Transferencia vinda de ${fromLocation.name}`,
          userId: context.userId ?? null
        }
      });

      const fromSnapshot = await this.getBalanceSnapshot(
        tx,
        storeId,
        product.id,
        fromLocation.id
      );
      const toSnapshot = await this.getBalanceSnapshot(
        tx,
        storeId,
        product.id,
        toLocation.id
      );

      return {
        referenceId,
        quantity: payload.quantity,
        fromPreviousQuantity,
        fromCurrentQuantity: fromSnapshot.currentQuantity,
        toPreviousQuantity,
        toCurrentQuantity: toSnapshot.currentQuantity,
        fromSnapshot,
        toSnapshot
      };
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "inventory.transfer.created",
      entity: "stock_movements",
      entityId: referenceId,
      newData: {
        productId: product.id,
        fromLocationId: fromLocation.id,
        toLocationId: toLocation.id,
        quantity: payload.quantity,
        notes,
        result
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  private serializeLocation(location: InventoryLocationRecord) {
    const totalQuantity = location.balances.reduce(
      (sum, balance) => sum + balance.quantity,
      0
    );

    return {
      id: location.id,
      storeId: location.storeId,
      name: location.name,
      description: location.description,
      isDefault: location.isDefault,
      active: location.active,
      createdAt: location.createdAt,
      balanceSummary: {
        trackedProducts: location.balances.length,
        totalQuantity
      }
    };
  }

  private serializeInventoryProduct(
    product: InventoryProductRecord,
    selectedLocation: InventoryBalanceLocationSummary | null
  ) {
    const sortedBalances = [...product.balances].sort((left, right) => {
      if (left.location.isDefault === right.location.isDefault) {
        return left.location.name.localeCompare(right.location.name);
      }

      return left.location.isDefault ? -1 : 1;
    });

    const locationBalances =
      selectedLocation && sortedBalances.length === 0
        ? [
            {
              id: `zero-${product.id}-${selectedLocation.id}`,
              quantity: 0,
              updatedAt: null,
              location: selectedLocation
            }
          ]
        : sortedBalances.map((balance) => ({
            id: balance.id,
            quantity: balance.quantity,
            updatedAt: balance.updatedAt.toISOString(),
            location: balance.location
          }));

    const totalStock = locationBalances.reduce(
      (sum, balance) => sum + balance.quantity,
      0
    );

    return {
      id: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierCode: product.supplierCode,
      active: product.active,
      hasSerialControl: product.hasSerialControl,
      stockMin: product.stockMin,
      totalStock,
      lowStock: product.stockMin > 0 && totalStock < product.stockMin,
      category: product.category,
      supplier: product.supplier,
      balances: locationBalances
    };
  }

  private serializeUnit(unit: ProductUnitRecord) {
    return {
      id: unit.id,
      imei: unit.imei,
      imei2: unit.imei2,
      serialNumber: unit.serialNumber,
      purchasePrice: unit.purchasePrice,
      unitStatus: unit.unitStatus,
      notes: unit.notes,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
      product: unit.product,
      supplier: unit.supplier,
      currentLocation: unit.currentLocation
    };
  }

  private async getStockLocationWithBalancesOrFail(id: string, storeId: string) {
    const location = await this.prisma.stockLocation.findFirst({
      where: {
        id,
        storeId
      },
      include: {
        balances: {
          select: {
            quantity: true
          }
        }
      }
    });

    if (!location) {
      throw new NotFoundException("Local de estoque nao encontrado.");
    }

    return location;
  }

  private async findLocationSummaryOrFail(storeId: string, id: string) {
    const location = await this.prisma.stockLocation.findFirst({
      where: {
        id,
        storeId
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        active: true
      }
    });

    if (!location) {
      throw new NotFoundException("Local de estoque nao encontrado.");
    }

    return location;
  }

  private async getOperationalLocationOrFail(storeId: string, id: string) {
    const location = await this.findLocationSummaryOrFail(storeId, id);

    if (!location.active) {
      throw new BadRequestException("O local de estoque informado esta inativo.");
    }

    return location;
  }

  private async getProductUnitOrFail(id: string, storeId: string) {
    const unit = await this.prisma.productUnit.findFirst({
      where: {
        id,
        product: {
          isService: false,
          hasSerialControl: true
        },
        OR: [
          {
            currentLocation: {
              storeId
            }
          },
          {
            movements: {
              some: {
                location: {
                  storeId
                }
              }
            }
          },
          {
            saleItems: {
              some: {
                sale: {
                  storeId
                }
              }
            }
          }
        ]
      },
      include: productUnitInclude
    });

    if (!unit) {
      throw new NotFoundException("Unidade serializada nao encontrada.");
    }

    return unit;
  }

  private async getInventoryProductOrFail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId
      },
      select: {
        id: true,
        name: true,
        internalCode: true,
        supplierCode: true,
        costPrice: true,
        stockMin: true,
        hasSerialControl: true,
        isService: true,
        category: {
          select: {
            id: true,
            name: true,
            prefix: true
          }
        },
        supplier: {
          select: {
            id: true,
            name: true,
            tradeName: true
          }
        }
      }
    });

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para a operacao de estoque.");
    }

    if (product.isService) {
      throw new BadRequestException("Servico nao deve participar do fluxo de estoque.");
    }

    return product;
  }

  private assertProductCanUseInventory(
    product: Pick<Product, "hasSerialControl"> & { name: string },
    location: Pick<StockLocation, "isDefault"> & { name: string },
    operationName: string
  ) {
    if (product.hasSerialControl && !location.isDefault) {
      throw new BadRequestException(
        `Produto serializado so pode receber ${operationName} no local padrao enquanto a etapa atual nao controla unidade por local.`
      );
    }
  }

  private async getCurrentBalanceQuantity(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string
  ) {
    const balance = await tx.stockBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId
        }
      },
      select: {
        quantity: true
      }
    });

    return balance?.quantity ?? 0;
  }

  private async decrementBalanceOrFail(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantity: number,
    errorMessage: string
  ) {
    const updatedBalance = await tx.stockBalance.updateMany({
      where: {
        productId,
        locationId,
        quantity: {
          gte: quantity
        }
      },
      data: {
        quantity: {
          decrement: quantity
        }
      }
    });

    if (!updatedBalance.count) {
      throw new BadRequestException(errorMessage);
    }
  }

  private async incrementBalance(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantity: number
  ) {
    const existing = await tx.stockBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId
        }
      },
      select: {
        id: true
      }
    });

    if (existing) {
      await tx.stockBalance.update({
        where: {
          id: existing.id
        },
        data: {
          quantity: {
            increment: quantity
          }
        }
      });

      return;
    }

    await tx.stockBalance.create({
      data: {
        productId,
        locationId,
        quantity
      }
    });
  }

  private async setBalanceQuantity(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantity: number
  ) {
    const existing = await tx.stockBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId
        }
      },
      select: {
        id: true
      }
    });

    if (existing) {
      await tx.stockBalance.update({
        where: {
          id: existing.id
        },
        data: {
          quantity
        }
      });

      return;
    }

    await tx.stockBalance.create({
      data: {
        productId,
        locationId,
        quantity
      }
    });
  }

  private async getBalanceSnapshot(
    tx: Prisma.TransactionClient,
    storeId: string,
    productId: string,
    locationId: string
  ): Promise<BalanceSnapshot> {
    const product = await tx.product.findUnique({
      where: {
        id: productId
      },
      include: {
        ...inventoryProductInclude,
        balances: {
          where: {
            location: {
              storeId
            }
          },
          include: {
            location: {
              select: {
                id: true,
                name: true,
                isDefault: true,
                active: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      throw new NotFoundException("Produto nao encontrado ao montar o saldo.");
    }

    const row = this.serializeInventoryProduct(product, null);
    const balance = row.balances.find((entry) => entry.location.id === locationId);
    const location = product.balances.find(
      (entry) => entry.location.id === locationId
    )?.location;

    if (!location) {
      throw new NotFoundException("Local de estoque nao encontrado ao montar o saldo.");
    }

    return {
      product: {
        id: product.id,
        name: product.name,
        internalCode: product.internalCode,
        supplierCode: product.supplierCode,
        stockMin: product.stockMin,
        hasSerialControl: product.hasSerialControl,
        category: product.category,
        supplier: product.supplier
      },
      location,
      currentQuantity: balance?.quantity ?? 0,
      totalStock: row.totalStock,
      lowStock: row.lowStock
    };
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeUnitIdentifiers(
    value: Pick<CreateProductUnitItemDto, "imei" | "imei2" | "serialNumber">
  ) {
    return {
      imei: this.normalizeOptionalText(value.imei ?? undefined),
      imei2: this.normalizeOptionalText(value.imei2 ?? undefined),
      serialNumber: this.normalizeOptionalText(value.serialNumber ?? undefined)
    };
  }

  private assertUnitHasIdentifier(identifiers: {
    imei: string | null;
    imei2: string | null;
    serialNumber: string | null;
  }) {
    if (!identifiers.imei && !identifiers.imei2 && !identifiers.serialNumber) {
      throw new BadRequestException(
        "Cada unidade serializada precisa de IMEI, IMEI2 ou serial."
      );
    }
  }

  private async assertUnitIdentifiersAvailable(
    tx: Prisma.TransactionClient | PrismaService,
    identifiers: {
      imei: string | null;
      imei2: string | null;
      serialNumber: string | null;
    },
    unitId?: string
  ) {
    const existingUnit = await tx.productUnit.findFirst({
      where: {
        id: unitId ? { not: unitId } : undefined,
        OR: [
          ...(identifiers.imei ? [{ imei: identifiers.imei }] : []),
          ...(identifiers.imei2 ? [{ imei2: identifiers.imei2 }] : []),
          ...(identifiers.serialNumber
            ? [{ serialNumber: identifiers.serialNumber }]
            : [])
        ]
      },
      select: {
        id: true
      }
    });

    if (existingUnit) {
      throw new ConflictException(
        "Ja existe outra unidade serializada com um desses identificadores."
      );
    }

    const identifierCandidates = [
      identifiers.imei,
      identifiers.imei2,
      identifiers.serialNumber
    ].filter((value): value is string => Boolean(value));

    if (!identifierCandidates.length) {
      return;
    }

    const existingCode = await tx.productCode.findFirst({
      where: {
        code: {
          in: identifierCandidates
        }
      },
      select: {
        id: true
      }
    });

    if (existingCode) {
      throw new ConflictException(
        "Um desses identificadores ja esta em uso em product_codes."
      );
    }

    const existingProduct = await tx.product.findFirst({
      where: {
        internalCode: {
          in: identifierCandidates
        }
      },
      select: {
        id: true
      }
    });

    if (existingProduct) {
      throw new ConflictException(
        "Um desses identificadores ja esta em uso como internal_code."
      );
    }
  }

  private composeUnitNotes(baseNotes: string | null, unitNotes: string | undefined) {
    const normalizedUnitNotes = this.normalizeOptionalText(unitNotes);

    if (baseNotes && normalizedUnitNotes) {
      return `${baseNotes} | ${normalizedUnitNotes}`;
    }

    return normalizedUnitNotes ?? baseNotes;
  }

  private countsTowardAvailableStock(status: ProductUnitStatus) {
    return status === ProductUnitStatus.IN_STOCK;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }
}
