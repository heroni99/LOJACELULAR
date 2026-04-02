import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  ProductCodeScope,
  ProductCodeType,
  ProductUnitStatus
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateProductCodeDto } from "./dto/create-product-code.dto";
import { CreateProductLabelsDto } from "./dto/create-product-labels.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { UpdateProductCodeDto } from "./dto/update-product-code.dto";
import { UpdateProductActiveDto } from "./dto/update-product-active.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

type ProductAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type UploadedProductImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

type ProductUnitSummary = {
  totalUnits: number;
  inStockUnits: number;
  soldUnits: number;
  reservedUnits: number;
  damagedUnits: number;
};

const SAFE_SEQUENCE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PRODUCT_IMAGE_UPLOADS_DIR = join(process.cwd(), "uploads", "products");
const MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const ALLOWED_PRODUCT_CODE_TYPES = new Set<ProductCodeType>([
  ProductCodeType.INTERNAL_BARCODE,
  ProductCodeType.MANUFACTURER_BARCODE,
  ProductCodeType.EAN13,
  ProductCodeType.CODE128
]);
const EMPTY_UNIT_SUMMARY: ProductUnitSummary = {
  totalUnits: 0,
  inStockUnits: 0,
  soldUnits: 0,
  reservedUnits: 0,
  damagedUnits: 0
};

const productCodeSelect = {
  id: true,
  code: true,
  codeType: true,
  scope: true,
  isPrimary: true,
  createdAt: true
} satisfies Prisma.ProductCodeSelect;

