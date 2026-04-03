import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  Prisma,
  ProductUnitStatus,
  ServiceOrderItemType,
  ServiceOrderStatus,
  StockMovementType
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { sign, verify } from "jsonwebtoken";
import { AuditService } from "../audit/audit.service";
import { getRequiredEnv } from "../../common/env";
import { formatDateParts } from "../../common/reporting-date.utils";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildSequenceDocumentNumber,
  ensureSequenceExists,
  getNextSequenceValue
} from "../../common/sequence-utils";
import { ChangeServiceOrderStatusDto } from "./dto/change-service-order-status.dto";
import { ConsumeServiceOrderItemDto } from "./dto/consume-service-order-item.dto";
import { CreateServiceOrderDto } from "./dto/create-service-order.dto";
import { CreateServiceOrderQuoteDto } from "./dto/create-service-order-quote.dto";
import { ListServiceOrdersDto } from "./dto/list-service-orders.dto";
import { ServiceOrderQuoteItemInputDto } from "./dto/service-order-quote-item-input.dto";
import { UpdateServiceOrderQuoteDto } from "./dto/update-service-order-quote.dto";
import { ServiceOrderItemInputDto } from "./dto/service-order-item-input.dto";
import { UpdateServiceOrderDto } from "./dto/update-service-order.dto";

type ServiceOrderAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type UploadedServiceOrderAttachment = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
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

const serviceOrderQuoteInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          isService: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.ServiceOrderQuoteInclude;

const serviceOrderReceiptInclude = {
  store: {
    select: {
      id: true,
      name: true,
      displayName: true,
      logoUrl: true,
      timezone: true
    }
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      state: true
    }
  },
  quotes: {
    where: {
      status: "APPROVED"
    },
    include: serviceOrderQuoteInclude,
    orderBy: {
      createdAt: "desc"
    },
    take: 1
  }
} satisfies Prisma.ServiceOrderInclude;

const serviceOrderAttachmentSelect = {
  id: true,
  fileName: true,
  fileType: true,
  filePath: true,
  createdAt: true
} satisfies Prisma.ServiceOrderAttachmentSelect;

type ServiceOrderRecord = Prisma.ServiceOrderGetPayload<{
  include: typeof serviceOrderDetailInclude;
}>;

type ServiceOrderQuoteStatus = "PENDING" | "APPROVED" | "REJECTED";

type ServiceOrderQuoteRecord = Prisma.ServiceOrderQuoteGetPayload<{
  include: typeof serviceOrderQuoteInclude;
}>;

type ServiceOrderReceiptRecord = Prisma.ServiceOrderGetPayload<{
  include: typeof serviceOrderReceiptInclude;
}>;

type ServiceOrderReceiptFormat = "a4" | "thermal";

type ServiceOrderReceiptPrintTokenPayload = {
  kind: "service-order-receipt-print";
  serviceOrderId: string;
  storeId: string;
  userId: string | null;
  format: ServiceOrderReceiptFormat;
};

const TERMINAL_STATUSES = new Set<ServiceOrderStatus>([
  ServiceOrderStatus.CANCELED,
  ServiceOrderStatus.REJECTED,
  ServiceOrderStatus.DELIVERED
]);

