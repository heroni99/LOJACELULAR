import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  ProductUnitStatus,
  PurchaseOrderStatus,
  StockMovementType
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSequenceDocumentNumber,
  ensureSequenceExists,
  getNextSequenceValue
} from "../../common/sequence-utils";
import { ChangePurchaseOrderStatusDto } from "./dto/change-purchase-order-status.dto";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { ListPurchaseOrdersDto } from "./dto/list-purchase-orders.dto";
import {
  ReceivePurchaseOrderDto,
  type ReceivePurchaseOrderItemInput,
  type ReceivePurchaseOrderUnitInput
} from "./dto/receive-purchase-order.dto";
import { PurchaseOrderItemInputDto } from "./dto/purchase-order-item-input.dto";
import { UpdatePurchaseOrderDto } from "./dto/update-purchase-order.dto";

type PurchaseOrderAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const purchaseOrderListInclude = {
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  _count: {
    select: {
      items: true,
      accountsPayable: true
    }
  }
} satisfies Prisma.PurchaseOrderInclude;

const purchaseOrderDetailInclude = {
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true,
      phone: true,
      email: true
    }
  },
  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  accountsPayable: {
    select: {
      id: true,
      description: true,
      amount: true,
      dueDate: true,
      status: true
    },
    orderBy: {
      createdAt: "desc"
    }
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          hasSerialControl: true,
          costPrice: true,
          active: true,
          isService: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.PurchaseOrderInclude;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(storeId: string, filters: ListPurchaseOrdersDto) {
    const where: Prisma.PurchaseOrderWhereInput = {
      storeId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            orderedAt: {
              ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
              ...(filters.endDate ? { lte: this.endOfDay(filters.endDate) } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                orderNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                supplier: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                supplier: {
                  tradeName: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.purchaseOrder.findMany({
      where,
      include: purchaseOrderListInclude,
      orderBy: [{ orderedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(filters.take ?? 100, 200)
    });
  }

  async findById(id: string, storeId: string) {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: {
        id,
        storeId
      },
      include: purchaseOrderDetailInclude
    });

    if (!order) {
      throw new NotFoundException("Pedido de compra nao encontrado.");
    }

    return order;
  }

  async create(
    storeId: string,
    payload: CreatePurchaseOrderDto,
    context: PurchaseOrderAuditContext
  ) {
    await this.assertSupplier(storeId, payload.supplierId);

    const order = await this.prisma.$transaction(async (tx) => {
      await ensureSequenceExists(tx, "seq_purchase_orders_number");
      const nextValue = await getNextSequenceValue(tx, "seq_purchase_orders_number");
      const orderNumber = buildSequenceDocumentNumber("PO", nextValue);
      const totals = await this.normalizeItems(tx, payload.items);

      const created = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          storeId,
          supplierId: payload.supplierId,
          createdByUserId: context.userId ?? null,
          notes: this.normalizeOptionalText(payload.notes),
          subtotal: totals.subtotal,
          discountAmount: payload.discountAmount ?? 0,
          total: totals.subtotal - (payload.discountAmount ?? 0),
          status: PurchaseOrderStatus.DRAFT
        }
      });

      for (const item of totals.items) {
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: created.id,
            productId: item.productId,
            description: item.description,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: item.totalCost
          }
        });
      }

      return tx.purchaseOrder.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: purchaseOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "purchase_orders.created",
      entity: "purchase_orders",
      entityId: order.id,
      newData: {
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        total: order.total,
        itemCount: order.items.length
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async update(
    id: string,
    storeId: string,
    payload: UpdatePurchaseOrderDto,
    context: PurchaseOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    if (
      previous.status !== PurchaseOrderStatus.DRAFT &&
      (payload.items || payload.supplierId || payload.discountAmount !== undefined)
    ) {
      throw new BadRequestException(
        "Somente pedidos em rascunho podem ter itens, fornecedor ou desconto alterados."
      );
    }

    if (previous.status === PurchaseOrderStatus.CANCELED) {
      throw new BadRequestException("Pedido cancelado nao pode ser editado.");
    }

    if (payload.supplierId) {
      await this.assertSupplier(storeId, payload.supplierId);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      let totals = {
        subtotal: previous.subtotal,
        total: previous.total,
        discountAmount: payload.discountAmount ?? previous.discountAmount
      };

      if (payload.items) {
        const normalized = await this.normalizeItems(tx, payload.items);
        totals = {
          subtotal: normalized.subtotal,
          total: normalized.subtotal - (payload.discountAmount ?? previous.discountAmount),
          discountAmount: payload.discountAmount ?? previous.discountAmount
        };

        await tx.purchaseOrderItem.deleteMany({
          where: {
            purchaseOrderId: previous.id
          }
        });

        for (const item of normalized.items) {
          await tx.purchaseOrderItem.create({
            data: {
              purchaseOrderId: previous.id,
              productId: item.productId,
              description: item.description,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.totalCost
            }
          });
        }
      }

      await tx.purchaseOrder.update({
        where: {
          id
        },
        data: {
          supplierId: payload.supplierId ?? undefined,
          notes: payload.notes === undefined ? undefined : this.normalizeOptionalText(payload.notes),
          discountAmount: payload.discountAmount ?? undefined,
          subtotal: payload.items ? totals.subtotal : undefined,
          total: payload.items || payload.discountAmount !== undefined ? totals.total : undefined
        }
      });

      return tx.purchaseOrder.findUniqueOrThrow({
        where: {
          id
        },
        include: purchaseOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "purchase_orders.updated",
      entity: "purchase_orders",
      entityId: order.id,
      oldData: {
        status: previous.status,
        total: previous.total
      },
      newData: {
        status: order.status,
        total: order.total
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async changeStatus(
    id: string,
    storeId: string,
    payload: ChangePurchaseOrderStatusDto,
    context: PurchaseOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    if (
      payload.status !== PurchaseOrderStatus.ORDERED &&
      payload.status !== PurchaseOrderStatus.CANCELED
    ) {
      throw new BadRequestException(
        "A mudanca de status desta etapa aceita apenas ORDERED ou CANCELED."
      );
    }

    if (payload.status === PurchaseOrderStatus.ORDERED) {
      if (previous.status !== PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException("Somente rascunhos podem ser enviados ao fornecedor.");
      }

      if (!previous.items.length || previous.total <= 0) {
        throw new BadRequestException(
          "Informe itens validos antes de enviar o pedido de compra."
        );
      }
    }

    if (payload.status === PurchaseOrderStatus.CANCELED) {
      if (
        previous.status === PurchaseOrderStatus.RECEIVED ||
        previous.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
      ) {
        throw new BadRequestException(
          "Nao e possivel cancelar pedido que ja possui recebimento."
        );
      }
    }

    const order = await this.prisma.purchaseOrder.update({
      where: {
        id
      },
      data: {
        status: payload.status,
        orderedAt:
          payload.status === PurchaseOrderStatus.ORDERED ? new Date() : undefined
      },
      include: purchaseOrderDetailInclude
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "purchase_orders.status_changed",
      entity: "purchase_orders",
      entityId: order.id,
      oldData: {
        status: previous.status
      },
      newData: {
        status: order.status
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async receive(
    id: string,
    storeId: string,
    payload: ReceivePurchaseOrderDto,
    context: PurchaseOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    const receivableStatuses: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.ORDERED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED
    ];

    if (!receivableStatuses.includes(previous.status)) {
      throw new BadRequestException(
        "Somente pedidos ordenados podem registrar recebimento."
      );
    }

    if (!payload.items.length) {
      throw new BadRequestException("Informe ao menos um item para recebimento.");
    }

    const order = await this.prisma.$transaction(async (tx) => {
      for (const itemPayload of payload.items) {
        await this.receiveItem(tx, previous, itemPayload, storeId, context.userId ?? null);
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({
        where: {
          purchaseOrderId: previous.id
        }
      });

      const fullyReceived = refreshedItems.every(
        (item) => item.receivedQuantity >= item.quantity
      );

      await tx.purchaseOrder.update({
        where: {
          id: previous.id
        },
        data: {
          status: fullyReceived
            ? PurchaseOrderStatus.RECEIVED
            : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          receivedAt: fullyReceived ? new Date() : undefined
        }
      });

      return tx.purchaseOrder.findUniqueOrThrow({
        where: {
          id: previous.id
        },
        include: purchaseOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "purchase_orders.received",
      entity: "purchase_orders",
      entityId: order.id,
      newData: {
        orderNumber: order.orderNumber,
        status: order.status,
        receivedAt: order.receivedAt
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  private async receiveItem(
    tx: Prisma.TransactionClient,
    order: Awaited<ReturnType<PurchaseOrdersService["findById"]>>,
    payload: ReceivePurchaseOrderItemInput,
    storeId: string,
    userId: string | null
  ) {
    const item = order.items.find((entry) => entry.id === payload.purchaseOrderItemId);

    if (!item) {
      throw new BadRequestException("Item do pedido nao pertence ao recebimento informado.");
    }

    await this.assertActiveLocation(tx, storeId, payload.locationId);

    const remainingQuantity = item.quantity - item.receivedQuantity;

    if (remainingQuantity <= 0) {
      throw new BadRequestException(
        `O item ${item.product.name} ja foi recebido integralmente.`
      );
    }

    if (item.product.hasSerialControl) {
      if (!payload.units?.length) {
        throw new BadRequestException(
          `Informe as unidades serializadas recebidas para ${item.product.name}.`
        );
      }

      if (payload.units.length > remainingQuantity) {
        throw new BadRequestException(
          `Quantidade recebida excede o saldo pendente de ${item.product.name}.`
        );
      }

      for (const unit of payload.units) {
        const identifiers = this.normalizeUnitIdentifiers(unit);
        this.assertUnitHasIdentifier(identifiers);
        await this.assertUnitIdentifiersAvailable(tx, identifiers);

        const createdUnit = await tx.productUnit.create({
          data: {
            productId: item.productId,
            supplierId: order.supplierId,
            currentLocationId: payload.locationId,
            purchasePrice: item.unitCost,
            unitStatus: ProductUnitStatus.IN_STOCK,
            imei: identifiers.imei,
            imei2: identifiers.imei2,
            serialNumber: identifiers.serialNumber,
            notes: this.normalizeOptionalText(unit.notes)
          }
        });

        await this.incrementBalance(tx, item.productId, payload.locationId, 1);

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            productUnitId: createdUnit.id,
            locationId: payload.locationId,
            movementType: StockMovementType.ENTRY,
            quantity: 1,
            unitCost: item.unitCost,
            referenceType: "purchase_order",
            referenceId: order.id,
            notes: `Recebimento do pedido ${order.orderNumber}`,
            userId
          }
        });
      }

      await tx.purchaseOrderItem.update({
        where: {
          id: item.id
        },
        data: {
          receivedQuantity: {
            increment: payload.units.length
          }
        }
      });
    } else {
      if (!payload.quantity || payload.quantity > remainingQuantity) {
        throw new BadRequestException(
          `Quantidade invalida para recebimento de ${item.product.name}.`
        );
      }

      await this.incrementBalance(tx, item.productId, payload.locationId, payload.quantity);

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          locationId: payload.locationId,
          movementType: StockMovementType.ENTRY,
          quantity: payload.quantity,
          unitCost: item.unitCost,
          referenceType: "purchase_order",
          referenceId: order.id,
          notes: `Recebimento do pedido ${order.orderNumber}`,
          userId
        }
      });

      await tx.purchaseOrderItem.update({
        where: {
          id: item.id
        },
        data: {
          receivedQuantity: {
            increment: payload.quantity
          }
        }
      });
    }

    await tx.product.update({
      where: {
        id: item.productId
      },
      data: {
        costPrice: item.unitCost
      }
    });
  }

  private async normalizeItems(
    tx: Prisma.TransactionClient,
    items: PurchaseOrderItemInputDto[]
  ) {
    if (!items.length) {
      throw new BadRequestException("O pedido de compra precisa de ao menos um item.");
    }

    const normalizedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await tx.product.findUnique({
        where: {
          id: item.productId
        },
        select: {
          id: true,
          active: true,
          isService: true
        }
      });

      if (!product || !product.active || product.isService) {
        throw new BadRequestException("Pedido de compra aceita apenas produtos fisicos ativos.");
      }

      const description = item.description.trim();

      if (!description) {
        throw new BadRequestException("Todo item do pedido exige descricao.");
      }

      const totalCost = item.quantity * item.unitCost;
      subtotal += totalCost;
      normalizedItems.push({
        productId: product.id,
        description,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost
      });
    }

    return {
      items: normalizedItems,
      subtotal
    };
  }

  private async assertSupplier(storeId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        active: true
      },
      select: {
        id: true
      }
    });

    if (!supplier) {
      throw new NotFoundException("Fornecedor nao encontrado para o pedido.");
    }
  }

  private async assertActiveLocation(
    tx: Prisma.TransactionClient,
    storeId: string,
    locationId: string
  ) {
    const location = await tx.stockLocation.findFirst({
      where: {
        id: locationId,
        storeId,
        active: true
      },
      select: {
        id: true
      }
    });

    if (!location) {
      throw new BadRequestException("Local de estoque invalido para recebimento.");
    }
  }

  private async incrementBalance(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantity: number
  ) {
    await tx.stockBalance.upsert({
      where: {
        productId_locationId: {
          productId,
          locationId
        }
      },
      create: {
        productId,
        locationId,
        quantity
      },
      update: {
        quantity: {
          increment: quantity
        }
      }
    });
  }

  private normalizeUnitIdentifiers(unit: ReceivePurchaseOrderUnitInput) {
    return {
      imei: this.normalizeOptionalText(unit.imei),
      imei2: this.normalizeOptionalText(unit.imei2),
      serialNumber: this.normalizeOptionalText(unit.serialNumber)
    };
  }

  private assertUnitHasIdentifier(identifiers: {
    imei: string | null;
    imei2: string | null;
    serialNumber: string | null;
  }) {
    if (!identifiers.imei && !identifiers.imei2 && !identifiers.serialNumber) {
      throw new BadRequestException(
        "Cada unidade serializada recebida precisa de IMEI ou serial."
      );
    }
  }

  private async assertUnitIdentifiersAvailable(
    tx: Prisma.TransactionClient,
    identifiers: {
      imei: string | null;
      imei2: string | null;
      serialNumber: string | null;
    }
  ) {
    const existing = await tx.productUnit.findFirst({
      where: {
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

    if (existing) {
      throw new BadRequestException(
        "Ja existe unidade serializada com um dos identificadores informados."
      );
    }
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }
}
