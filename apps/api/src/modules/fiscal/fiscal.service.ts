import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  DocumentType,
  FiscalDocumentStatus,
  FiscalEventType,
  Prisma,
  SaleFiscalStatus,
  SaleStatus
} from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CancelFiscalDocumentDto } from "./dto/cancel-fiscal-document.dto";
import { IssueInternalReceiptDto } from "./dto/issue-internal-receipt.dto";
import { ListFiscalDocumentsDto } from "./dto/list-fiscal-documents.dto";

type FiscalAuditContext = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const fiscalDocumentInclude = {
  sale: {
    select: {
      id: true,
      saleNumber: true,
      receiptNumber: true,
      total: true,
      status: true,
      fiscalStatus: true,
      completedAt: true,
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
      }
    }
  },
  events: {
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.FiscalDocumentInclude;

type FiscalDocumentRecord = Prisma.FiscalDocumentGetPayload<{
  include: typeof fiscalDocumentInclude;
}>;

@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(storeId: string, filters: ListFiscalDocumentsDto) {
    const where = this.buildWhere(storeId, filters);

    return this.prisma.fiscalDocument.findMany({
      where,
      include: fiscalDocumentInclude,
      orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
      take: filters.take ?? 120
    });
  }

  async findById(id: string, storeId: string) {
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        id,
        storeId
      },
      include: fiscalDocumentInclude
    });

    if (!document) {
      throw new NotFoundException("Documento fiscal/documental nao encontrado.");
    }

    return document;
  }

  async issueInternalReceipt(
    storeId: string,
    payload: IssueInternalReceiptDto,
    context: FiscalAuditContext
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: payload.saleId,
        storeId
      },
      include: {
        items: {
          select: {
            id: true,
            product: {
              select: {
                isService: true
              }
            }
          }
        },
        fiscalDocument: true
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada para emissao do comprovante.");
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException(
        "Somente vendas concluidas podem gerar comprovante interno."
      );
    }

    if (!sale.items.length) {
      throw new BadRequestException(
        "A venda nao possui itens para gerar comprovante interno."
      );
    }

    if (sale.fiscalDocument) {
      if (sale.fiscalDocument.status === FiscalDocumentStatus.CANCELED) {
        throw new BadRequestException(
          "Este comprovante interno ja foi cancelado e nao pode ser reemitido nesta etapa."
        );
      }

      return this.findById(sale.fiscalDocument.id, storeId);
    }

    const documentType = sale.items.every((item) => item.product.isService)
      ? DocumentType.SERVICE_RECEIPT
      : DocumentType.RECEIPT;
    const now = new Date();
    const authorizationMessage =
      "Comprovante interno da ALPHA TECNOLOGIA. Nao substitui documento fiscal SEFAZ.";

    const document = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fiscalDocument.create({
        data: {
          saleId: sale.id,
          storeId,
          documentType,
          status: FiscalDocumentStatus.AUTHORIZED,
          receiptNumber: sale.receiptNumber,
          authorizationMessage,
          issuedAt: now,
          authorizedAt: now
        }
      });

      await tx.fiscalEvent.createMany({
        data: [
          {
            fiscalDocumentId: created.id,
            eventType: FiscalEventType.CREATED,
            description: "Comprovante interno criado."
          },
          {
            fiscalDocumentId: created.id,
            eventType: FiscalEventType.AUTHORIZED,
            description: authorizationMessage
          }
        ]
      });

      await tx.sale.update({
        where: {
          id: sale.id
        },
        data: {
          fiscalStatus: SaleFiscalStatus.AUTHORIZED,
          fiscalDocumentId: created.id,
          fiscalError: null
        }
      });

      return tx.fiscalDocument.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: fiscalDocumentInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "fiscal.internal_receipt.issued",
      entity: "fiscal_documents",
      entityId: document.id,
      newData: {
        saleId: sale.id,
        saleNumber: document.sale.saleNumber,
        documentType: document.documentType,
        status: document.status
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return document;
  }

  async cancelDocument(
    id: string,
    storeId: string,
    payload: CancelFiscalDocumentDto,
    context: FiscalAuditContext
  ) {
    const previous = await this.findById(id, storeId);

    if (previous.status === FiscalDocumentStatus.CANCELED) {
      return previous;
    }

    if (previous.status !== FiscalDocumentStatus.AUTHORIZED) {
      throw new BadRequestException(
        "Somente comprovantes internos autorizados podem ser cancelados."
      );
    }

    const canceledAt = new Date();
    const reason = payload.reason?.trim();

    const document = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fiscalDocument.update({
        where: {
          id: previous.id
        },
        data: {
          status: FiscalDocumentStatus.CANCELED,
          canceledAt
        }
      });

      await tx.fiscalEvent.create({
        data: {
          fiscalDocumentId: previous.id,
          eventType: FiscalEventType.CANCELED,
          description: reason || "Comprovante interno cancelado manualmente.",
          payload: reason ? { reason } : undefined
        }
      });

      await tx.sale.update({
        where: {
          id: previous.sale.id
        },
        data: {
          fiscalStatus: SaleFiscalStatus.CANCELED,
          fiscalError: null
        }
      });

      return tx.fiscalDocument.findUniqueOrThrow({
        where: {
          id: updated.id
        },
        include: fiscalDocumentInclude
      });
    });

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "fiscal.internal_receipt.canceled",
      entity: "fiscal_documents",
      entityId: document.id,
      oldData: {
        status: previous.status,
        saleFiscalStatus: previous.sale.fiscalStatus
      },
      newData: {
        status: document.status,
        canceledAt: document.canceledAt,
        saleFiscalStatus: document.sale.fiscalStatus
      },
      metadata: reason ? { reason } : null,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return document;
  }

  async getReport(storeId: string, filters: ListFiscalDocumentsDto, context: FiscalAuditContext) {
    const rows = await this.findAll(storeId, {
      ...filters,
      take: filters.take ?? 200
    });

    const summary = rows.reduce(
      (accumulator, row) => {
        accumulator.totalDocuments += 1;
        accumulator.totalAmount += row.sale.total;

        if (row.status === FiscalDocumentStatus.AUTHORIZED) {
          accumulator.authorizedCount += 1;
        }

        if (row.status === FiscalDocumentStatus.CANCELED) {
          accumulator.canceledCount += 1;
        }

        if (row.documentType === DocumentType.RECEIPT) {
          accumulator.receiptCount += 1;
        }

        if (row.documentType === DocumentType.SERVICE_RECEIPT) {
          accumulator.serviceReceiptCount += 1;
        }

        return accumulator;
      },
      {
        totalDocuments: 0,
        totalAmount: 0,
        authorizedCount: 0,
        canceledCount: 0,
        receiptCount: 0,
        serviceReceiptCount: 0
      }
    );

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "reports.fiscal.generated",
      entity: "reports",
      metadata: JSON.parse(
        JSON.stringify({
          filters,
          rowCount: rows.length
        })
      ) as Prisma.InputJsonValue,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      generatedAt: new Date().toISOString(),
      summary,
      rows
    };
  }

  private buildWhere(storeId: string, filters: ListFiscalDocumentsDto): Prisma.FiscalDocumentWhereInput {
    return {
      storeId,
      ...(filters.documentType ? { documentType: filters.documentType } : {}),
      ...(filters.status ? { status: filters.status } : {}),
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
                sale: {
                  saleNumber: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                receiptNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                sale: {
                  customer: {
                    name: {
                      contains: filters.search,
                      mode: "insensitive"
                    }
                  }
                }
              }
            ]
          }
        : {})
    };
  }

  private endOfDay(value: string) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }
}
