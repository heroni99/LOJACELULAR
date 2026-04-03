import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  DocumentType,
  FiscalDocumentStatus,
  FiscalEventType,
  PaymentMethod,
  Prisma,
  SaleFiscalStatus,
  SaleStatus
} from "@prisma/client";
import { sign, verify } from "jsonwebtoken";
import { getRequiredEnv } from "../../common/env";
import { formatDateParts } from "../../common/reporting-date.utils";
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

const saleReceiptInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      timezone: true
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
  items: {
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true,
      quantity: true,
      totalPrice: true,
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true
        }
      }
    }
  },
  payments: {
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true,
      method: true,
      amount: true,
      installments: true,
      referenceCode: true
    }
  },
  fiscalDocument: {
    select: {
      id: true,
      status: true,
      receiptNumber: true
    }
  }
} satisfies Prisma.SaleInclude;

type ReceiptSaleRecord = Prisma.SaleGetPayload<{
  include: typeof saleReceiptInclude;
}>;

type ReceiptPrintTokenPayload = {
  kind: "fiscal-receipt-print";
  saleId: string;
  storeId: string;
  userId: string | null;
};

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

  async createReceiptPrintLink(
    saleId: string,
    storeId: string,
    context: FiscalAuditContext
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId
      },
      select: {
        id: true,
        storeId: true,
        saleNumber: true,
        status: true,
        fiscalDocument: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada para impressao do comprovante.");
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException(
        "Somente vendas concluidas podem gerar comprovante para impressao."
      );
    }

    if (!sale.fiscalDocument) {
      await this.issueInternalReceipt(storeId, { saleId }, context);
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const printToken = sign(
      {
        kind: "fiscal-receipt-print",
        saleId: sale.id,
        storeId: sale.storeId,
        userId: context.userId ?? null
      } satisfies ReceiptPrintTokenPayload,
      this.getReceiptSecret(),
      {
        expiresIn: "5m"
      }
    );

    await this.auditService.log({
      storeId,
      userId: context.userId ?? null,
      action: "fiscal.internal_receipt.print_link.created",
      entity: "sales",
      entityId: sale.id,
      newData: {
        saleNumber: sale.saleNumber,
        expiresAt
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      path: `/api/fiscal/receipt/${sale.id}?printToken=${encodeURIComponent(printToken)}&autoprint=1`,
      expiresAt: expiresAt.toISOString()
    };
  }

  async getReceiptHtml(saleId: string, printToken: string, autoprint = false) {
    const payload = this.verifyReceiptPrintToken(printToken);

    if (payload.saleId !== saleId) {
      throw new UnauthorizedException("Token de impressao invalido para esta venda.");
    }

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId: payload.storeId
      },
      include: saleReceiptInclude
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada para gerar o comprovante.");
    }

    if (sale.status !== SaleStatus.COMPLETED) {
      throw new BadRequestException(
        "Somente vendas concluidas podem gerar comprovante para impressao."
      );
    }

    return this.renderReceiptHtml(sale, autoprint);
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

  private renderReceiptHtml(sale: ReceiptSaleRecord, autoprint: boolean) {
    const storeName = this.escapeHtml(sale.store.displayName || sale.store.name);
    const customerName = this.escapeHtml(sale.customer?.name || "Consumidor final");
    const operatorName = this.escapeHtml(sale.user?.name || "Operacao local");
    const completedAt = this.formatReceiptDateTime(
      sale.completedAt,
      sale.store.timezone ?? "America/Sao_Paulo"
    );
    const itemsHtml = sale.items
      .map((item) => {
        const description = this.escapeHtml(item.product.name);
        const quantityLabel = `${item.quantity}x`;
        return `
          <div class="item">
            <div class="item-row">
              <span class="item-label">${quantityLabel} ${description}</span>
              <span class="item-value">${this.formatCurrency(item.totalPrice)}</span>
            </div>
          </div>
        `;
      })
      .join("");
    const paymentsHtml = sale.payments.length
      ? sale.payments
          .map((payment) => {
            const methodLabel = this.escapeHtml(this.formatPaymentMethod(payment.method));
            const helper =
              payment.installments && payment.installments > 1
                ? ` (${payment.installments}x)`
                : "";
            return `
              <div class="summary-row">
                <span>${methodLabel}${helper}</span>
                <span>${this.formatCurrency(payment.amount)}</span>
              </div>
            `;
          })
          .join("")
      : `
          <div class="summary-row">
            <span>Pagamento</span>
            <span>${this.formatCurrency(sale.total)}</span>
          </div>
        `;
    const discountRow =
      sale.discountAmount > 0
        ? `
            <div class="summary-row">
              <span>Desconto</span>
              <span>${this.formatCurrency(sale.discountAmount)}</span>
            </div>
          `
        : "";
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
    <title>Comprovante ${this.escapeHtml(sale.saleNumber)}</title>
    <style>
      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
      }

      body {
        background: #e5e7eb;
        color: #111827;
        font-family: "Courier New", Courier, monospace;
        font-size: 12px;
        line-height: 1.45;
        padding: 16px;
      }

      .receipt {
        width: min(100%, 80mm);
        margin: 0 auto;
        background: #ffffff;
        padding: 16px 14px 18px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
      }

      .center {
        text-align: center;
      }

      .store-name {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .divider {
        border-top: 1px dashed #111827;
        margin: 10px 0;
      }

      .meta,
      .summary-row,
      .item-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        justify-content: space-between;
      }

      .meta + .meta,
      .summary-row + .summary-row,
      .item + .item {
        margin-top: 4px;
      }

      .item-label,
      .summary-row span:first-child {
        flex: 1;
        min-width: 0;
      }

      .item-value,
      .summary-row span:last-child {
        white-space: nowrap;
        font-weight: 700;
      }

      .total-row {
        align-items: baseline;
        font-size: 15px;
        font-weight: 700;
      }

      .muted {
        color: #4b5563;
      }

      @media print {
        body {
          background: #ffffff;
          padding: 0;
        }

        .receipt {
          width: auto;
          box-shadow: none;
          padding: 0;
        }
      }
    </style>
    ${autoprintScript}
  </head>
  <body>
    <main class="receipt">
      <div class="center">
        <div class="store-name">${storeName}</div>
      </div>

      <div class="divider"></div>

      <div class="center"><strong>COMPROVANTE Nº ${this.escapeHtml(sale.saleNumber)}</strong></div>
      <div class="meta"><span>Data:</span><span>${this.escapeHtml(completedAt)}</span></div>
      <div class="meta"><span>Operador:</span><span>${operatorName}</span></div>
      <div class="meta"><span>Cliente:</span><span>${customerName}</span></div>

      <div class="divider"></div>

      ${itemsHtml}

      <div class="divider"></div>

      <div class="summary-row">
        <span>Subtotal</span>
        <span>${this.formatCurrency(sale.subtotal)}</span>
      </div>
      ${discountRow}
      <div class="summary-row total-row">
        <span>TOTAL</span>
        <span>${this.formatCurrency(sale.total)}</span>
      </div>

      ${paymentsHtml ? `<div class="divider"></div>${paymentsHtml}` : ""}

      <div class="divider"></div>

      <div class="center muted">Documento sem valor fiscal</div>
      <div class="center">Obrigado pela preferencia!</div>
    </main>
  </body>
</html>`;
  }

  private verifyReceiptPrintToken(token: string) {
    if (!token.trim()) {
      throw new UnauthorizedException("Token de impressao ausente.");
    }

    try {
      const payload = verify(token, this.getReceiptSecret()) as ReceiptPrintTokenPayload;

      if (
        payload.kind !== "fiscal-receipt-print" ||
        typeof payload.saleId !== "string" ||
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

  private formatReceiptDateTime(date: Date, timeZone: string) {
    const parts = formatDateParts(date, timeZone);
    const day = String(parts.day).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    const year = String(parts.year).padStart(4, "0");
    const hour = String(parts.hour).padStart(2, "0");
    const minute = String(parts.minute).padStart(2, "0");

    return `${day}/${month}/${year} ${hour}:${minute}`;
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value / 100);
  }

  private formatPaymentMethod(method: PaymentMethod) {
    switch (method) {
      case PaymentMethod.CASH:
        return "Dinheiro";
      case PaymentMethod.PIX:
        return "PIX";
      case PaymentMethod.DEBIT:
        return "Debito";
      case PaymentMethod.CREDIT:
        return "Credito";
      case PaymentMethod.STORE_CREDIT:
        return "Credito da loja";
      default:
        return method;
    }
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