const productDetailInclude = {
  category: {
    select: {
      id: true,
      name: true,
      prefix: true,
      sequenceName: true,
      defaultSerialized: true
    }
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  codes: {
    where: {
      productUnitId: null
    },
    select: productCodeSelect,
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
  }
} satisfies Prisma.ProductInclude;

type ProductRecord = Prisma.ProductGetPayload<{
  include: typeof productDetailInclude;
}>;

type ProductCodeRecord = Prisma.ProductCodeGetPayload<{
  select: typeof productCodeSelect;
}>;

type SerializedBarcodeSource = "store" | "primary" | "alternate";

type SerializedProductBarcode = {
  id: string;
  code: string;
  codeType: ProductCodeType;
  isPrimary: boolean;
  barcodeFormat: "CODE128";
  source: SerializedBarcodeSource;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListProductsDto) {
    const search = filters.search?.trim();
    const normalizedSearch = search ? this.normalizeLookupCode(search) : undefined;
    const where: Prisma.ProductWhereInput = {
      ...(filters.active === undefined ? {} : { active: filters.active }),
      ...(filters.isService === undefined ? {} : { isService: filters.isService }),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.brand
        ? {
            brand: {
              contains: filters.brand,
              mode: "insensitive"
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              {
                internalCode: {
                  contains: normalizedSearch,
                  mode: "insensitive"
                }
              },
              {
                supplierCode: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              { brand: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              {
                codes: {
                  some: {
                    code: {
                      contains: normalizedSearch,
                      mode: "insensitive"
                    }
                  }
                }
              },
              {
                units: {
                  some: {
                    OR: [
                      { imei: search },
                      { imei2: search },
                      { serialNumber: search }
                    ]
                  }
                }
              }
            ]
          }
        : {})
    };

    const products = await this.prisma.product.findMany({
      where,
      include: productDetailInclude,
      ...(filters.take === undefined ? {} : { take: filters.take }),
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });

    return this.serializeProducts(products);
  }

  async search(filters: ListProductsDto) {
    return this.findAll(filters);
  }

  async findById(id: string) {
    const product = await this.loadProductRecordOrFail(id);
    return this.serializeProductRecord(product);
  }

  async findByInternalCode(internalCode: string) {
    const normalizedCode = this.normalizeLookupCode(internalCode);
    const product = await this.prisma.product.findUnique({
      where: {
        internalCode: normalizedCode
      },
      include: productDetailInclude
    });

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse internal_code.");
    }

    return this.serializeProductRecord(product);
  }

  async findBySupplierCode(supplierCode: string) {
    const normalizedSupplierCode = supplierCode.trim();
    const products = await this.prisma.product.findMany({
      where: {
        supplierCode: normalizedSupplierCode
      },
      include: productDetailInclude,
      take: 2,
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!products.length) {
      throw new NotFoundException("Produto nao encontrado para esse supplier_code.");
    }

    if (products.length > 1) {
      throw new ConflictException(
        "Mais de um produto encontrado para esse supplier_code. Filtre tambem pelo fornecedor."
      );
    }

    return this.serializeProductRecord(products[0]);
  }

  async findByBarcode(code: string) {
    const product = await this.findByBarcodeOrNull(code);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse codigo de barras.");
    }

    return this.serializeProductRecord(product);
  }

  async findByImei(imei: string) {
    const product = await this.findByImeiOrNull(imei);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse IMEI/serial.");
    }

    return this.serializeProductRecord(product);
  }

  async getBarcode(id: string) {
    const product = await this.loadProductRecordOrFail(id);
    this.assertPhysicalProductForBarcode(product);

    const barcode = this.resolveDisplayBarcode(product.codes);

    return {
      productId: product.id,
      internalCode: product.internalCode,
      productName: product.name,
      storeBarcode: this.serializeBarcodeSummary(
        this.findStoreBarcode(product.codes),
        "store"
      ),
      primaryBarcode: this.serializeBarcodeSummary(
        this.findPrimaryBarcode(product.codes),
        "primary"
      ),
      displayBarcode: barcode ? this.serializeBarcodeSummary(barcode.code, barcode.source) : null
    };
  }

  async generateBarcode(id: string, context: ProductAuditContext) {
    const previous = await this.findById(id);

    if (previous.isService) {
      throw new BadRequestException(
        "Servicos nao possuem barcode operacional nem etiqueta fisica."
      );
    }

    if (previous.storeBarcode) {
      return {
        productId: previous.id,
        barcode: previous.storeBarcode,
        product: previous
      };
    }

    const barcode = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: {
          id
        },
        include: productDetailInclude
      });

      if (!product) {
        throw new NotFoundException("Produto nao encontrado.");
      }

      this.assertPhysicalProductForBarcode(product);

      return this.ensureStoreBarcodeForProduct(tx, product, {
        makePrimaryWhenMissing: product.codes.length === 0
      });
    });

    const product = await this.findById(id);

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "products.barcode_generated",
      entity: "product_codes",
      entityId: barcode.id,
      oldData: previous,
      newData: product,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      productId: product.id,
      barcode: this.serializeBarcodeSummary(barcode, "store"),
      product
    };
  }

  async createLabels(payload: CreateProductLabelsDto, context: ProductAuditContext) {
    if (!payload.items.length) {
      throw new BadRequestException("Informe ao menos um produto para montar as etiquetas.");
    }

    const labels = await this.prisma.$transaction(async (tx) => {
      const builtLabels = [];

      for (const item of payload.items) {
        const product = await tx.product.findUnique({
          where: {
            id: item.productId
          },
          include: productDetailInclude
        });

        if (!product) {
          throw new NotFoundException("Produto nao encontrado para a etiqueta.");
        }

        this.assertPhysicalProductForBarcode(product);

        const ensuredBarcode =
          this.findStoreBarcode(product.codes) ??
          (await this.ensureStoreBarcodeForProduct(tx, product, {
            makePrimaryWhenMissing: product.codes.length === 0
          }));

        builtLabels.push({
          productId: product.id,
          quantity: item.quantity,
          productName: product.name,
          shortName: this.buildLabelName(product.name),
          internalCode: product.internalCode,
          supplierCode: product.supplierCode,
          salePrice: product.salePrice,
          imageUrl: product.imageUrl,
          barcode: {
            ...this.serializeBarcodeSummary(ensuredBarcode, "store"),
            humanReadableCode: ensuredBarcode.code
          }
        });
      }

      return builtLabels;
    });

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "products.labels.prepared",
      entity: "products",
      entityId: null,
      newData: {
        items: labels.map((label) => ({
          productId: label.productId,
          quantity: label.quantity,
          barcode: label.barcode.code
        })),
        includePrice: payload.includePrice ?? false
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      items: labels,
      includePrice: payload.includePrice ?? false,
      totalLabels: labels.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  async create(payload: CreateProductDto, context: ProductAuditContext) {
    const category = await this.getCategoryOrFail(payload.categoryId);

    if (payload.supplierId) {
      await this.getSupplierOrFail(payload.supplierId);
    }

    const normalizedInput = this.normalizeCatalogState({
      costPrice: payload.costPrice,
      salePrice: payload.salePrice,
      stockMin: payload.stockMin,
      hasSerialControl: payload.hasSerialControl ?? category.defaultSerialized,
      isService: payload.isService ?? false
    });

    this.validateCatalogState(normalizedInput);

    try {
      const createdProduct = await this.prisma.$transaction(async (tx) => {
        await this.ensureSequenceExists(tx, category.sequenceName);

        const nextValue = await this.getNextSequenceValue(tx, category.sequenceName);
        const internalCode = this.buildInternalCode(category.prefix, nextValue);

        const product = await tx.product.create({
          data: {
            categoryId: category.id,
            supplierId: payload.supplierId ?? null,
            name: payload.name,
            description: payload.description ?? null,
            brand: payload.brand ?? null,
            model: payload.model ?? null,
            internalCode,
            supplierCode: payload.supplierCode ?? null,
            costPrice: normalizedInput.costPrice,
            salePrice: normalizedInput.salePrice,
            stockMin: normalizedInput.stockMin,
            hasSerialControl: normalizedInput.hasSerialControl,
            needsPriceReview: payload.needsPriceReview ?? false,
            isService: normalizedInput.isService,
            active: payload.active ?? true
          },
          include: productDetailInclude
        });

        if (!product.isService) {
          await this.ensureStoreBarcodeForProduct(tx, product, {
            makePrimaryWhenMissing: true
          });
        }

        return tx.product.findUniqueOrThrow({
          where: {
            id: product.id
          },
          include: productDetailInclude
        });
      });

      const product = await this.serializeProductRecord(createdProduct);

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "products.created",
        entity: "products",
        entityId: product.id,
        newData: product,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return product;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(id: string, payload: UpdateProductDto, context: ProductAuditContext) {
    const previous = await this.findById(id);
    const category = payload.categoryId
      ? await this.getCategoryOrFail(payload.categoryId)
      : previous.category;

    if (payload.supplierId) {
      await this.getSupplierOrFail(payload.supplierId);
    }

    const nextIsService = payload.isService ?? previous.isService;
    const nextHasSerialControl = payload.hasSerialControl ?? previous.hasSerialControl;
    const nextStockMin = payload.stockMin ?? previous.stockMin;

    const normalizedInput = this.normalizeCatalogState({
      costPrice: payload.costPrice ?? previous.costPrice,
      salePrice: payload.salePrice ?? previous.salePrice,
      stockMin: nextStockMin,
      hasSerialControl: nextHasSerialControl,
      isService: nextIsService
    });

    this.validateCatalogState(normalizedInput);

    try {
      const updatedProduct = await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.update({
          where: {
            id
          },
          data: {
            categoryId: category.id,
            supplierId: payload.supplierId === undefined ? undefined : payload.supplierId,
            name: payload.name ?? undefined,
            description: payload.description === undefined ? undefined : payload.description,
            brand: payload.brand === undefined ? undefined : payload.brand,
            model: payload.model === undefined ? undefined : payload.model,
            supplierCode:
              payload.supplierCode === undefined ? undefined : payload.supplierCode,
            costPrice:
              payload.costPrice === undefined ? undefined : normalizedInput.costPrice,
            salePrice:
              payload.salePrice === undefined ? undefined : normalizedInput.salePrice,
            stockMin: normalizedInput.stockMin,
            hasSerialControl: normalizedInput.hasSerialControl,
            needsPriceReview: payload.needsPriceReview ?? undefined,
            isService: normalizedInput.isService,
            active: payload.active ?? undefined
          },
          include: productDetailInclude
        });

        if (!product.isService) {
          await this.ensureStoreBarcodeForProduct(tx, product, {
            makePrimaryWhenMissing: false
          });
        }

        return tx.product.findUniqueOrThrow({
          where: {
            id: product.id
          },
          include: productDetailInclude
        });
      });

      const product = await this.serializeProductRecord(updatedProduct);

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "products.updated",
        entity: "products",
        entityId: product.id,
        oldData: previous,
        newData: product,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return product;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async updateActive(
    id: string,
    payload: UpdateProductActiveDto,
    context: ProductAuditContext
  ) {
    const previous = await this.findById(id);

    const updatedProduct = await this.prisma.product.update({
      where: {
        id
      },
      data: {
        active: payload.active
      },
      include: productDetailInclude
    });

    const product = await this.serializeProductRecord(updatedProduct);

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: payload.active ? "products.activated" : "products.deactivated",
      entity: "products",
      entityId: product.id,
      oldData: previous,
      newData: product,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return product;
  }

  async createCode(
    productId: string,
    payload: CreateProductCodeDto,
    context: ProductAuditContext
  ) {
    const product = await this.loadProductRecordOrFail(productId);
    const normalizedCode = this.normalizeLookupCode(payload.code);
    this.validateProductCodeType(payload.codeType);
    await this.assertCodeIsAvailable(normalizedCode);

    const shouldBePrimary = payload.isPrimary ?? product.codes.length === 0;

    try {
      const code = await this.prisma.$transaction(async (tx) => {
        if (shouldBePrimary) {
          await tx.productCode.updateMany({
            where: {
              productId,
              productUnitId: null,
              isPrimary: true
            },
            data: {
              isPrimary: false
            }
          });
        }

        return tx.productCode.create({
          data: {
            productId,
            code: normalizedCode,
            codeType: payload.codeType,
            scope: ProductCodeScope.PRODUCT,
            isPrimary: shouldBePrimary
          },
          select: productCodeSelect
        });
      });

      const nextProduct = await this.findById(productId);

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "products.codes.created",
        entity: "product_codes",
        entityId: code.id,
        oldData: { productId, codes: product.codes },
        newData: { productId, code, codes: nextProduct.codes },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return code;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async updateCode(
    productId: string,
    codeId: string,
    payload: UpdateProductCodeDto,
    context: ProductAuditContext
  ) {
    const product = await this.loadProductRecordOrFail(productId);
    const existingCode = product.codes.find((item) => item.id === codeId);

    if (!existingCode) {
      throw new NotFoundException("Codigo alternativo nao encontrado para esse produto.");
    }

    const nextCode =
      payload.code === undefined ? existingCode.code : this.normalizeLookupCode(payload.code);
    const nextCodeType = payload.codeType ?? existingCode.codeType;
    const shouldBePrimary = payload.isPrimary ?? existingCode.isPrimary;

    this.validateProductCodeType(nextCodeType);

    if (payload.code !== undefined && nextCode !== existingCode.code) {
      await this.assertCodeIsAvailable(nextCode);
    }

    try {
      const updatedCode = await this.prisma.$transaction(async (tx) => {
        if (shouldBePrimary) {
          await tx.productCode.updateMany({
            where: {
              productId,
              productUnitId: null,
              isPrimary: true,
              NOT: {
                id: codeId
              }
            },
            data: {
              isPrimary: false
            }
          });
        }

        return tx.productCode.update({
          where: {
            id: codeId
          },
          data: {
            code: payload.code === undefined ? undefined : nextCode,
            codeType: payload.codeType ?? undefined,
            isPrimary: shouldBePrimary
          },
          select: productCodeSelect
        });
      });

      const nextProduct = await this.findById(productId);

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "products.codes.updated",
        entity: "product_codes",
        entityId: updatedCode.id,
        oldData: existingCode,
        newData: { code: updatedCode, codes: nextProduct.codes },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return updatedCode;
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async deleteCode(productId: string, codeId: string, context: ProductAuditContext) {
    const product = await this.loadProductRecordOrFail(productId);
    const existingCode = product.codes.find((item) => item.id === codeId);

    if (!existingCode) {
      throw new NotFoundException("Codigo alternativo nao encontrado para esse produto.");
    }

    await this.prisma.productCode.delete({
      where: {
        id: codeId
      }
    });

    const nextProduct = await this.findById(productId);

    await this.auditService.log({
      storeId: context.storeId ?? null,
      userId: context.userId ?? null,
      action: "products.codes.deleted",
      entity: "product_codes",
      entityId: existingCode.id,
      oldData: existingCode,
      newData: { productId, codes: nextProduct.codes },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      success: true
    };
  }

  async uploadImage(
    id: string,
    file: UploadedProductImage | undefined,
    context: ProductAuditContext
  ) {
    if (!file) {
      throw new BadRequestException("Selecione uma imagem do produto.");
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Envie uma imagem valida em JPG, PNG, WEBP ou GIF.");
    }

    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      throw new BadRequestException("A imagem deve ter no maximo 5 MB.");
    }

    if (!file.buffer?.length) {
      throw new BadRequestException("A imagem enviada esta vazia.");
    }

    const previous = await this.findById(id);
    await mkdir(PRODUCT_IMAGE_UPLOADS_DIR, { recursive: true });

    const extension = this.getImageExtension(file);
    const fileName = `${id}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
    const absolutePath = join(PRODUCT_IMAGE_UPLOADS_DIR, fileName);
    const imageUrl = `/uploads/products/${fileName}`;

    await writeFile(absolutePath, file.buffer);

    try {
      const updatedProduct = await this.prisma.product.update({
        where: {
          id
        },
        data: {
          imageUrl
        },
        include: productDetailInclude
      });

      await this.deleteProductImageFile(previous.imageUrl);

      const product = await this.serializeProductRecord(updatedProduct);

      await this.auditService.log({
        storeId: context.storeId ?? null,
        userId: context.userId ?? null,
        action: "products.image_uploaded",
        entity: "products",
        entityId: product.id,
        oldData: {
          imageUrl: previous.imageUrl
        },
        newData: {
          imageUrl: product.imageUrl
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return product;
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  private async loadProductRecordOrFail(id: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id
      },
      include: productDetailInclude
    });

    if (!product) {
      throw new NotFoundException("Produto nao encontrado.");
    }

    return product;
  }

  private async findByBarcodeOrNull(code: string) {
    const normalizedCode = this.normalizeLookupCode(code);
    const matchedCode = await this.prisma.productCode.findUnique({
      where: {
        code: normalizedCode
      },
      select: {
        productId: true,
        productUnitId: true
      }
    });

    if (!matchedCode?.productId && !matchedCode?.productUnitId) {
      return null;
    }

    const unitMatch = matchedCode.productUnitId
      ? await this.prisma.productUnit.findUnique({
          where: {
            id: matchedCode.productUnitId
          },
          select: {
            productId: true
          }
        })
      : null;

    const productId = matchedCode.productId ?? unitMatch?.productId;

    if (!productId) {
      return null;
    }

    return this.prisma.product.findUnique({
      where: {
        id: productId
      },
      include: productDetailInclude
    });
  }

  private async findByImeiOrNull(term: string) {
    const normalizedTerm = term.trim();
    const unit = await this.prisma.productUnit.findFirst({
      where: {
        OR: [
          { imei: normalizedTerm },
          { imei2: normalizedTerm },
          { serialNumber: normalizedTerm }
        ]
      },
      select: {
        productId: true
      }
    });

    if (!unit) {
      return null;
    }

    return this.prisma.product.findUnique({
      where: {
        id: unit.productId
      },
      include: productDetailInclude
    });
  }

  private async getCategoryOrFail(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: {
        id: categoryId
      }
    });

    if (!category) {
      throw new NotFoundException("Categoria nao encontrada para o produto.");
    }

    return category;
  }

  private async getSupplierOrFail(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: {
        id: supplierId
      }
    });

    if (!supplier) {
      throw new NotFoundException("Fornecedor nao encontrado para o produto.");
    }

    return supplier;
  }

  private normalizeCatalogState(input: {
    costPrice: number;
    salePrice: number;
    stockMin: number;
    hasSerialControl: boolean;
    isService: boolean;
  }) {
    const isService = input.isService;

    return {
      costPrice: input.costPrice,
      salePrice: input.salePrice,
      stockMin: isService ? 0 : input.stockMin,
      hasSerialControl: isService ? false : input.hasSerialControl,
      isService
    };
  }

  private validateCatalogState(input: {
    costPrice: number;
    salePrice: number;
    isService: boolean;
    hasSerialControl: boolean;
    stockMin: number;
  }) {
    if (input.salePrice <= input.costPrice) {
      throw new BadRequestException("Preco de venda deve ser maior que o custo do item.");
    }

    if (input.isService && input.stockMin > 0) {
      throw new BadRequestException("Servico nao deve ter estoque minimo maior que zero.");
    }

    if (input.isService && input.hasSerialControl) {
      throw new BadRequestException("Servico nao pode nascer com controle serial habilitado.");
    }
  }

  private validateProductCodeType(codeType: ProductCodeType) {
    if (!ALLOWED_PRODUCT_CODE_TYPES.has(codeType)) {
      throw new BadRequestException(
        "Use apenas codigos alternativos do produto nesta etapa. IMEI e serial ficam no controle de unidades."
      );
    }
  }

  private normalizeLookupCode(value: string) {
    const normalized = value.trim().toUpperCase();

    if (!normalized) {
      throw new BadRequestException("Informe um codigo valido.");
    }

    return normalized;
  }

  private assertPhysicalProductForBarcode(product: Pick<ProductRecord, "isService">) {
    if (product.isService) {
      throw new BadRequestException(
        "Servicos nao possuem barcode operacional nem etiqueta fisica."
      );
    }
  }

  private findStoreBarcode(codes: ProductCodeRecord[]) {
    return codes.find((code) => code.codeType === ProductCodeType.INTERNAL_BARCODE) ?? null;
  }

  private findPrimaryBarcode(codes: ProductCodeRecord[]) {
    return codes.find((code) => code.isPrimary) ?? codes[0] ?? null;
  }

  private resolveDisplayBarcode(codes: ProductCodeRecord[]) {
    const storeBarcode = this.findStoreBarcode(codes);

    if (storeBarcode) {
      return {
        code: storeBarcode,
        source: "store" as const
      };
    }

    const primaryBarcode = this.findPrimaryBarcode(codes);

    if (primaryBarcode) {
      return {
        code: primaryBarcode,
        source:
          primaryBarcode.isPrimary
            ? ("primary" as const)
            : ("alternate" as const)
      };
    }

    return null;
  }

  private serializeBarcodeSummary(
    code: ProductCodeRecord | null | undefined,
    source: SerializedBarcodeSource
  ): SerializedProductBarcode | null {
    if (!code) {
      return null;
    }

    return {
      id: code.id,
      code: code.code,
      codeType: code.codeType,
      isPrimary: code.isPrimary,
      barcodeFormat: "CODE128",
      source
    };
  }

  private async ensureStoreBarcodeForProduct(
    prisma: Prisma.TransactionClient,
    product: Pick<ProductRecord, "id" | "internalCode" | "isService" | "codes">,
    options: {
      makePrimaryWhenMissing: boolean;
    }
  ) {
    if (product.isService) {
      throw new BadRequestException(
        "Servicos nao possuem barcode operacional nem etiqueta fisica."
      );
    }

    const existingStoreBarcode = this.findStoreBarcode(product.codes);

    if (existingStoreBarcode) {
      return existingStoreBarcode;
    }

    const generatedCode = await this.resolveGeneratedBarcodeValue(
      prisma,
      product.internalCode,
      product.id
    );

    return prisma.productCode.create({
      data: {
        productId: product.id,
        code: generatedCode,
        codeType: ProductCodeType.INTERNAL_BARCODE,
        scope: ProductCodeScope.PRODUCT,
        isPrimary: options.makePrimaryWhenMissing && !product.codes.some((code) => code.isPrimary)
      },
      select: productCodeSelect
    });
  }

  private async resolveGeneratedBarcodeValue(
    prisma: Prisma.TransactionClient,
    internalCode: string,
    productId: string
  ) {
    const preferredCode = this.normalizeLookupCode(internalCode);
    const preferredMatch = await prisma.productCode.findUnique({
      where: {
        code: preferredCode
      },
      select: {
        id: true,
        productId: true
      }
    });

    if (!preferredMatch || preferredMatch.productId === productId) {
      return preferredCode;
    }

    let attempt = 1;

    while (attempt <= 20) {
      const candidate = this.normalizeLookupCode(
        attempt === 1 ? `BAR-${internalCode}` : `BAR-${internalCode}-${attempt}`
      );
      const existingCode = await prisma.productCode.findUnique({
        where: {
          code: candidate
        },
        select: {
          id: true
        }
      });

      if (!existingCode) {
        return candidate;
      }

      attempt += 1;
    }

    throw new ConflictException(
      "Nao foi possivel gerar um barcode unico para esse produto."
    );
  }

  private buildLabelName(name: string) {
    const trimmed = name.trim();

    if (trimmed.length <= 42) {
      return trimmed;
    }

    return `${trimmed.slice(0, 39).trimEnd()}...`;
  }

  private async assertCodeIsAvailable(code: string) {
    const existingCode = await this.prisma.productCode.findUnique({
      where: {
        code
      },
      select: {
        id: true
      }
    });

    if (existingCode) {
      throw new ConflictException("Ja existe um codigo alternativo com esse valor.");
    }

    const productWithSameInternalCode = await this.prisma.product.findFirst({
      where: {
        internalCode: code
      },
      select: {
        id: true
      }
    });

    if (productWithSameInternalCode) {
      throw new ConflictException(
        "Esse codigo ja esta em uso como internal_code de outro item."
      );
    }

    const productUnitWithSameIdentifier = await this.prisma.productUnit.findFirst({
      where: {
        OR: [{ imei: code }, { imei2: code }, { serialNumber: code }]
      },
      select: {
        id: true
      }
    });

    if (productUnitWithSameIdentifier) {
      throw new ConflictException(
        "Esse codigo ja esta em uso em uma unidade serializada."
      );
    }
  }

  private async ensureSequenceExists(
    prisma: Prisma.TransactionClient,
    sequenceName: string
  ) {
    this.assertSafeSequenceName(sequenceName);

    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${this.quoteIdentifier(sequenceName)} START WITH 1 INCREMENT BY 1`
    );
  }

  private async getNextSequenceValue(
    prisma: Prisma.TransactionClient,
    sequenceName: string
  ) {
    this.assertSafeSequenceName(sequenceName);

    const rows = await prisma.$queryRawUnsafe<Array<{ next_value: bigint }>>(
      `SELECT nextval('${this.quoteIdentifier(sequenceName)}') AS next_value`
    );

    const nextValue = rows[0]?.next_value;

    if (nextValue === undefined || nextValue === null) {
      throw new InternalServerErrorException(
        "Nao foi possivel obter o proximo valor da sequence da categoria."
      );
    }

    return Number(nextValue);
  }

  private buildInternalCode(prefix: string, sequenceValue: number) {
    return `${prefix}-${String(sequenceValue).padStart(6, "0")}`;
  }

  private getImageExtension(file: UploadedProductImage) {
    if (file.mimetype === "image/jpeg") {
      return "jpg";
    }

    if (file.mimetype === "image/png") {
      return "png";
    }

    if (file.mimetype === "image/webp") {
      return "webp";
    }

    if (file.mimetype === "image/gif") {
      return "gif";
    }

    throw new BadRequestException("Formato de imagem nao suportado.");
  }

  private async deleteProductImageFile(imageUrl: string | null | undefined) {
    if (!imageUrl?.startsWith("/uploads/products/")) {
      return;
    }

    const fileName = imageUrl.replace("/uploads/products/", "");

    if (!fileName) {
      return;
    }

    await unlink(join(PRODUCT_IMAGE_UPLOADS_DIR, fileName)).catch(() => undefined);
  }

  private assertSafeSequenceName(sequenceName: string) {
    if (!SAFE_SEQUENCE_NAME_REGEX.test(sequenceName)) {
      throw new InternalServerErrorException(
        "sequence_name invalido para geracao de internal_code."
      );
    }
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier}"`;
  }

  private async serializeProducts(products: ProductRecord[]) {
    const summaries = await this.loadUnitSummaries(products.map((product) => product.id));
    return products.map((product) => this.serializeProduct(product, summaries.get(product.id)));
  }

  private async serializeProductRecord(product: ProductRecord) {
    const summaries = await this.loadUnitSummaries([product.id]);
    return this.serializeProduct(product, summaries.get(product.id));
  }

  private serializeProduct(product: ProductRecord, unitSummary?: ProductUnitSummary) {
    const storeBarcode = this.findStoreBarcode(product.codes);
    const primaryBarcode = this.findPrimaryBarcode(product.codes);
    const displayBarcode = this.resolveDisplayBarcode(product.codes);

    return {
      ...product,
      codes: product.codes,
      storeBarcode: this.serializeBarcodeSummary(storeBarcode, "store"),
      primaryBarcode: this.serializeBarcodeSummary(
        primaryBarcode,
        primaryBarcode?.isPrimary ? "primary" : "alternate"
      ),
      displayBarcode: displayBarcode
        ? this.serializeBarcodeSummary(displayBarcode.code, displayBarcode.source)
        : null,
      unitSummary: unitSummary ?? { ...EMPTY_UNIT_SUMMARY }
    };
  }

  private async loadUnitSummaries(productIds: string[]) {
    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
    const summaries = new Map<string, ProductUnitSummary>();

    if (!uniqueProductIds.length) {
      return summaries;
    }

    const rows = await this.prisma.productUnit.groupBy({
      by: ["productId", "unitStatus"],
      where: {
        productId: {
          in: uniqueProductIds
        }
      },
      _count: {
        _all: true
      }
    });

    for (const productId of uniqueProductIds) {
      summaries.set(productId, { ...EMPTY_UNIT_SUMMARY });
    }

    for (const row of rows) {
      const summary = summaries.get(row.productId) ?? { ...EMPTY_UNIT_SUMMARY };
      const count = row._count._all;

      summary.totalUnits += count;

      if (row.unitStatus === ProductUnitStatus.IN_STOCK) {
        summary.inStockUnits += count;
      }

      if (row.unitStatus === ProductUnitStatus.SOLD) {
        summary.soldUnits += count;
      }

      if (row.unitStatus === ProductUnitStatus.RESERVED) {
        summary.reservedUnits += count;
      }

      if (row.unitStatus === ProductUnitStatus.DAMAGED) {
        summary.damagedUnits += count;
      }

      summaries.set(row.productId, summary);
    }

    return summaries;
  }

  private handleWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : String(error.meta?.target ?? "");

      if (target.includes("internal_code")) {
        throw new ConflictException("Ja existe um produto com esse internal_code.");
      }

      if (target.includes("supplier_id") && target.includes("supplier_code")) {
        throw new ConflictException(
          "Ja existe um produto com esse supplier_code para o fornecedor informado."
        );
      }

      if (target.includes("code")) {
        throw new ConflictException("Ja existe um codigo alternativo com esse valor.");
      }

      throw new ConflictException("Ja existe um produto com os mesmos dados unicos.");
    }

    throw error;
  }
}
