import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
  Prisma,
  ProductUnitStatus,
  SaleStatus,
  StockMovementType
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  CheckoutSaleDto,
  type CheckoutSaleItemDto,
  type CheckoutSalePaymentDto
} from "./dto/checkout-sale.dto";
import { ListSalesDto } from "./dto/list-sales.dto";

type SalesAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const saleListInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  cashSession: {
    select: {
      id: true,
      status: true,
      cashTerminal: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  fiscalDocument: {
    select: {
      id: true,
      documentType: true,
      status: true,
      accessKey: true,
      receiptNumber: true
    }
  },
  _count: {
    select: {
      items: true,
      payments: true
    }
  }
} satisfies Prisma.SaleInclude;

const saleDetailInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
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
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  cashSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      cashTerminal: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          supplierCode: true,
          imageUrl: true,
          isService: true,
          hasSerialControl: true
        }
      },
      productUnit: {
        select: {
          id: true,
          imei: true,
          imei2: true,
          serialNumber: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  },
  payments: {
    orderBy: {
      createdAt: "asc"
    }
  },
  refunds: {
    orderBy: {
      createdAt: "desc"
    }
  },
  fiscalDocument: {
    select: {
      id: true,
      documentType: true,
      status: true,
      accessKey: true,
      receiptNumber: true,
      protocolNumber: true,
      authorizationMessage: true,
      rejectionCode: true,
      rejectionMessage: true,
      issuedAt: true,
      authorizedAt: true,
      canceledAt: true
    }
  }
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(storeId: string, filters: ListSalesDto) {
    this.assertStoreScope(storeId);

    const where: Prisma.SaleWhereInput = {
      storeId,
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            completedAt: {
              ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
              ...(filters.endDate ? { lte: this.endOfDay(filters.endDate) } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                saleNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                receiptNumber: {
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
              }
            ]
          }
        : {})
    };

    return this.prisma.sale.findMany({
      where,
      include: saleListInclude,
      orderBy: {
        completedAt: "desc"
      },
      take: filters.take ?? 80
    });
  }

  async findById(id: string, storeId: string) {
    this.assertStoreScope(storeId);

    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        storeId
      },
      include: saleDetailInclude
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada.");
    }

    return sale;
  }

  async checkout(payload: CheckoutSaleDto, context: SalesAuditContext) {
    this.assertStoreScope(context.storeId);

    if (!payload.items.length) {
      throw new BadRequestException("Informe ao menos um item no carrinho.");
    }

    if (!payload.payments.length) {
      throw new BadRequestException("Informe ao menos uma forma de pagamento.");
    }

    const session = await this.prisma.cashSession.findUnique({
      where: {
        id: payload.cashSessionId
      },
      include: {
        cashTerminal: true
      }
    });

    if (!session) {
      throw new NotFoundException("Sessao de caixa nao encontrada.");
    }

    if (session.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException(
        "A venda exige uma sessao de caixa aberta."
      );
    }

    if (session.cashTerminal.storeId !== context.storeId) {
      throw new ForbiddenException(
        "A sessao de caixa informada nao pertence a loja atual."
      );
    }

    if (payload.customerId) {
      await this.assertCustomerExists(payload.customerId);
    }

    const normalizedNotes = this.normalizeOptionalText(payload.notes);
    const cartMetrics = this.calculateCartMetrics(payload.items, payload.discountAmount);
    const paymentTotal = payload.payments.reduce(
      (total, payment) => total + payment.amount,
      0
    );

    if (paymentTotal !== cartMetrics.total) {
      throw new BadRequestException(
        "A soma dos pagamentos deve ser igual ao total final da venda."
      );
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      const saleNumber = this.buildSaleNumber();
      const receiptNumber = this.buildReceiptNumber();

      const createdSale = await tx.sale.create({
        data: {
          saleNumber,
          receiptNumber,
          storeId: session.cashTerminal.storeId,
          customerId: payload.customerId ?? null,
          userId: context.userId ?? null,
          cashSessionId: session.id,
          subtotal: cartMetrics.subtotal,
          discountAmount: payload.discountAmount,
          total: cartMetrics.total,
          status: SaleStatus.COMPLETED,
          notes: normalizedNotes
        }
      });

      const selectedUnits = new Set<string>();

      for (const item of payload.items) {
        await this.processSaleItem(tx, {
          saleId: createdSale.id,
          saleNumber,
          item,
          storeId: session.cashTerminal.storeId,
          userId: context.userId ?? null,
          selectedUnits
        });
      }

      for (const payment of payload.payments) {
        await this.createPaymentAndCashMovement(tx, {
          saleId: createdSale.id,
          saleNumber,
          cashSessionId: session.id,
          payment,
          userId: context.userId ?? null
        });
      }

      return tx.sale.findUniqueOrThrow({
        where: {
          id: createdSale.id
        },
        include: saleDetailInclude
      });
    });

    await this.auditService.log({
      storeId: session.cashTerminal.storeId,
      userId: context.userId ?? null,
      action: "sales.completed",
      entity: "sales",
      entityId: sale.id,
      newData: {
        saleNumber: sale.saleNumber,
        total: sale.total,
        customerId: sale.customerId,
        itemCount: sale.items.length
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return sale;
  }

  private async processSaleItem(
    tx: Prisma.TransactionClient,
    input: {
      saleId: string;
      saleNumber: string;
      item: CheckoutSaleItemDto;
      storeId: string;
      userId: string | null;
      selectedUnits: Set<string>;
    }
  ) {
    const product = await tx.product.findUnique({
      where: {
        id: input.item.productId
      },
      select: {
        id: true,
        name: true,
        active: true,
        isService: true,
        hasSerialControl: true,
        costPrice: true
      }
    });

    if (!product) {
      throw new NotFoundException("Produto nao encontrado no checkout.");
    }

    if (!product.active) {
      throw new BadRequestException(`O produto ${product.name} esta inativo.`);
    }

    const lineTotal =
      input.item.unitPrice * input.item.quantity - input.item.discountAmount;

    if (lineTotal < 0) {
      throw new BadRequestException(
        `O desconto do item ${product.name} excede o valor da linha.`
      );
    }

    let productUnitId: string | null = null;
    let locationId = input.item.stockLocationId ?? null;

    if (!product.isService) {
      if (product.hasSerialControl) {
        if (!input.item.productUnitId) {
          throw new BadRequestException(
            `Selecione a unidade serializada para ${product.name}.`
          );
        }

        if (input.item.quantity !== 1) {
          throw new BadRequestException(
            `Produtos serializados devem ser vendidos unidade por unidade: ${product.name}.`
          );
        }

        if (input.selectedUnits.has(input.item.productUnitId)) {
          throw new BadRequestException(
            `A mesma unidade serializada foi enviada mais de uma vez: ${product.name}.`
          );
        }

        const unit = await tx.productUnit.findUnique({
          where: {
            id: input.item.productUnitId
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

        if (!unit || unit.productId !== product.id) {
          throw new BadRequestException(
            `Unidade serializada invalida para ${product.name}.`
          );
        }

        if (unit.unitStatus !== ProductUnitStatus.IN_STOCK) {
          throw new BadRequestException(
            `A unidade serializada de ${product.name} nao esta disponivel em estoque.`
          );
        }

        if (!unit.currentLocationId || !unit.currentLocation) {
          throw new BadRequestException(
            `A unidade serializada de ${product.name} nao possui local atual valido.`
          );
        }

        if (unit.currentLocation.storeId !== input.storeId || !unit.currentLocation.active) {
          throw new BadRequestException(
            `A unidade serializada de ${product.name} nao pertence a um local operacional da loja.`
          );
        }

        if (locationId && locationId !== unit.currentLocationId) {
          throw new BadRequestException(
            `A unidade serializada de ${product.name} nao pertence ao local selecionado.`
          );
        }

        locationId = unit.currentLocationId;

        await tx.productUnit.update({
          where: {
            id: unit.id
          },
          data: {
            unitStatus: ProductUnitStatus.SOLD,
            currentLocationId: null
          }
        });

        productUnitId = unit.id;
        input.selectedUnits.add(unit.id);
      }

      if (!locationId) {
        throw new BadRequestException(
          `Selecione o local de estoque para ${product.name}.`
        );
      }

      const location = await tx.stockLocation.findFirst({
        where: {
          id: locationId,
          storeId: input.storeId,
          active: true
        },
        select: {
          id: true
        }
      });

      if (!location) {
        throw new BadRequestException(
          `O local selecionado para ${product.name} nao esta disponivel.`
        );
      }

      const updatedBalance = await tx.stockBalance.updateMany({
        where: {
          productId: product.id,
          locationId,
          quantity: {
            gte: input.item.quantity
          }
        },
        data: {
          quantity: {
            decrement: input.item.quantity
          }
        }
      });

      if (!updatedBalance.count) {
        throw new BadRequestException(
          `Estoque insuficiente para ${product.name}.`
        );
      }

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          productUnitId,
          locationId,
          movementType: StockMovementType.SALE,
          quantity: input.item.quantity,
          unitCost: product.costPrice,
          referenceType: "sale",
          referenceId: input.saleId,
          notes: `Venda ${input.saleNumber}`,
          userId: input.userId
        }
      });
    }

    await tx.saleItem.create({
      data: {
        saleId: input.saleId,
        productId: product.id,
        productUnitId,
        quantity: input.item.quantity,
        unitPrice: input.item.unitPrice,
        discountAmount: input.item.discountAmount,
        totalPrice: lineTotal
      }
    });
  }

  private async createPaymentAndCashMovement(
    tx: Prisma.TransactionClient,
    input: {
      saleId: string;
      saleNumber: string;
      cashSessionId: string;
      payment: CheckoutSalePaymentDto;
      userId: string | null;
    }
  ) {
    await tx.salePayment.create({
      data: {
        saleId: input.saleId,
        method: input.payment.method,
        amount: input.payment.amount,
        installments: input.payment.installments ?? null,
        referenceCode: this.normalizeOptionalText(input.payment.referenceCode)
      }
    });

    await tx.cashMovement.create({
      data: {
        cashSessionId: input.cashSessionId,
        movementType: CashMovementType.SALE,
        amount: input.payment.amount,
        paymentMethod: input.payment.method,
        referenceType: "sale",
        referenceId: input.saleId,
        description: `Venda ${input.saleNumber}`,
        userId: input.userId
      }
    });
  }

  private calculateCartMetrics(
    items: CheckoutSaleItemDto[],
    saleDiscountAmount: number
  ) {
    const subtotal = items.reduce((total, item) => {
      if (item.quantity <= 0) {
        throw new BadRequestException(
          "A quantidade dos itens deve ser maior que zero."
        );
      }

      const grossTotal = item.unitPrice * item.quantity;

      if (item.discountAmount > grossTotal) {
        throw new BadRequestException(
          "O desconto por item nao pode ser maior que o total da linha."
        );
      }

      return total + grossTotal - item.discountAmount;
    }, 0);

    if (saleDiscountAmount > subtotal) {
      throw new BadRequestException(
        "O desconto geral da venda nao pode exceder o subtotal."
      );
    }

    return {
      subtotal,
      total: subtotal - saleDiscountAmount
    };
  }

  private async assertCustomerExists(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id: customerId
      },
      select: {
        id: true
      }
    });

    if (!customer) {
      throw new NotFoundException("Cliente nao encontrado para a venda.");
    }
  }

  private buildSaleNumber() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    return `VEN-${stamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  private buildReceiptNumber() {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `RCB-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private normalizeOptionalText(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private assertStoreScope(storeId?: string | null): asserts storeId is string {
    if (!storeId) {
      throw new ForbiddenException("Loja do operador nao encontrada para a venda.");
    }
  }
}
