import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
  Prisma,
  ProductUnitStatus,
  RefundType,
  SaleStatus,
  StockMovementType
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSequenceDocumentNumber,
  ensureSequenceExists,
  getNextSequenceValue
} from "../../common/sequence-utils";
import {
  CreateSaleReturnDto,
  type CreateSaleReturnItemInput
} from "./dto/create-sale-return.dto";
import { ListSaleReturnsDto } from "./dto/list-sale-returns.dto";

type SaleReturnAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type SaleItemForReturn = Prisma.SaleItemGetPayload<{
  include: {
    product: {
      select: {
        id: true;
        name: true;
        internalCode: true;
        isService: true;
        hasSerialControl: true;
        costPrice: true;
      };
    };
    productUnit: {
      select: {
        id: true;
        imei: true;
        imei2: true;
        serialNumber: true;
        unitStatus: true;
        currentLocationId: true;
      };
    };
  };
}>;

const saleReturnListInclude = {
  sale: {
    select: {
      id: true,
      saleNumber: true,
      receiptNumber: true,
      status: true,
      total: true
    }
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  _count: {
    select: {
      items: true
    }
  }
} satisfies Prisma.SaleReturnInclude;

const saleReturnDetailInclude = {
  sale: {
    select: {
      id: true,
      saleNumber: true,
      receiptNumber: true,
      status: true,
      total: true,
      completedAt: true,
      cashSessionId: true
    }
  },
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
  items: {
    include: {
      saleItem: {
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
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.SaleReturnInclude;

@Injectable()
export class SaleReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(storeId: string, filters: ListSaleReturnsDto) {
    const where: Prisma.SaleReturnWhereInput = {
      sale: {
        storeId
      },
      ...(filters.saleId ? { saleId: filters.saleId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.refundType ? { refundType: filters.refundType } : {}),
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
                returnNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                sale: {
                  saleNumber: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                customer: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              }
            ]
          }
        : {})
    };

    return this.prisma.saleReturn.findMany({
      where,
      include: saleReturnListInclude,
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(filters.take ?? 100, 200)
    });
  }

  async findById(id: string, storeId: string) {
    const record = await this.prisma.saleReturn.findFirst({
      where: {
        id,
        sale: {
          storeId
        }
      },
      include: saleReturnDetailInclude
    });

    if (!record) {
      throw new NotFoundException("Devolucao nao encontrada.");
    }

    return record;
  }

  async create(
    storeId: string,
    payload: CreateSaleReturnDto,
    context: SaleReturnAuditContext
  ) {
    if (!payload.items.length) {
      throw new BadRequestException("Informe ao menos um item para a devolucao.");
    }

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: payload.saleId,
        storeId
      },
      include: {
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
                unitStatus: true,
                currentLocationId: true
              }
            }
          }
        },
        saleReturns: {
          include: {
            items: true
          }
        },
        customer: {
          select: {
            id: true
          }
        }
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada para devolucao.");
    }

    if (sale.status === SaleStatus.CANCELED) {
      throw new BadRequestException("Vendas canceladas nao aceitam devolucao.");
    }

    const refundNeedsCashSession = ([
      RefundType.CASH,
      RefundType.PIX,
      RefundType.CARD_REVERSAL
    ] as RefundType[]).includes(payload.refundType);

    const currentCashSession = refundNeedsCashSession
      ? await this.prisma.cashSession.findFirst({
          where: {
            status: CashSessionStatus.OPEN,
            cashTerminal: {
              storeId
            }
          },
          orderBy: {
            openedAt: "desc"
          }
        })
      : null;

    if (refundNeedsCashSession && !currentCashSession) {
      throw new BadRequestException(
        "Abra um caixa para registrar reembolso monetario da devolucao."
      );
    }

    const itemMap = new Map(sale.items.map((item) => [item.id, item]));
    const returnedByItem = new Map<string, number>();

    for (const previousReturn of sale.saleReturns) {
      for (const item of previousReturn.items) {
        returnedByItem.set(
          item.saleItemId,
          (returnedByItem.get(item.saleItemId) ?? 0) + item.quantity
        );
      }
    }

    const totalAmount = payload.items.reduce((sum, item) => sum + item.amount, 0);

    const result = await this.prisma.$transaction(async (tx) => {
      await ensureSequenceExists(tx, "seq_sale_returns_number");
      const nextValue = await getNextSequenceValue(tx, "seq_sale_returns_number");
      const returnNumber = buildSequenceDocumentNumber("SR", nextValue);

      const created = await tx.saleReturn.create({
        data: {
          saleId: sale.id,
          customerId: sale.customerId,
          returnNumber,
          reason: payload.reason.trim(),
          refundType: payload.refundType,
          totalAmount,
          createdByUserId: context.userId ?? null
        }
      });

      for (const itemInput of payload.items) {
        const saleItem = itemMap.get(itemInput.saleItemId);

        if (!saleItem) {
          throw new BadRequestException("Item informado nao pertence a venda.");
        }

        const alreadyReturned = returnedByItem.get(saleItem.id) ?? 0;
        const remaining = saleItem.quantity - alreadyReturned;

        if (itemInput.quantity > remaining) {
          throw new BadRequestException(
            `Quantidade devolvida excede o saldo restante de ${saleItem.product.name}.`
          );
        }

        if (saleItem.product.hasSerialControl && itemInput.quantity !== 1) {
          throw new BadRequestException(
            `Itens serializados devem ser devolvidos unidade por unidade: ${saleItem.product.name}.`
          );
        }

        if (saleItem.product.isService && itemInput.returnToStock) {
          throw new BadRequestException(
            `Servico nao pode retornar ao estoque: ${saleItem.product.name}.`
          );
        }

        await tx.saleReturnItem.create({
          data: {
            saleReturnId: created.id,
            saleItemId: saleItem.id,
            quantity: itemInput.quantity,
            returnToStock: itemInput.returnToStock,
            amount: itemInput.amount
          }
        });

        if (itemInput.returnToStock && !saleItem.product.isService) {
          await this.restoreStock(
            tx,
            storeId,
            created.id,
            created.returnNumber,
            saleItem,
            itemInput,
            context.userId ?? null
          );
        }

        returnedByItem.set(saleItem.id, alreadyReturned + itemInput.quantity);
      }

      if (refundNeedsCashSession) {
        await tx.saleRefund.create({
          data: {
            saleId: sale.id,
            reason: `[${payload.refundType}] ${payload.reason.trim()}`,
            amount: totalAmount,
            createdBy: context.userId ?? null
          }
        });

        await tx.cashMovement.create({
          data: {
            cashSessionId: currentCashSession!.id,
            movementType: CashMovementType.REFUND,
            amount: totalAmount,
            paymentMethod: this.mapRefundTypeToPaymentMethod(payload.refundType),
            referenceType: "sale_return",
            referenceId: created.id,
            description: `Devolucao ${created.returnNumber}`,
            userId: context.userId ?? null
          }
        });
      }

      const fullyReturned = sale.items.every((item) => {
        const returned = returnedByItem.get(item.id) ?? 0;
        return returned >= item.quantity;
      });

      if (fullyReturned) {
        await tx.sale.update({
          where: {
            id: sale.id
          },
          data: {
            status: SaleStatus.REFUNDED
          }
        });
      }

      return tx.saleReturn.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: saleReturnDetailInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "sale_returns.created",
      entity: "sale_returns",
      entityId: result.id,
      newData: {
        returnNumber: result.returnNumber,
        saleId: result.saleId,
        refundType: result.refundType,
        totalAmount: result.totalAmount
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return result;
  }

  private async restoreStock(
    tx: Prisma.TransactionClient,
    storeId: string,
    saleReturnId: string,
    returnNumber: string,
    saleItem: SaleItemForReturn,
    itemInput: CreateSaleReturnItemInput,
    userId: string | null
  ) {
    if (!itemInput.locationId) {
      throw new BadRequestException(
        `Informe o local de estoque para devolver ${saleItem.product.name}.`
      );
    }

    await this.assertActiveLocation(tx, storeId, itemInput.locationId);

    if (saleItem.product.hasSerialControl) {
      if (!saleItem.productUnitId) {
        throw new BadRequestException(
          `A venda nao possui unidade serializada vinculada para ${saleItem.product.name}.`
        );
      }

      const unit = await tx.productUnit.findUnique({
        where: {
          id: saleItem.productUnitId
        },
        select: {
          id: true,
          productId: true,
          unitStatus: true
        }
      });

      if (!unit || unit.productId !== saleItem.productId) {
        throw new BadRequestException("Unidade serializada invalida para retorno.");
      }

      await tx.productUnit.update({
        where: {
          id: unit.id
        },
        data: {
          unitStatus: ProductUnitStatus.IN_STOCK,
          currentLocationId: itemInput.locationId
        }
      });

      await this.incrementBalance(tx, saleItem.productId, itemInput.locationId, 1);

      await tx.stockMovement.create({
        data: {
          productId: saleItem.productId,
          productUnitId: unit.id,
          locationId: itemInput.locationId,
          movementType: StockMovementType.RETURN,
          quantity: 1,
          unitCost: saleItem.product.costPrice,
          referenceType: "sale_return",
          referenceId: saleReturnId,
          notes: `Retorno da devolucao ${returnNumber}`,
          userId
        }
      });

      return;
    }

    await this.incrementBalance(
      tx,
      saleItem.productId,
      itemInput.locationId,
      itemInput.quantity
    );

    await tx.stockMovement.create({
      data: {
        productId: saleItem.productId,
        locationId: itemInput.locationId,
        movementType: StockMovementType.RETURN,
        quantity: itemInput.quantity,
        unitCost: saleItem.product.costPrice,
        referenceType: "sale_return",
        referenceId: saleReturnId,
        notes: `Retorno da devolucao ${returnNumber}`,
        userId
      }
    });
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
      throw new BadRequestException("Local de estoque invalido para devolucao.");
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

  private mapRefundTypeToPaymentMethod(refundType: RefundType) {
    switch (refundType) {
      case RefundType.CASH:
        return PaymentMethod.CASH;
      case RefundType.PIX:
        return PaymentMethod.PIX;
      case RefundType.CARD_REVERSAL:
        return PaymentMethod.CREDIT;
      default:
        return null;
    }
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }
}
