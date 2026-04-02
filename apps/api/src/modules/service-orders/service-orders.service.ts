import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  ProductUnitStatus,
  ServiceOrderItemType,
  ServiceOrderStatus,
  StockMovementType
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSequenceDocumentNumber,
  ensureSequenceExists,
  getNextSequenceValue
} from "../../common/sequence-utils";
import { ChangeServiceOrderStatusDto } from "./dto/change-service-order-status.dto";
import { ConsumeServiceOrderItemDto } from "./dto/consume-service-order-item.dto";
import { CreateServiceOrderDto } from "./dto/create-service-order.dto";
import { ListServiceOrdersDto } from "./dto/list-service-orders.dto";
import { ServiceOrderItemInputDto } from "./dto/service-order-item-input.dto";
import { UpdateServiceOrderDto } from "./dto/update-service-order.dto";

type ServiceOrderAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const serviceOrderListInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  assignedToUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  _count: {
    select: {
      items: true,
      statusHistory: true
    }
  }
} satisfies Prisma.ServiceOrderInclude;

const serviceOrderDetailInclude = {
  customer: {
    select: {
      id: true,
      name: true,
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
  assignedToUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  relatedSale: {
    select: {
      id: true,
      saleNumber: true,
      receiptNumber: true,
      total: true,
      completedAt: true
    }
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          isService: true,
          hasSerialControl: true,
          costPrice: true
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
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  },
  statusHistory: {
    include: {
      changedByUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.ServiceOrderInclude;

type ServiceOrderRecord = Prisma.ServiceOrderGetPayload<{
  include: typeof serviceOrderDetailInclude;
}>;

const TERMINAL_STATUSES = new Set<ServiceOrderStatus>([
  ServiceOrderStatus.CANCELED,
  ServiceOrderStatus.REJECTED,
  ServiceOrderStatus.DELIVERED
]);

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  OPEN: [ServiceOrderStatus.WAITING_APPROVAL, ServiceOrderStatus.CANCELED],
  WAITING_APPROVAL: [
    ServiceOrderStatus.APPROVED,
    ServiceOrderStatus.REJECTED,
    ServiceOrderStatus.CANCELED
  ],
  APPROVED: [
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.WAITING_PARTS,
    ServiceOrderStatus.CANCELED
  ],
  IN_PROGRESS: [
    ServiceOrderStatus.WAITING_PARTS,
    ServiceOrderStatus.READY_FOR_DELIVERY,
    ServiceOrderStatus.CANCELED
  ],
  WAITING_PARTS: [
    ServiceOrderStatus.IN_PROGRESS,
    ServiceOrderStatus.CANCELED
  ],
  READY_FOR_DELIVERY: [ServiceOrderStatus.DELIVERED],
  DELIVERED: [],
  CANCELED: [],
  REJECTED: []
};

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(storeId: string, filters: ListServiceOrdersDto) {
    const where: Prisma.ServiceOrderWhereInput = {
      storeId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.assignedToUserId
        ? { assignedToUserId: filters.assignedToUserId }
        : {}),
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
                orderNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                customer: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                brand: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                model: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                imei: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                serialNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                reportedIssue: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.serviceOrder.findMany({
      where,
      include: serviceOrderListInclude,
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(filters.take ?? 100, 200)
    });
  }

  async findById(id: string, storeId: string) {
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id,
        storeId
      },
      include: serviceOrderDetailInclude
    });

    if (!order) {
      throw new NotFoundException("Ordem de servico nao encontrada.");
    }

    return order;
  }

  async create(
    storeId: string,
    payload: CreateServiceOrderDto,
    context: ServiceOrderAuditContext
  ) {
    await this.assertCustomer(storeId, payload.customerId);
    await this.assertUserBelongsToStore(storeId, payload.assignedToUserId);
    await this.assertRelatedSale(storeId, payload.relatedSaleId);

    const order = await this.prisma.$transaction(async (tx) => {
      await ensureSequenceExists(tx, "seq_service_orders_number");
      const nextValue = await getNextSequenceValue(tx, "seq_service_orders_number");
      const orderNumber = buildSequenceDocumentNumber("SO", nextValue);

      const created = await tx.serviceOrder.create({
        data: {
          orderNumber,
          storeId,
          customerId: payload.customerId,
          createdByUserId: this.requireUserId(context.userId),
          assignedToUserId: payload.assignedToUserId ?? null,
          relatedSaleId: payload.relatedSaleId ?? null,
          deviceType: payload.deviceType.trim(),
          brand: payload.brand.trim(),
          model: payload.model.trim(),
          imei: this.normalizeOptionalText(payload.imei),
          imei2: this.normalizeOptionalText(payload.imei2),
          serialNumber: this.normalizeOptionalText(payload.serialNumber),
          color: this.normalizeOptionalText(payload.color),
          accessories: this.normalizeOptionalText(payload.accessories),
          reportedIssue: payload.reportedIssue.trim(),
          foundIssue: this.normalizeOptionalText(payload.foundIssue),
          technicalNotes: this.normalizeOptionalText(payload.technicalNotes),
          estimatedCompletionDate: payload.estimatedCompletionDate
            ? new Date(payload.estimatedCompletionDate)
            : null,
          totalFinal: payload.totalFinal ?? null
        }
      });

      const totals = await this.replaceEditableItems(tx, created.id, payload.items ?? []);

      await tx.serviceOrder.update({
        where: {
          id: created.id
        },
        data: {
          totalEstimated: totals.totalEstimated,
          totalFinal: payload.totalFinal ?? totals.totalEstimated
        }
      });

      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: created.id,
          oldStatus: null,
          newStatus: ServiceOrderStatus.OPEN,
          notes: "Ordem de servico criada.",
          changedByUserId: context.userId ?? null
        }
      });

      return tx.serviceOrder.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: serviceOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.created",
      entity: "service_orders",
      entityId: order.id,
      newData: {
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        status: order.status,
        totalEstimated: order.totalEstimated
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async update(
    id: string,
    storeId: string,
    payload: UpdateServiceOrderDto,
    context: ServiceOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    if (TERMINAL_STATUSES.has(previous.status)) {
      throw new BadRequestException(
        "Ordens encerradas, rejeitadas ou canceladas nao podem ser editadas."
      );
    }

    if (payload.customerId) {
      await this.assertCustomer(storeId, payload.customerId);
    }

    if (payload.assignedToUserId !== undefined) {
      await this.assertUserBelongsToStore(storeId, payload.assignedToUserId ?? undefined);
    }

    if (payload.relatedSaleId !== undefined) {
      await this.assertRelatedSale(storeId, payload.relatedSaleId ?? undefined);
    }

    const order = await this.prisma.$transaction(async (tx) => {
      let totalEstimated = previous.totalEstimated;

      if (payload.items) {
        const totals = await this.replaceEditableItems(tx, previous.id, payload.items);
        totalEstimated = totals.totalEstimated;
      }

      await tx.serviceOrder.update({
        where: {
          id
        },
        data: {
          customerId: payload.customerId ?? undefined,
          assignedToUserId:
            payload.assignedToUserId === undefined
              ? undefined
              : payload.assignedToUserId || null,
          relatedSaleId:
            payload.relatedSaleId === undefined ? undefined : payload.relatedSaleId || null,
          deviceType: payload.deviceType?.trim(),
          brand: payload.brand?.trim(),
          model: payload.model?.trim(),
          imei:
            payload.imei === undefined ? undefined : this.normalizeOptionalText(payload.imei),
          imei2:
            payload.imei2 === undefined ? undefined : this.normalizeOptionalText(payload.imei2),
          serialNumber:
            payload.serialNumber === undefined
              ? undefined
              : this.normalizeOptionalText(payload.serialNumber),
          color:
            payload.color === undefined ? undefined : this.normalizeOptionalText(payload.color),
          accessories:
            payload.accessories === undefined
              ? undefined
              : this.normalizeOptionalText(payload.accessories),
          reportedIssue: payload.reportedIssue?.trim(),
          foundIssue:
            payload.foundIssue === undefined
              ? undefined
              : this.normalizeOptionalText(payload.foundIssue),
          technicalNotes:
            payload.technicalNotes === undefined
              ? undefined
              : this.normalizeOptionalText(payload.technicalNotes),
          estimatedCompletionDate:
            payload.estimatedCompletionDate === undefined
              ? undefined
              : payload.estimatedCompletionDate
                ? new Date(payload.estimatedCompletionDate)
                : null,
          totalEstimated,
          totalFinal: payload.totalFinal === undefined ? undefined : payload.totalFinal
        }
      });

      return tx.serviceOrder.findUniqueOrThrow({
        where: {
          id
        },
        include: serviceOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.updated",
      entity: "service_orders",
      entityId: order.id,
      oldData: {
        status: previous.status,
        totalEstimated: previous.totalEstimated,
        totalFinal: previous.totalFinal
      },
      newData: {
        status: order.status,
        totalEstimated: order.totalEstimated,
        totalFinal: order.totalFinal
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async changeStatus(
    id: string,
    storeId: string,
    payload: ChangeServiceOrderStatusDto,
    context: ServiceOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    if (!ALLOWED_TRANSITIONS[previous.status].includes(payload.status)) {
      throw new BadRequestException(
        `Nao e possivel mover a OS ${previous.orderNumber} de ${previous.status} para ${payload.status}.`
      );
    }

    if (
      (payload.status === ServiceOrderStatus.WAITING_APPROVAL ||
        payload.status === ServiceOrderStatus.APPROVED) &&
      previous.totalEstimated <= 0
    ) {
      throw new BadRequestException(
        "Informe itens ou valor estimado antes de enviar a OS para aprovacao."
      );
    }

    const resolvedTotalFinal =
      payload.totalFinal ?? previous.totalFinal ?? previous.totalEstimated;

    if (
      (payload.status === ServiceOrderStatus.READY_FOR_DELIVERY ||
        payload.status === ServiceOrderStatus.DELIVERED) &&
      resolvedTotalFinal <= 0
    ) {
      throw new BadRequestException(
        "Informe o valor final antes de concluir a OS para entrega."
      );
    }

    const now = new Date();

    const order = await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.update({
        where: {
          id
        },
        data: {
          status: payload.status,
          totalFinal:
            payload.status === ServiceOrderStatus.READY_FOR_DELIVERY ||
            payload.status === ServiceOrderStatus.DELIVERED
              ? resolvedTotalFinal
              : payload.totalFinal === undefined
                ? undefined
                : payload.totalFinal,
          approvedAt:
            payload.status === ServiceOrderStatus.APPROVED ? now : undefined,
          rejectedAt:
            payload.status === ServiceOrderStatus.REJECTED ? now : undefined,
          deliveredAt:
            payload.status === ServiceOrderStatus.DELIVERED ? now : undefined
        }
      });

      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: id,
          oldStatus: previous.status,
          newStatus: payload.status,
          notes: this.normalizeOptionalText(payload.notes),
          changedByUserId: context.userId ?? null
        }
      });

      return tx.serviceOrder.findUniqueOrThrow({
        where: {
          id
        },
        include: serviceOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.status_changed",
      entity: "service_orders",
      entityId: order.id,
      oldData: {
        status: previous.status
      },
      newData: {
        status: order.status,
        totalFinal: order.totalFinal
      },
      metadata: {
        notes: payload.notes ?? null
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return order;
  }

  async consumeItem(
    orderId: string,
    itemId: string,
    storeId: string,
    payload: ConsumeServiceOrderItemDto,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);

    const consumableStatuses: ServiceOrderStatus[] = [
      ServiceOrderStatus.APPROVED,
      ServiceOrderStatus.IN_PROGRESS,
      ServiceOrderStatus.WAITING_PARTS,
      ServiceOrderStatus.READY_FOR_DELIVERY
    ];

    if (!consumableStatuses.includes(order.status)) {
      throw new BadRequestException(
        "So e possivel consumir pecas em OS aprovada ou em andamento."
      );
    }

    const item = order.items.find((entry) => entry.id === itemId);

    if (!item) {
      throw new NotFoundException("Item da OS nao encontrado.");
    }

    if (item.itemType !== ServiceOrderItemType.PART) {
      throw new BadRequestException("Somente pecas afetam estoque na OS.");
    }

    if (item.stockConsumed) {
      throw new BadRequestException("Esta peca ja foi consumida.");
    }

    if (!item.product) {
      throw new BadRequestException("A peca vinculada nao esta mais disponivel.");
    }

    const product = item.product;

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      let locationId = payload.locationId ?? null;

      if (product.hasSerialControl) {
        if (!item.productUnitId) {
          throw new BadRequestException(
            "Pecas serializadas exigem unidade vinculada na OS."
          );
        }

        const unit = await tx.productUnit.findUnique({
          where: {
            id: item.productUnitId
          },
          select: {
            id: true,
            productId: true,
            unitStatus: true,
            currentLocationId: true,
            currentLocation: {
              select: {
                id: true,
                storeId: true,
                active: true
              }
            }
          }
        });

        if (!unit || unit.productId !== item.productId) {
          throw new BadRequestException("Unidade serializada invalida para a OS.");
        }

        if (unit.unitStatus !== ProductUnitStatus.IN_STOCK) {
          throw new BadRequestException(
            "A unidade serializada nao esta disponivel em estoque."
          );
        }

        if (!unit.currentLocationId || !unit.currentLocation) {
          throw new BadRequestException(
            "A unidade serializada nao possui local atual valido."
          );
        }

        if (unit.currentLocation.storeId !== storeId || !unit.currentLocation.active) {
          throw new BadRequestException(
            "A unidade serializada nao pertence a um local operacional ativo."
          );
        }

        if (locationId && locationId !== unit.currentLocationId) {
          throw new BadRequestException(
            "A unidade serializada nao pertence ao local informado."
          );
        }

        locationId = unit.currentLocationId;

        const balanceResult = await tx.stockBalance.updateMany({
          where: {
            productId: item.productId!,
            locationId,
            quantity: {
              gte: 1
            }
          },
          data: {
            quantity: {
              decrement: 1
            }
          }
        });

        if (!balanceResult.count) {
          throw new BadRequestException("Estoque insuficiente para consumir a unidade.");
        }

        await tx.productUnit.update({
          where: {
            id: unit.id
          },
          data: {
            unitStatus: ProductUnitStatus.SOLD,
            currentLocationId: null
          }
        });
      } else {
        if (!locationId) {
          throw new BadRequestException(
            "Informe o local de estoque para consumir a peca."
          );
        }

        await this.assertActiveLocation(tx, storeId, locationId);

        const balanceResult = await tx.stockBalance.updateMany({
          where: {
            productId: item.productId!,
            locationId,
            quantity: {
              gte: item.quantity
            }
          },
          data: {
            quantity: {
              decrement: item.quantity
            }
          }
        });

        if (!balanceResult.count) {
          throw new BadRequestException("Estoque insuficiente para consumir a peca.");
        }
      }

      await tx.stockMovement.create({
        data: {
          productId: item.productId!,
          productUnitId: item.productUnitId ?? null,
          locationId: locationId!,
          movementType: StockMovementType.EXIT,
          quantity: item.quantity,
          unitCost: product.costPrice,
          referenceType: "service_order",
          referenceId: order.id,
          notes: `Consumo na OS ${order.orderNumber}`,
          userId: context.userId ?? null
        }
      });

      await tx.serviceOrderItem.update({
        where: {
          id: item.id
        },
        data: {
          stockConsumed: true
        }
      });

      return tx.serviceOrder.findUniqueOrThrow({
        where: {
          id: order.id
        },
        include: serviceOrderDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.item_consumed",
      entity: "service_order_items",
      entityId: item.id,
      newData: {
        serviceOrderId: order.id,
        orderNumber: order.orderNumber,
        productId: item.productId,
        quantity: item.quantity
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return updatedOrder;
  }

  private async replaceEditableItems(
    tx: Prisma.TransactionClient,
    serviceOrderId: string,
    items: ServiceOrderItemInputDto[]
  ) {
    const existingItems = await tx.serviceOrderItem.findMany({
      where: {
        serviceOrderId
      },
      include: {
        product: {
          select: {
            costPrice: true
          }
        }
      }
    });

    const consumedItems = existingItems.filter((item) => item.stockConsumed);
    const removableIds = existingItems
      .filter((item) => !item.stockConsumed)
      .map((item) => item.id);

    if (removableIds.length) {
      await tx.serviceOrderItem.deleteMany({
        where: {
          id: {
            in: removableIds
          }
        }
      });
    }

    let newItemsTotal = 0;

    for (const item of items) {
      const normalized = await this.normalizeItemInput(tx, item);
      newItemsTotal += normalized.totalPrice;

      await tx.serviceOrderItem.create({
        data: {
          serviceOrderId,
          productId: normalized.productId,
          productUnitId: normalized.productUnitId,
          itemType: normalized.itemType,
          description: normalized.description,
          quantity: normalized.quantity,
          unitPrice: normalized.unitPrice,
          totalPrice: normalized.totalPrice
        }
      });
    }

    const consumedTotal = consumedItems.reduce((total, item) => total + item.totalPrice, 0);

    return {
      totalEstimated: consumedTotal + newItemsTotal
    };
  }

  private async normalizeItemInput(
    tx: Prisma.TransactionClient,
    item: ServiceOrderItemInputDto
  ) {
    const description = item.description.trim();

    if (!description) {
      throw new BadRequestException("Todo item da OS precisa de descricao.");
    }

    const totalPrice = item.quantity * item.unitPrice;
    let productId: string | null = null;
    let productUnitId: string | null = null;

    if (item.itemType === ServiceOrderItemType.MANUAL_ITEM) {
      if (item.productId || item.productUnitId) {
        throw new BadRequestException(
          "Itens manuais da OS nao podem referenciar produto ou unidade."
        );
      }
    }

    if (item.itemType === ServiceOrderItemType.PART) {
      if (!item.productId) {
        throw new BadRequestException("Pecas da OS exigem produto vinculado.");
      }

      const product = await tx.product.findUnique({
        where: {
          id: item.productId
        },
        select: {
          id: true,
          isService: true,
          active: true,
          hasSerialControl: true
        }
      });

      if (!product || !product.active || product.isService) {
        throw new BadRequestException("A peca vinculada a OS e invalida.");
      }

      if (product.hasSerialControl) {
        if (!item.productUnitId || item.quantity !== 1) {
          throw new BadRequestException(
            "Pecas serializadas exigem uma unidade especifica na OS."
          );
        }
      }

      productId = product.id;
      productUnitId = item.productUnitId ?? null;
    }

    if (item.itemType === ServiceOrderItemType.SERVICE && item.productId) {
      const product = await tx.product.findUnique({
        where: {
          id: item.productId
        },
        select: {
          id: true,
          isService: true,
          active: true
        }
      });

      if (!product || !product.active || !product.isService) {
        throw new BadRequestException("O servico vinculado na OS e invalido.");
      }

      productId = product.id;
    }

    return {
      itemType: item.itemType,
      productId,
      productUnitId,
      description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice
    };
  }

  private async assertCustomer(storeId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        active: true
      },
      select: {
        id: true
      }
    });

    if (!customer) {
      throw new NotFoundException("Cliente nao encontrado para a OS.");
    }
  }

  private async assertUserBelongsToStore(
    storeId: string,
    userId: string | undefined
  ) {
    if (!userId) {
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        storeId,
        active: true
      },
      select: {
        id: true
      }
    });

    if (!user) {
      throw new NotFoundException("Usuario responsavel nao encontrado na loja.");
    }
  }

  private async assertRelatedSale(storeId: string, saleId: string | undefined) {
    if (!saleId) {
      return;
    }

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId
      },
      select: {
        id: true
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda relacionada nao encontrada.");
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
      throw new BadRequestException("Local de estoque invalido para a operacao.");
    }
  }

  private requireUserId(userId?: string | null) {
    if (!userId) {
      throw new BadRequestException("Usuario autenticado nao informado para a OS.");
    }

    return userId;
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
