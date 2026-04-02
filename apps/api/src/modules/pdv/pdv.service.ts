import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, ProductUnitStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SearchProductDto } from "./dto/search-product.dto";

const pdvProductInclude = {
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
          isDefault: true
        }
      }
    }
  },
  units: {
    where: {
      unitStatus: ProductUnitStatus.IN_STOCK
    },
    select: {
      id: true,
      imei: true,
      imei2: true,
      serialNumber: true,
      unitStatus: true,
      currentLocation: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          active: true
        }
      }
    },
    take: 30,
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.ProductInclude;

type ProductWithPdvRelations = Prisma.ProductGetPayload<{
  include: typeof pdvProductInclude;
}>;

type ProductUnitMatch = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  currentLocation: {
    id: string;
    name: string;
    isDefault: boolean;
    active: boolean;
  } | null;
};

@Injectable()
export class PdvService {
  constructor(private readonly prisma: PrismaService) {}

  async search(filters: SearchProductDto) {
    const term = filters.term.trim();
    const limit = filters.limit ?? 10;
    const results = new Map<string, ReturnType<PdvService["serializeProduct"]>>();

    const exactMatchers = await Promise.all([
      this.findByInternalCodeOrNull(term, filters.locationId),
      this.findBySupplierCodeOrNull(term, filters.locationId),
      this.findByBarcodeOrNull(term, filters.locationId),
      this.findByImeiOrNull(term, filters.locationId)
    ]);

    exactMatchers.filter(Boolean).forEach((match) => {
      results.set(match!.id, match!);
    });

    const fuzzyProducts = await this.prisma.product.findMany({
      where: {
        active: true,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { internalCode: { contains: term.toUpperCase(), mode: "insensitive" } },
          { supplierCode: { contains: term, mode: "insensitive" } },
          { brand: { contains: term, mode: "insensitive" } },
          { model: { contains: term, mode: "insensitive" } },
          {
            codes: {
              some: {
                code: {
                  contains: term.toUpperCase(),
                  mode: "insensitive"
                }
              }
            }
          }
        ]
      },
      include: pdvProductInclude,
      take: limit,
      orderBy: [{ isService: "asc" }, { name: "asc" }]
    });

    fuzzyProducts.forEach((product) => {
      if (!results.has(product.id)) {
        results.set(
          product.id,
          this.serializeProduct(product, { locationId: filters.locationId })
        );
      }
    });