const QUOTE_PENDING_STATUS: ServiceOrderQuoteStatus = "PENDING";
const QUOTE_APPROVED_STATUS: ServiceOrderQuoteStatus = "APPROVED";
const QUOTE_REJECTED_STATUS: ServiceOrderQuoteStatus = "REJECTED";
const ACTIVE_QUOTE_STATUSES: ServiceOrderQuoteStatus[] = [
  QUOTE_PENDING_STATUS,
  QUOTE_APPROVED_STATUS
];
const SERVICE_ORDER_ATTACHMENTS_UPLOADS_DIR = join(
  process.cwd(),
  "uploads",
  "service-orders"
);
const MAX_SERVICE_ORDER_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_SERVICE_ORDER_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);
const SERVICE_ORDER_RECEIPT_FORMATS = new Set<ServiceOrderReceiptFormat>([
  "a4",
  "thermal"
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

      const activeQuote = await tx.serviceOrderQuote.findFirst({
        where: {
          serviceOrderId: previous.id,
          status: {
            in: ACTIVE_QUOTE_STATUSES
          }
        },
        select: {
          id: true,
          status: true,
          total: true
        }
      });

      if (payload.items) {
        const totals = await this.replaceEditableItems(tx, previous.id, payload.items);
        totalEstimated = totals.totalEstimated;
      }

      if (activeQuote) {
        totalEstimated = activeQuote.total;
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
          totalFinal:
            activeQuote?.status === QUOTE_APPROVED_STATUS
              ? activeQuote.total
              : payload.totalFinal === undefined
                ? undefined
                : payload.totalFinal
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

  async listAttachments(orderId: string, storeId: string) {
    await this.findById(orderId, storeId);

    const attachments = await this.prisma.serviceOrderAttachment.findMany({
      where: {
        serviceOrderId: orderId,
        serviceOrder: {
          storeId
        }
      },
      select: serviceOrderAttachmentSelect,
      orderBy: {
        createdAt: "desc"
      }
    });

    return attachments.map((attachment) => this.serializeAttachment(attachment));
  }

  async uploadAttachment(
    orderId: string,
    storeId: string,
    file: UploadedServiceOrderAttachment | undefined,
    context: ServiceOrderAuditContext
  ) {
    if (!file) {
      throw new BadRequestException("Selecione um arquivo para anexar na OS.");
    }

    if (!ALLOWED_SERVICE_ORDER_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        "Envie um anexo valido em JPG, PNG, WEBP ou PDF."
      );
    }

    if (file.size > MAX_SERVICE_ORDER_ATTACHMENT_SIZE) {
      throw new BadRequestException("O anexo deve ter no maximo 10 MB.");
    }

    if (!file.buffer?.length) {
      throw new BadRequestException("O arquivo enviado esta vazio.");
    }

    const order = await this.findById(orderId, storeId);
    const uploadsDir = join(SERVICE_ORDER_ATTACHMENTS_UPLOADS_DIR, order.id);
    await mkdir(uploadsDir, { recursive: true });

    const extension = this.getAttachmentExtension(file.mimetype);
    const storedFileName = `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    const absolutePath = join(uploadsDir, storedFileName);
    const filePath = `/uploads/service-orders/${order.id}/${storedFileName}`;

    await writeFile(absolutePath, file.buffer);

    try {
      const attachment = await this.prisma.serviceOrderAttachment.create({
        data: {
          serviceOrderId: order.id,
          fileName: this.normalizeAttachmentFileName(file.originalname, extension),
          filePath,
          fileType: file.mimetype
        },
        select: serviceOrderAttachmentSelect
      });

      const serializedAttachment = this.serializeAttachment(attachment);

      await this.auditService.log({
        storeId,
        userId: context.userId ?? null,
        action: "service_order_attachments.created",
        entity: "service_order_attachments",
        entityId: attachment.id,
        newData: {
          serviceOrderId: order.id,
          orderNumber: order.orderNumber,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          filePath: attachment.filePath
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return serializedAttachment;
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async deleteAttachment(
    orderId: string,
    attachmentId: string,
    storeId: string,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);
    const attachment = await this.findAttachmentById(orderId, attachmentId, storeId);

    await this.prisma.serviceOrderAttachment.delete({
      where: {
        id: attachment.id
      }
    });

    await this.deleteAttachmentFile(attachment.filePath);

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_order_attachments.deleted",
      entity: "service_order_attachments",
      entityId: attachment.id,
      oldData: {
        serviceOrderId: order.id,
        orderNumber: order.orderNumber,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
        filePath: attachment.filePath
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      success: true
    };
  }

  async listQuotes(orderId: string, storeId: string) {
    await this.findById(orderId, storeId);

    return this.prisma.serviceOrderQuote.findMany({
      where: {
        serviceOrderId: orderId,
        serviceOrder: {
          storeId
        }
      },
      include: serviceOrderQuoteInclude,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async createReceiptPrintLink(
    orderId: string,
    storeId: string,
    format: string | undefined,
    context: ServiceOrderAuditContext
  ) {
    const receiptFormat = this.normalizeReceiptFormat(format);
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: orderId,
        storeId
      },
      select: {
        id: true,
        storeId: true,
        orderNumber: true
      }
    });

    if (!order) {
      throw new NotFoundException("Ordem de servico nao encontrada para impressao.");
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const printToken = sign(
      {
        kind: "service-order-receipt-print",
        serviceOrderId: order.id,
        storeId: order.storeId,
        userId: context.userId ?? null,
        format: receiptFormat
      } satisfies ServiceOrderReceiptPrintTokenPayload,
      this.getReceiptSecret(),
      {
        expiresIn: "5m"
      }
    );

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.receipt.print_link.created",
      entity: "service_orders",
      entityId: order.id,
      newData: {
        orderNumber: order.orderNumber,
        format: receiptFormat,
        expiresAt
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      path: `/api/service-orders/${order.id}/receipt?format=${receiptFormat}&printToken=${encodeURIComponent(printToken)}&autoprint=1`,
      expiresAt: expiresAt.toISOString()
    };
  }

  async getReceiptHtml(
    orderId: string,
    printToken: string,
    format: string | undefined,
    autoprint = false
  ) {
    const payload = this.verifyReceiptPrintToken(printToken);
    const receiptFormat = this.normalizeReceiptFormat(format ?? payload.format);

    if (payload.serviceOrderId !== orderId) {
      throw new UnauthorizedException("Token de impressao invalido para esta OS.");
    }

    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: orderId,
        storeId: payload.storeId
      },
      include: serviceOrderReceiptInclude
    });

    if (!order) {
      throw new NotFoundException("Ordem de servico nao encontrada para gerar o comprovante.");
    }

    return this.renderReceiptHtml(order, receiptFormat, autoprint);
  }

  async createQuote(
    orderId: string,
    storeId: string,
    payload: CreateServiceOrderQuoteDto,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);

    if (
      order.status !== ServiceOrderStatus.OPEN &&
      order.status !== ServiceOrderStatus.WAITING_APPROVAL
    ) {
      throw new BadRequestException(
        "So e possivel criar orcamento para OS aberta ou aguardando aprovacao."
      );
    }

    try {
      const quote = await this.prisma.$transaction(async (tx) => {
        const existingActiveQuote = await tx.serviceOrderQuote.findFirst({
          where: {
            serviceOrderId: order.id,
            status: {
              in: ACTIVE_QUOTE_STATUSES
            }
          },
          select: {
            id: true
          }
        });

        if (existingActiveQuote) {
          throw new BadRequestException(
            "Esta OS ja possui um orcamento ativo."
          );
        }

        const createdQuote = await tx.serviceOrderQuote.create({
          data: {
            serviceOrderId: order.id,
            status: QUOTE_PENDING_STATUS,
            notes: this.normalizeOptionalText(payload.notes)
          }
        });

        const totals = await this.replaceQuoteItems(tx, createdQuote.id, payload.items);

        await tx.serviceOrderQuote.update({
          where: {
            id: createdQuote.id
          },
          data: {
            subtotal: totals.subtotal,
            discountAmount: 0,
            total: totals.total
          }
        });

        const orderUpdateData: Prisma.ServiceOrderUpdateInput = {
          totalEstimated: totals.total
        };

        if (order.status === ServiceOrderStatus.OPEN) {
          orderUpdateData.status = ServiceOrderStatus.WAITING_APPROVAL;
        }

        await tx.serviceOrder.update({
          where: {
            id: order.id
          },
          data: orderUpdateData
        });

        if (order.status === ServiceOrderStatus.OPEN) {
          await tx.serviceOrderStatusHistory.create({
            data: {
              serviceOrderId: order.id,
              oldStatus: order.status,
              newStatus: ServiceOrderStatus.WAITING_APPROVAL,
              notes: "Orcamento criado e OS enviada para aprovacao.",
              changedByUserId: context.userId ?? null
            }
          });
        }

        return tx.serviceOrderQuote.findUniqueOrThrow({
          where: {
            id: createdQuote.id
          },
          include: serviceOrderQuoteInclude
        });
      });

      await this.auditService.log({
        storeId,
        userId: context.userId ?? null,
        action: "service_order_quotes.created",
        entity: "service_order_quotes",
        entityId: quote.id,
        newData: {
          serviceOrderId: order.id,
          orderNumber: order.orderNumber,
          status: quote.status,
          subtotal: quote.subtotal,
          total: quote.total
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      if (order.status === ServiceOrderStatus.OPEN) {
        await this.auditService.log({
          storeId,
          userId: context.userId ?? null,
          action: "service_orders.status_changed",
          entity: "service_orders",
          entityId: order.id,
          oldData: {
            status: ServiceOrderStatus.OPEN
          },
          newData: {
            status: ServiceOrderStatus.WAITING_APPROVAL,
            totalEstimated: quote.total
          },
          metadata: {
            notes: "Orcamento criado e OS enviada para aprovacao."
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent
        });
      }

      return quote;
    } catch (error) {
      this.rethrowIfActiveQuoteConstraint(error);
      throw error;
    }
  }

  async updateQuote(
    orderId: string,
    quoteId: string,
    storeId: string,
    payload: UpdateServiceOrderQuoteDto,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);
    const previousQuote = await this.findQuoteById(orderId, quoteId, storeId);

    if (previousQuote.status !== QUOTE_PENDING_STATUS) {
      throw new BadRequestException(
        "Somente orcamentos pendentes podem ser editados."
      );
    }

    if (TERMINAL_STATUSES.has(order.status)) {
      throw new BadRequestException(
        "Nao e possivel editar orcamento em OS encerrada, cancelada ou rejeitada."
      );
    }

    const quote = await this.prisma.$transaction(async (tx) => {
      const totals = payload.items
        ? await this.replaceQuoteItems(tx, previousQuote.id, payload.items)
        : {
            subtotal: previousQuote.subtotal,
            total: previousQuote.total
          };

      await tx.serviceOrderQuote.update({
        where: {
          id: previousQuote.id
        },
        data: {
          notes:
            payload.notes === undefined
              ? undefined
              : this.normalizeOptionalText(payload.notes),
          subtotal: totals.subtotal,
          total: totals.total
        }
      });

      await tx.serviceOrder.update({
        where: {
          id: order.id
        },
        data: {
          totalEstimated: totals.total
        }
      });

      return tx.serviceOrderQuote.findUniqueOrThrow({
        where: {
          id: previousQuote.id
        },
        include: serviceOrderQuoteInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_order_quotes.updated",
      entity: "service_order_quotes",
      entityId: quote.id,
      oldData: {
        subtotal: previousQuote.subtotal,
        total: previousQuote.total,
        notes: previousQuote.notes
      },
      newData: {
        subtotal: quote.subtotal,
        total: quote.total,
        notes: quote.notes
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return quote;
  }

  async approveQuote(
    orderId: string,
    quoteId: string,
    storeId: string,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);
    const quote = await this.findQuoteById(orderId, quoteId, storeId);

    if (quote.status !== QUOTE_PENDING_STATUS) {
      throw new BadRequestException(
        "Somente orcamentos pendentes podem ser aprovados."
      );
    }

    try {
      const now = new Date();

      const approvedQuote = await this.prisma.$transaction(async (tx) => {
        await tx.serviceOrderQuote.update({
          where: {
            id: quote.id
          },
          data: {
            status: QUOTE_APPROVED_STATUS
          }
        });

        await tx.serviceOrder.update({
          where: {
            id: order.id
          },
          data: {
            status: ServiceOrderStatus.APPROVED,
            totalEstimated: quote.total,
            totalFinal: quote.total,
            approvedAt: now
          }
        });

        await tx.serviceOrderStatusHistory.create({
          data: {
            serviceOrderId: order.id,
            oldStatus: order.status,
            newStatus: ServiceOrderStatus.APPROVED,
            notes: "Orcamento aprovado.",
            changedByUserId: context.userId ?? null
          }
        });

        return tx.serviceOrderQuote.findUniqueOrThrow({
          where: {
            id: quote.id
          },
          include: serviceOrderQuoteInclude
        });
      });

      await this.auditService.log({
        storeId,
        userId: context.userId ?? null,
        action: "service_order_quotes.approved",
        entity: "service_order_quotes",
        entityId: approvedQuote.id,
        oldData: {
          status: quote.status
        },
        newData: {
          status: approvedQuote.status,
          total: approvedQuote.total,
          serviceOrderStatus: ServiceOrderStatus.APPROVED
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      await this.auditService.log({
        storeId,
        userId: context.userId ?? null,
        action: "service_orders.status_changed",
        entity: "service_orders",
        entityId: order.id,
        oldData: {
          status: order.status
        },
        newData: {
          status: ServiceOrderStatus.APPROVED,
          totalEstimated: quote.total,
          totalFinal: quote.total
        },
        metadata: {
          notes: "Orcamento aprovado."
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return approvedQuote;
    } catch (error) {
      this.rethrowIfActiveQuoteConstraint(error);
      throw error;
    }
  }

  async rejectQuote(
    orderId: string,
    quoteId: string,
    storeId: string,
    context: ServiceOrderAuditContext
  ) {
    const order = await this.findById(orderId, storeId);
    const quote = await this.findQuoteById(orderId, quoteId, storeId);

    if (quote.status !== QUOTE_PENDING_STATUS) {
      throw new BadRequestException(
        "Somente orcamentos pendentes podem ser rejeitados."
      );
    }

    const now = new Date();

    const rejectedQuote = await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderQuote.update({
        where: {
          id: quote.id
        },
        data: {
          status: QUOTE_REJECTED_STATUS
        }
      });

      await tx.serviceOrder.update({
        where: {
          id: order.id
        },
        data: {
          status: ServiceOrderStatus.REJECTED,
          rejectedAt: now
        }
      });

      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: order.id,
          oldStatus: order.status,
          newStatus: ServiceOrderStatus.REJECTED,
          notes: "Orcamento rejeitado.",
          changedByUserId: context.userId ?? null
        }
      });

      return tx.serviceOrderQuote.findUniqueOrThrow({
        where: {
          id: quote.id
        },
        include: serviceOrderQuoteInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_order_quotes.rejected",
      entity: "service_order_quotes",
      entityId: rejectedQuote.id,
      oldData: {
        status: quote.status
      },
      newData: {
        status: rejectedQuote.status,
        total: rejectedQuote.total,
        serviceOrderStatus: ServiceOrderStatus.REJECTED
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "service_orders.status_changed",
      entity: "service_orders",
      entityId: order.id,
      oldData: {
        status: order.status
      },
      newData: {
        status: ServiceOrderStatus.REJECTED
      },
      metadata: {
        notes: "Orcamento rejeitado."
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return rejectedQuote;
  }

  async changeStatus(
    id: string,
    storeId: string,
    payload: ChangeServiceOrderStatusDto,
    context: ServiceOrderAuditContext
  ) {
    const previous = await this.findById(id, storeId);
    const pendingQuote = await this.prisma.serviceOrderQuote.findFirst({
      where: {
        serviceOrderId: previous.id,
        status: QUOTE_PENDING_STATUS
      },
      select: {
        id: true,
        status: true,
        total: true
      }
    });

    if (!ALLOWED_TRANSITIONS[previous.status].includes(payload.status)) {
      throw new BadRequestException(
        `Nao e possivel mover a OS ${previous.orderNumber} de ${previous.status} para ${payload.status}.`
      );
    }

    if (
      pendingQuote &&
      (payload.status === ServiceOrderStatus.APPROVED ||
        payload.status === ServiceOrderStatus.REJECTED)
    ) {
      throw new BadRequestException(
        "Aprovacao e rejeicao devem ser feitas pelo fluxo de orcamento pendente."
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
    let autoRejectedQuoteId: string | null = null;

    const order = await this.prisma.$transaction(async (tx) => {
      if (payload.status === ServiceOrderStatus.CANCELED && pendingQuote) {
        await tx.serviceOrderQuote.update({
          where: {
            id: pendingQuote.id
          },
          data: {
            status: QUOTE_REJECTED_STATUS
          }
        });

        autoRejectedQuoteId = pendingQuote.id;
      }

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
        notes: payload.notes ?? null,
        autoRejectedPendingQuote: Boolean(autoRejectedQuoteId)
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    if (autoRejectedQuoteId) {
      await this.auditService.log({
        storeId,
        userId: context.userId ?? null,
        action: "service_order_quotes.rejected",
        entity: "service_order_quotes",
        entityId: autoRejectedQuoteId,
        oldData: {
          status: pendingQuote?.status ?? QUOTE_PENDING_STATUS
        },
        newData: {
          status: QUOTE_REJECTED_STATUS,
          total: pendingQuote?.total ?? 0,
          reason: "service_order_canceled"
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });
    }

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

  private async findQuoteById(
    orderId: string,
    quoteId: string,
    storeId: string
  ) {
    const quote = await this.prisma.serviceOrderQuote.findFirst({
      where: {
        id: quoteId,
        serviceOrderId: orderId,
        serviceOrder: {
          storeId
        }
      },
      include: serviceOrderQuoteInclude
    });

    if (!quote) {
      throw new NotFoundException("Orcamento da OS nao encontrado.");
    }

    return quote;
  }

  private async replaceQuoteItems(
    tx: Prisma.TransactionClient,
    quoteId: string,
    items: ServiceOrderQuoteItemInputDto[]
  ) {
    await tx.serviceOrderQuoteItem.deleteMany({
      where: {
        quoteId
      }
    });

    let subtotal = 0;

    for (const item of items) {
      const normalized = await this.normalizeQuoteItemInput(tx, item);
      subtotal += normalized.totalPrice;

      await tx.serviceOrderQuoteItem.create({
        data: {
          quoteId,
          productId: normalized.productId,
          description: normalized.description,
          quantity: normalized.quantity,
          unitPrice: normalized.unitPrice,
          totalPrice: normalized.totalPrice,
          itemType: normalized.itemType
        }
      });
    }

    return {
      subtotal,
      total: subtotal
    };
  }

  private async normalizeQuoteItemInput(
    tx: Prisma.TransactionClient,
    item: ServiceOrderQuoteItemInputDto
  ) {
    const description = item.description.trim();

    if (!description) {
      throw new BadRequestException("Todo item do orcamento precisa de descricao.");
    }

    const totalPrice = item.quantity * item.unitPrice;
    let productId: string | null = null;

    if (item.itemType === ServiceOrderItemType.MANUAL_ITEM && item.productId) {
      throw new BadRequestException(
        "Itens manuais do orcamento nao podem referenciar produto."
      );
    }

    if (item.itemType === ServiceOrderItemType.PART) {
      if (!item.productId) {
        throw new BadRequestException(
          "Itens do tipo peca exigem produto vinculado."
        );
      }

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
        throw new BadRequestException(
          "A peca vinculada ao orcamento e invalida."
        );
      }

      productId = product.id;
    }

    if (item.itemType === ServiceOrderItemType.SERVICE && item.productId) {
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

      if (!product || !product.active || !product.isService) {
        throw new BadRequestException(
          "O servico vinculado ao orcamento e invalido."
        );
      }

      productId = product.id;
    }

    return {
      itemType: item.itemType,
      productId,
      description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice
    };
  }

  private async findAttachmentById(
    orderId: string,
    attachmentId: string,
    storeId: string
  ) {
    const attachment = await this.prisma.serviceOrderAttachment.findFirst({
      where: {
        id: attachmentId,
        serviceOrderId: orderId,
        serviceOrder: {
          storeId
        }
      },
      select: serviceOrderAttachmentSelect
    });

    if (!attachment) {
      throw new NotFoundException("Anexo da OS nao encontrado.");
    }

    return attachment;
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

  private serializeAttachment(
    attachment: Prisma.ServiceOrderAttachmentGetPayload<{
      select: typeof serviceOrderAttachmentSelect;
    }>
  ) {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      url: attachment.filePath,
      createdAt: attachment.createdAt
    };
  }

  private getAttachmentExtension(mimetype: string) {
    if (mimetype === "image/jpeg") {
      return "jpg";
    }

    if (mimetype === "image/png") {
      return "png";
    }

    if (mimetype === "image/webp") {
      return "webp";
    }

    if (mimetype === "application/pdf") {
      return "pdf";
    }

    throw new BadRequestException("Formato de anexo nao suportado.");
  }

  private normalizeAttachmentFileName(
    originalName: string | undefined,
    extension: string
  ) {
    const baseName = basename(originalName?.trim() || `anexo.${extension}`)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim();

    if (!baseName) {
      return `anexo.${extension}`;
    }

    return baseName.length > 255 ? baseName.slice(0, 255) : baseName;
  }

  private async deleteAttachmentFile(filePath: string) {
    if (!filePath.startsWith("/uploads/service-orders/")) {
      return;
    }

    const relativePath = filePath.replace("/uploads/service-orders/", "");

    if (!relativePath) {
      return;
    }

    await unlink(join(SERVICE_ORDER_ATTACHMENTS_UPLOADS_DIR, relativePath)).catch(
      () => undefined
    );
  }

  private rethrowIfActiveQuoteConstraint(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new BadRequestException("Esta OS ja possui um orcamento ativo.");
    }
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private renderReceiptHtml(
    order: ServiceOrderReceiptRecord,
    format: ServiceOrderReceiptFormat,
    autoprint: boolean
  ) {
    const approvedQuote = order.quotes[0] ?? null;
    const storeName = this.escapeHtml(order.store.displayName || order.store.name);
    const logoHtml = order.store.logoUrl
      ? `<img alt="Logo ${storeName}" class="store-logo" src="${this.escapeHtml(
          this.normalizeStoreAssetUrl(order.store.logoUrl)
        )}" />`
      : "";
    const customerAddress = this.buildCustomerAddress(order);
    const imeiValue = [order.imei, order.imei2].filter(Boolean).join(" / ") || "Nao informado";
    const entryDate = this.formatDateTime(
      order.createdAt,
      order.store.timezone ?? "America/Sao_Paulo"
    );
    const estimatedDate = order.estimatedCompletionDate
      ? this.formatDate(order.estimatedCompletionDate, order.store.timezone ?? "America/Sao_Paulo")
      : "Nao definido";
    const receiptBody =
      format === "thermal"
        ? this.renderThermalReceiptContent(
            order,
            approvedQuote,
            storeName,
            logoHtml,
            customerAddress,
            imeiValue,
            entryDate,
            estimatedDate
          )
        : this.renderA4ReceiptContent(
            order,
            approvedQuote,
            storeName,
            logoHtml,
            customerAddress,
            imeiValue,
            entryDate,
            estimatedDate
          );
    const autoprintScript = autoprint
      ? `
        <script>
          window.addEventListener("load", function () {
            window.setTimeout(function () {
              window.print();
            }, 180);
          }, { once: true });
        </script>
      `
      : "";

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OS ${this.escapeHtml(order.orderNumber)}</title>
    <style>
      ${this.renderReceiptCss(format)}
    </style>
    ${autoprintScript}
  </head>
  <body class="${format}">
    ${receiptBody}
  </body>
</html>`;
  }

  private renderA4ReceiptContent(
    order: ServiceOrderReceiptRecord,
    approvedQuote: ServiceOrderQuoteRecord | null,
    storeName: string,
    logoHtml: string,
    customerAddress: string,
    imeiValue: string,
    entryDate: string,
    estimatedDate: string
  ) {
    return `
      <main class="receipt receipt-a4">
        <header class="header">
          <div class="store-identity">
            ${logoHtml}
            <div>
              <div class="store-name">${storeName}</div>
            </div>
          </div>
          <div class="divider"></div>
          <h1 class="title">ORDEM DE SERVICO Nº ${this.escapeHtml(order.orderNumber)}</h1>
        </header>

        <section class="section">
          <h2>Dados do aparelho</h2>
          <div class="info-grid">
            ${this.renderInfoRow("Tipo", order.deviceType)}
            ${this.renderInfoRow("Marca", order.brand)}
            ${this.renderInfoRow("Modelo", order.model)}
            ${this.renderInfoRow("IMEI", imeiValue)}
            ${this.renderInfoRow("Serial", order.serialNumber ?? "Nao informado")}
            ${this.renderInfoRow("Cor", order.color ?? "Nao informada")}
            ${this.renderInfoRow("Acessorios entregues", order.accessories ?? "Nao informados")}
          </div>
        </section>

        <section class="section">
          <h2>Cliente</h2>
          <div class="info-grid">
            ${this.renderInfoRow("Nome", order.customer.name)}
            ${this.renderInfoRow("Telefone", order.customer.phone)}
            ${this.renderInfoRow("Endereco", customerAddress)}
          </div>
        </section>

        <section class="section">
          <h2>Problema relatado</h2>
          <p class="paragraph">${this.formatMultilineText(order.reportedIssue)}</p>
        </section>

        ${approvedQuote ? this.renderQuoteSection(approvedQuote) : ""}

        <section class="section">
          <h2>Condicoes</h2>
          <div class="conditions">
            <div><strong>Data de entrada:</strong> ${this.escapeHtml(entryDate)}</div>
            <div><strong>Prazo estimado:</strong> ${this.escapeHtml(estimatedDate)}</div>
            <div><strong>Garantia:</strong> 90 dias apos a entrega</div>
            <div>Apos 90 dias sem retirada, o aparelho sera descartado</div>
          </div>
        </section>

        <footer class="footer">
          <div class="footer-line">${storeName}</div>
          <div class="signature-label">Assinatura do cliente</div>
          <div class="signature-line">__________________________</div>
        </footer>
      </main>
    `;
  }

  private renderThermalReceiptContent(
    order: ServiceOrderReceiptRecord,
    approvedQuote: ServiceOrderQuoteRecord | null,
    storeName: string,
    logoHtml: string,
    customerAddress: string,
    imeiValue: string,
    entryDate: string,
    estimatedDate: string
  ) {
    return `
      <main class="receipt receipt-thermal">
        <div class="center">
          ${logoHtml}
          <div class="store-name">${storeName}</div>
        </div>

        <div class="divider"></div>
        <div class="center"><strong>ORDEM DE SERVICO Nº ${this.escapeHtml(order.orderNumber)}</strong></div>

        <div class="divider"></div>
        <div class="block-title">Dados do aparelho</div>
        ${this.renderReceiptRow("Tipo", order.deviceType)}
        ${this.renderReceiptRow("Marca", order.brand)}
        ${this.renderReceiptRow("Modelo", order.model)}
        ${this.renderReceiptRow("IMEI", imeiValue)}
        ${this.renderReceiptRow("Serial", order.serialNumber ?? "Nao informado")}
        ${this.renderReceiptRow("Cor", order.color ?? "Nao informada")}
        ${this.renderReceiptRow("Acessorios", order.accessories ?? "Nao informados")}

        <div class="divider"></div>
        <div class="block-title">Cliente</div>
        ${this.renderReceiptRow("Nome", order.customer.name)}
        ${this.renderReceiptRow("Telefone", order.customer.phone)}
        ${this.renderReceiptRow("Endereco", customerAddress)}

        <div class="divider"></div>
        <div class="block-title">Problema relatado</div>
        <div class="paragraph">${this.formatMultilineText(order.reportedIssue)}</div>

        ${
          approvedQuote
            ? `
              <div class="divider"></div>
              <div class="block-title">Orcamento aprovado</div>
              ${approvedQuote.items
                .map(
                  (item) => `
                      <div class="quote-item">
                      <div class="row">
                        <span>${this.escapeHtml(item.description)}</span>
                        <span>${this.formatCurrency(item.totalPrice)}</span>
                      </div>
                      <div class="muted">${item.quantity} x ${this.formatCurrency(item.unitPrice)}</div>
                    </div>
                  `
                )
                .join("")}
              <div class="row total-row">
                <span>Total do orcamento</span>
                <span>${this.formatCurrency(approvedQuote.total)}</span>
              </div>
            `
            : ""
        }

        <div class="divider"></div>
        <div class="block-title">Condicoes</div>
        ${this.renderReceiptRow("Entrada", entryDate)}
        ${this.renderReceiptRow("Prazo", estimatedDate)}
        <div>Garantia: 90 dias apos a entrega</div>
        <div>Apos 90 dias sem retirada, o aparelho sera descartado</div>

        <div class="divider"></div>
        <div class="center footer-line">${storeName}</div>
        <div class="center signature-label">Assinatura do cliente</div>
        <div class="center signature-line">__________________________</div>
      </main>
    `;
  }

  private renderQuoteSection(quote: ServiceOrderQuoteRecord) {
    return `
      <section class="section">
        <h2>Orcamento</h2>
        <table class="quote-table">
          <thead>
            <tr>
              <th>Descricao</th>
              <th>Qtd</th>
              <th>Valor unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${quote.items
              .map(
                (item) => `
                  <tr>
                    <td>${this.escapeHtml(item.description)}</td>
                    <td>${item.quantity}</td>
                    <td>${this.formatCurrency(item.unitPrice)}</td>
                    <td>${this.formatCurrency(item.totalPrice)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
        <div class="quote-total">
          <span>Total do orcamento</span>
          <strong>${this.formatCurrency(quote.total)}</strong>
        </div>
      </section>
    `;
  }

  private renderReceiptCss(format: ServiceOrderReceiptFormat) {
    const base = `
      @page {
        size: ${format === "thermal" ? "80mm auto" : "A4"};
        margin: ${format === "thermal" ? "4mm" : "12mm"};
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        color: #111827;
        font-family: Arial, Helvetica, sans-serif;
        background: #f3f4f6;
      }

      body.thermal {
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
      }

      .receipt {
        margin: 0 auto;
        background: #ffffff;
      }

      .receipt-a4 {
        width: min(100%, 210mm);
        min-height: 100vh;
        padding: 18mm 16mm;
      }

      .receipt-thermal {
        width: min(100%, 80mm);
        padding: 14px 12px 18px;
      }

      .header,
      .section,
      .footer {
        margin-bottom: 18px;
      }

      .store-identity {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .store-logo {
        max-height: 62px;
        max-width: 140px;
        object-fit: contain;
      }

      .store-name {
        font-size: 22px;
        font-weight: 700;
      }

      .title {
        margin: 0;
        font-size: 24px;
      }

      .divider {
        border-top: 1px solid #d1d5db;
        margin: 14px 0;
      }

      .section h2,
      .block-title {
        margin: 0 0 10px;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #4b5563;
      }

      .info-grid {
        display: grid;
        gap: 10px 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .info-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .info-label {
        font-size: 12px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .paragraph,
      .info-value {
        white-space: pre-wrap;
      }

      .quote-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .quote-table th,
      .quote-table td {
        padding: 8px 6px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
      }

      .quote-total,
      .row,
      .receipt-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }

      .quote-total {
        margin-top: 12px;
        font-size: 16px;
      }

      .conditions {
        display: grid;
        gap: 8px;
      }

      .footer-line,
      .signature-label,
      .signature-line,
      .center {
        text-align: center;
      }

      .signature-label {
        margin-top: 20px;
        font-size: 13px;
      }

      .signature-line {
        margin-top: 12px;
        font-size: 18px;
        letter-spacing: 0.06em;
      }

      .block-title {
        font-weight: 700;
      }

      .receipt-row,
      .row {
        align-items: flex-start;
      }

      .receipt-row + .receipt-row,
      .quote-item + .quote-item {
        margin-top: 6px;
      }

      .muted {
        color: #6b7280;
        font-size: 11px;
      }

      .total-row {
        margin-top: 10px;
        font-weight: 700;
        font-size: 14px;
      }

      @media print {
        html,
        body {
          background: #ffffff;
        }

        .receipt-a4,
        .receipt-thermal {
          width: auto;
          min-height: auto;
          padding: 0;
        }
      }
    `;

    return base;
  }

  private renderInfoRow(label: string, value: string) {
    return `
      <div class="info-row">
        <div class="info-label">${this.escapeHtml(label)}</div>
        <div class="info-value">${this.escapeHtml(value)}</div>
      </div>
    `;
  }

  private renderReceiptRow(label: string, value: string) {
    return `
      <div class="receipt-row">
        <span>${this.escapeHtml(label)}:</span>
        <span>${this.escapeHtml(value)}</span>
      </div>
    `;
  }

  private buildCustomerAddress(order: ServiceOrderReceiptRecord) {
    const parts = [
      order.customer.address,
      order.customer.city,
      order.customer.state
    ].filter((value): value is string => Boolean(value?.trim()));

    return parts.length ? parts.join(" - ") : "Nao informado";
  }

  private normalizeReceiptFormat(format?: string | null): ServiceOrderReceiptFormat {
    if (!format?.trim()) {
      return "a4";
    }

    const normalized = format.trim().toLowerCase() as ServiceOrderReceiptFormat;

    if (!SERVICE_ORDER_RECEIPT_FORMATS.has(normalized)) {
      throw new BadRequestException("Formato de comprovante invalido.");
    }

    return normalized;
  }

  private verifyReceiptPrintToken(token: string) {
    if (!token.trim()) {
      throw new UnauthorizedException("Token de impressao ausente.");
    }

    try {
      const payload = verify(token, this.getReceiptSecret()) as ServiceOrderReceiptPrintTokenPayload;

      if (
        payload.kind !== "service-order-receipt-print" ||
        typeof payload.serviceOrderId !== "string" ||
        typeof payload.storeId !== "string"
      ) {
        throw new UnauthorizedException("Token de impressao invalido.");
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Token de impressao invalido.");
    }
  }

  private getReceiptSecret() {
    return process.env.JWT_ACCESS_SECRET ?? getRequiredEnv("JWT_SECRET");
  }

  private formatDateTime(date: Date, timeZone: string) {
    const parts = formatDateParts(date, timeZone);
    const day = String(parts.day).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    const year = String(parts.year).padStart(4, "0");
    const hour = String(parts.hour).padStart(2, "0");
    const minute = String(parts.minute).padStart(2, "0");

    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  private formatDate(date: Date, timeZone: string) {
    const parts = formatDateParts(date, timeZone);
    const day = String(parts.day).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    const year = String(parts.year).padStart(4, "0");

    return `${day}/${month}/${year}`;
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value / 100);
  }

  private formatMultilineText(value: string) {
    return this.escapeHtml(value).replace(/\n/g, "<br />");
  }

  private normalizeStoreAssetUrl(value: string) {
    if (/^(https?:|data:|\/)/i.test(value)) {
      return value;
    }

    return `/${value.replace(/^\/+/, "")}`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