    return Array.from(results.values()).slice(0, limit);
  }

  async findByInternalCode(internalCode: string) {
    const product = await this.findByInternalCodeOrNull(internalCode);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse codigo interno.");
    }

    return product;
  }

  async findBySupplierCode(supplierCode: string) {
    const product = await this.findBySupplierCodeOrNull(supplierCode);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse supplier_code.");
    }

    return product;
  }

  async findByBarcode(code: string) {
    const product = await this.findByBarcodeOrNull(code);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse codigo de barras.");
    }

    return product;
  }

  async findByImei(imei: string) {
    const product = await this.findByImeiOrNull(imei);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse IMEI/serial.");
    }

    return product;
  }

  async resolveScannedCode(code: string, locationId?: string) {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new BadRequestException("Informe um codigo valido para leitura.");
    }

    const barcodeProduct = await this.findByBarcodeOrNull(normalizedCode, locationId);
    if (barcodeProduct) {
      return barcodeProduct;
    }

    const internalCodeProduct = await this.findByInternalCodeOrNull(normalizedCode, locationId);
    if (internalCodeProduct) {
      return internalCodeProduct;
    }

    const supplierCodeProduct = await this.findBySupplierCodeOrNull(
      normalizedCode,
      locationId
    );
    if (supplierCodeProduct) {
      return supplierCodeProduct;
    }

    return this.findByImeiOrNull(normalizedCode, locationId);
  }

  private async findByInternalCodeOrNull(internalCode: string, locationId?: string) {
    const normalizedCode = internalCode.trim().toUpperCase();
    const product = await this.prisma.product.findFirst({
      where: {
        active: true,
        internalCode: normalizedCode
      },
      include: pdvProductInclude
    });

    return product
      ? this.serializeProduct(product, { matchedBy: "internal_code", locationId })
      : null;
  }

  private async findBySupplierCodeOrNull(supplierCode: string, locationId?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        supplierCode: supplierCode.trim()
      },
      include: pdvProductInclude,
      take: 2,
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!products.length) {
      return null;
    }

    if (products.length > 1) {
      throw new ConflictException(
        "Mais de um produto encontrado para esse supplier_code. Filtre pelo fornecedor."
      );
    }

    return this.serializeProduct(products[0], { matchedBy: "supplier_code", locationId });
  }

  private async findByBarcodeOrNull(code: string, locationId?: string) {
    const normalizedCode = code.trim().toUpperCase();
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
            id: true,
            productId: true,
            imei: true,
            imei2: true,
            serialNumber: true,
            currentLocation: {
              select: {
                id: true,
                name: true,
                isDefault: true,
                active: true
              }
            }
          }
        })
      : null;

    const productId = matchedCode.productId ?? unitMatch?.productId;

    if (!productId) {
      return null;
    }

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId
      },
      include: pdvProductInclude
    });

    if (!product || !product.active) {
      return null;
    }

    return this.serializeProduct(product, {
      matchedBy: "barcode",
      locationId,
      selectedUnit: unitMatch
        ? {
            id: unitMatch.id,
            imei: unitMatch.imei,
            imei2: unitMatch.imei2,
            serialNumber: unitMatch.serialNumber,
            currentLocation: unitMatch.currentLocation
          }
        : null
    });
  }

  private async findByImeiOrNull(term: string, locationId?: string) {
    const unit = await this.prisma.productUnit.findFirst({
      where: {
        OR: [
          { imei: term.trim() },
          { imei2: term.trim() },
          { serialNumber: term.trim() }
        ]
      },
      select: {
        id: true,
        productId: true,
        imei: true,
        imei2: true,
        serialNumber: true,
        currentLocation: {
          select: {
            id: true,
            name: true,
            isDefault: true,
            active: true
          }
        }
      }
    });

    if (!unit) {
      return null;
    }

    const product = await this.prisma.product.findUnique({
      where: {
        id: unit.productId
      },
      include: pdvProductInclude
    });

    if (!product || !product.active) {
      return null;
    }

    return this.serializeProduct(product, {
      matchedBy: "imei",
      locationId,
      selectedUnit: {
        id: unit.id,
        imei: unit.imei,
        imei2: unit.imei2,
        serialNumber: unit.serialNumber,
        currentLocation: unit.currentLocation
      }
    });
  }

  private serializeProduct(
    product: ProductWithPdvRelations,
    options?: {
      matchedBy?: "search" | "barcode" | "internal_code" | "supplier_code" | "imei";
      selectedUnit?: ProductUnitMatch | null;
      locationId?: string;
    }
  ) {
    const balances = options?.locationId
      ? product.balances.filter((balance) => balance.location.id === options.locationId)
      : product.balances;
    const availableUnits = options?.locationId
      ? product.units.filter((unit) => unit.currentLocation?.id === options.locationId)
      : product.units;
    const selectedUnit =
      options?.locationId && options.selectedUnit?.currentLocation?.id !== options.locationId
        ? null
        : (options?.selectedUnit ?? null);

    return {
      id: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierCode: product.supplierCode,
      imageUrl: product.imageUrl,
      description: product.description,
      brand: product.brand,
      model: product.model,
      salePrice: product.salePrice,
      costPrice: product.costPrice,
      active: product.active,
      isService: product.isService,
      hasSerialControl: product.hasSerialControl,
      stockMin: product.stockMin,
      matchedBy: options?.matchedBy ?? "search",
      totalStock: balances.reduce((total, balance) => total + balance.quantity, 0),
      category: product.category,
      supplier: product.supplier,
      balances: balances.map((balance) => ({
        id: balance.id,
        quantity: balance.quantity,
        location: balance.location
      })),
      availableUnits: availableUnits.map((unit) => ({
        id: unit.id,
        imei: unit.imei,
        imei2: unit.imei2,
        serialNumber: unit.serialNumber,
        unitStatus: unit.unitStatus,
        currentLocation: unit.currentLocation
      })),
      selectedUnit
    };
  }
}
