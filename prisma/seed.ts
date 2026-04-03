import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProductCodeScope, ProductCodeType } from "@prisma/client";
import { permissionKeys } from "../packages/shared/src/auth";

config({
  path: fileURLToPath(new URL("../.env", import.meta.url))
});

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});

const prisma = new PrismaClient({ adapter });

type SequenceClient = Pick<PrismaClient, "$executeRawUnsafe" | "$queryRawUnsafe">;

const ALL_PERMISSION_KEYS = [...permissionKeys] as const;

const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  OWNER: ALL_PERMISSION_KEYS,
  MANAGER: [
    "stores.read",
    "stores.update",
    "users.read",
    "users.create",
    "users.update",
    "users.change_password",
    "users.activate",
    "roles.read",
    "customers.read",
    "customers.create",
    "customers.update",
    "suppliers.read",
    "suppliers.create",
    "suppliers.update",
    "categories.read",
    "categories.create",
    "categories.update",
    "products.read",
    "products.create",
    "products.update",
    "inventory.read",
    "inventory.entry",
    "inventory.adjust",
    "inventory.transfer",
    "cash.read",
    "cash.open",
    "cash.move",
    "cash.close",
    "sales.read",
    "sales.checkout",
    "sales.cancel",
    "sales.refund",
    "accounts-payable.read",
    "accounts-payable.create",
    "accounts-payable.update",
    "accounts-payable.pay",
    "accounts-receivable.read",
    "accounts-receivable.create",
    "accounts-receivable.update",
    "accounts-receivable.receive",
    "service-orders.read",
    "service-orders.create",
    "service-orders.update",
    "purchase-orders.read",
    "purchase-orders.create",
    "purchase-orders.update",
    "purchase-orders.receive",
    "sale-returns.read",
    "sale-returns.create",
    "financial.read",
    "commissions.read",
    "commissions.manage",
    "reports.read",
    "audit.read",
    "fiscal.read",
    "fiscal.issue",
    "fiscal.cancel"
  ],
  CASHIER: [
    "stores.read",
    "customers.read",
    "customers.create",
    "customers.update",
    "products.read",
    "cash.read",
    "cash.open",
    "cash.move",
    "cash.close",
    "sales.read",
    "sales.checkout",
    "sale-returns.read",
    "sale-returns.create",
    "reports.read",
    "commissions.read",
    "fiscal.read",
    "fiscal.issue"
  ],
  SELLER: [
    "stores.read",
    "customers.read",
    "customers.create",
    "customers.update",
    "products.read",
    "sales.read",
    "sales.checkout",
    "commissions.read",
    "reports.read",
    "fiscal.read",
    "fiscal.issue"
  ],
  STOCK: [
    "stores.read",
    "suppliers.read",
    "suppliers.create",
    "suppliers.update",
    "categories.read",
    "categories.create",
    "categories.update",
    "products.read",
    "products.create",
    "products.update",
    "inventory.read",
    "inventory.entry",
    "inventory.adjust",
    "inventory.transfer",
    "purchase-orders.read",
    "purchase-orders.create",
    "purchase-orders.update",
    "purchase-orders.receive",
    "commissions.read",
    "reports.read"
  ],
  TECHNICIAN: [
    "stores.read",
    "customers.read",
    "customers.create",
    "customers.update",
    "products.read",
    "commissions.read",
    "service-orders.read",
    "service-orders.create",
    "service-orders.update"
  ]
};

const OWNER_USERS = [
  {
    name: "Nicolas Rodrigues Xavier",
    email: "nicolas@alphatecnologia.local"
  },
  {
    name: "Pedro Clayton",
    email: "pedro@alphatecnologia.local"
  }
] as const;

const INITIAL_CATEGORIES = [
  {
    name: "Celulares",
    prefix: "CEL",
    defaultSerialized: true,
    sequenceName: "seq_category_celulares",
    description: "Celulares e smartphones"
  },
  {
    name: "Capinhas",
    prefix: "CAP",
    defaultSerialized: false,
    sequenceName: "seq_category_capinhas",
    description: "Capas e protecoes"
  },
  {
    name: "Peliculas",
    prefix: "PEL",
    defaultSerialized: false,
    sequenceName: "seq_category_peliculas",
    description: "Peliculas de protecao"
  },
  {
    name: "Cabos",
    prefix: "CAB",
    defaultSerialized: false,
    sequenceName: "seq_category_cabos",
    description: "Cabos e conectores"
  },
  {
    name: "Carregadores",
    prefix: "CAR",
    defaultSerialized: false,
    sequenceName: "seq_category_carregadores",
    description: "Fontes e carregadores"
  },
  {
    name: "Fones",
    prefix: "FON",
    defaultSerialized: false,
    sequenceName: "seq_category_fones",
    description: "Fones e headsets"
  },
  {
    name: "Powerbanks",
    prefix: "PWB",
    defaultSerialized: false,
    sequenceName: "seq_category_powerbanks",
    description: "Baterias externas"
  },
  {
    name: "Acessorios",
    prefix: "ACS",
    defaultSerialized: false,
    sequenceName: "seq_category_acessorios",
    description: "Acessorios gerais"
  },
  {
    name: "Informatica",
    prefix: "INF",
    defaultSerialized: false,
    sequenceName: "seq_category_informatica",
    description: "Itens de informatica"
  },
  {
    name: "Servicos",
    prefix: "SER",
    defaultSerialized: false,
    sequenceName: "seq_category_servicos",
    description: "Servicos gerais"
  },
  {
    name: "Assistencia Tecnica",
    prefix: "AST",
    defaultSerialized: false,
    sequenceName: "seq_category_assistencia_tecnica",
    description: "Assistencia e reparos"
  }
] as const;

const INITIAL_SUPPLIER = {
  name: "PMCELL Sao Paulo",
  tradeName: "PMCELL Sao Paulo",
  cnpj: "29.734.462/0003-86",
  stateRegistration: "130.745.005.110",
  notes: "fornecedor inicial importado de orcamento"
} as const;

const DEFAULT_STOCK_LOCATION = {
  name: "Estoque Principal",
  description: "Local padrao de estoque da loja",
  isDefault: true,
  active: true
} as const;

const INITIAL_PRODUCTS = [
  { supplierCode: "03538", name: "CA25-4 FONTE 2 USB 5.1A", quantity: 6, costPrice: 11.0, category: "Carregadores" },
  { supplierCode: "01321", name: "CB18 CABO PMCELL 66W IP", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "01341", name: "CB18 CABO PMCELL 66W PD", quantity: 5, costPrice: 9.0, category: "Cabos" },
  { supplierCode: "01322", name: "CB18 CABO PMCELL 66W TC", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "02138", name: "CB18 CABO PMCELL 66W TC/TC", quantity: 5, costPrice: 5.5, category: "Cabos" },
  { supplierCode: "01323", name: "CB18 CABO PMCELL 66W V8", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "01340", name: "CB19 CABO PMCELL 66W V8", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "01338", name: "CB19 CABO PMCELL 66W IP", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "01337", name: "CB19 CABO PMCELL 66W PD", quantity: 5, costPrice: 9.0, category: "Cabos" },
  { supplierCode: "01339", name: "CB19 CABO PMCELL 66W TC", quantity: 5, costPrice: 5.0, category: "Cabos" },
  { supplierCode: "02139", name: "CB19 CABO PMCELL 66W TC/TC", quantity: 5, costPrice: 5.5, category: "Cabos" },
  { supplierCode: "03195", name: "CJ-72 SUPORTE VEICULAR R", quantity: 3, costPrice: 16.0, category: "Acessorios" },
  { supplierCode: "00020", name: "CV21 CARREGADOR VEICULAR PMCELL 2.4A", quantity: 3, costPrice: 6.5, category: "Carregadores" },
  { supplierCode: "03185", name: "FO-01 FONE PMCELL", quantity: 3, costPrice: 4.5, category: "Fones" },
  { supplierCode: "03186", name: "FO-02 FONE PMCELL", quantity: 3, costPrice: 4.5, category: "Fones" },
  { supplierCode: "03187", name: "FO-03 FONE PMCELL", quantity: 3, costPrice: 4.5, category: "Fones" },
  { supplierCode: "03188", name: "FO-04 FONE PMCELL", quantity: 3, costPrice: 4.5, category: "Fones" },
  { supplierCode: "00227", name: "FO42 FONE PMCELL P/ IPHONE", quantity: 2, costPrice: 12.0, category: "Fones" },
  { supplierCode: "03190", name: "FO53 FONE PMCELL", quantity: 2, costPrice: 9.0, category: "Fones" },
  { supplierCode: "01308", name: "HC25 FONTE + CABO PMCELL IP", quantity: 3, costPrice: 12.0, category: "Carregadores" },
  { supplierCode: "01310", name: "HC25 FONTE + CABO PMCELL TC", quantity: 3, costPrice: 12.0, category: "Carregadores" },
  { supplierCode: "01309", name: "HC25 FONTE + CABO PMCELL V8", quantity: 3, costPrice: 12.0, category: "Carregadores" },
  { supplierCode: "01346", name: "HC61 FONTE + CABO PMCELL IP", quantity: 3, costPrice: 18.0, category: "Carregadores" },
  { supplierCode: "01347", name: "HC61 FONTE + CABO PMCELL TC", quantity: 3, costPrice: 18.0, category: "Carregadores" },
  { supplierCode: "01345", name: "HC61 FONTE + CABO PMCELL V8", quantity: 3, costPrice: 18.0, category: "Carregadores" },
  { supplierCode: "04584", name: "HP38 HEADPHONE BLUETOOTH PMCELL", quantity: 2, costPrice: 30.0, category: "Fones" },
  { supplierCode: "04948", name: "LR-29-4 FONTE HMASTON", quantity: 6, costPrice: 12.0, category: "Carregadores" },
  { supplierCode: "03308", name: "PB02 POWERBANK", quantity: 1, costPrice: 45.0, category: "Powerbanks" },
  { supplierCode: "04589", name: "PB03 POWERBANK", quantity: 1, costPrice: 65.0, category: "Powerbanks" },
  { supplierCode: "00815", name: "PELICULA 3D", quantity: 100, costPrice: 1.2, category: "Peliculas" },
  { supplierCode: "04215", name: "TE122 KIT TECLADO COM MOUSE C/FIO", quantity: 1, costPrice: 40.0, category: "Informatica" },
  { supplierCode: "01831", name: "TPU (SAMSUNG/MOTOROLA/XIAOMI) VARIADOS", quantity: 100, costPrice: 2.3, category: "Capinhas" },
  { supplierCode: "01375", name: "TPU (IPHONE) VARIADOS", quantity: 20, costPrice: 2.3, category: "Capinhas" },
  { supplierCode: "01689", name: "AVELUDADA (IPHONE) VARIADOS PRETO/BRANCO", quantity: 30, costPrice: 4.5, category: "Capinhas" }
] as const;

const INITIAL_SERVICES = [
  {
    name: "Aplicacao de pelicula 3D",
    category: "Servicos",
    costPrice: 5.0,
    salePrice: 20.0,
    description: "Aplicacao simples de pelicula com acabamento basico."
  },
  {
    name: "Atualizacao e configuracao de software",
    category: "Servicos",
    costPrice: 12.0,
    salePrice: 45.0,
    description: "Configuracao inicial, backup basico e atualizacao de sistema."
  },
  {
    name: "Troca de conector de carga",
    category: "Assistencia Tecnica",
    costPrice: 25.0,
    salePrice: 80.0,
    description: "Servico tecnico com mao de obra e insumos basicos."
  },
  {
    name: "Troca de bateria",
    category: "Assistencia Tecnica",
    costPrice: 30.0,
    salePrice: 90.0,
    description: "Servico tecnico para substituicao de bateria."
  }
] as const;

const INITIAL_SERIALIZED_PRODUCTS = [
  {
    supplierCode: "CEL-A15-128",
    name: "Samsung Galaxy A15 128GB",
    category: "Celulares",
    costPrice: 650.0,
    salePrice: 899.0,
    notes: "Celular serializado seedado para validar IMEI e vendas.",
    units: [
      {
        imei: "351111111111111",
        imei2: "351111111111129",
        serialNumber: "A15-ALPHA-0001"
      }
    ]
  }
] as const;

const SAFE_SEQUENCE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeSeedKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function buildInternalCode(prefix: string, sequenceValue: number) {
  return `${prefix}-${String(sequenceValue).padStart(6, "0")}`;
}

async function ensureStoreBarcode(productId: string, internalCode?: string | null) {
  const resolvedInternalCode =
    internalCode ??
    (
      await prisma.product.findUnique({
        where: {
          id: productId
        },
        select: {
          internalCode: true
        }
      })
    )?.internalCode;

  if (!resolvedInternalCode) {
    throw new Error(`internalCode nao encontrado no seed para o produto ${productId}.`);
  }

  const existingStoreBarcode = await prisma.productCode.findFirst({
    where: {
      productId,
      productUnitId: null,
      codeType: ProductCodeType.INTERNAL_BARCODE
    },
    select: {
      id: true
    }
  });

  if (existingStoreBarcode) {
    return;
  }

  const existingPrimaryCode = await prisma.productCode.findFirst({
    where: {
      productId,
      productUnitId: null,
      isPrimary: true
    },
    select: {
      id: true
    }
  });

  let candidate = resolvedInternalCode.trim().toUpperCase();
  let attempt = 1;

  while (true) {
    const conflict = await prisma.productCode.findUnique({
      where: {
        code: candidate
      },
      select: {
        id: true
      }
    });

    if (!conflict) {
      break;
    }

    candidate =
      attempt === 1
        ? `BAR-${resolvedInternalCode}`.trim().toUpperCase()
        : `BAR-${resolvedInternalCode}-${attempt}`.trim().toUpperCase();
    attempt += 1;
  }

  await prisma.productCode.create({
    data: {
      productId,
      code: candidate,
      codeType: ProductCodeType.INTERNAL_BARCODE,
      scope: ProductCodeScope.PRODUCT,
      isPrimary: !existingPrimaryCode
    }
  });
}

function quoteIdentifier(identifier: string) {
  return `"${identifier}"`;
}

function assertSafeSequenceName(sequenceName: string) {
  if (!SAFE_SEQUENCE_NAME_REGEX.test(sequenceName)) {
    throw new Error(`sequence_name invalido no seed: ${sequenceName}`);
  }
}

async function ensureSequenceExists(client: SequenceClient, sequenceName: string) {
  assertSafeSequenceName(sequenceName);

  await client.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS ${quoteIdentifier(sequenceName)} START WITH 1 INCREMENT BY 1`
  );
}

async function getNextSequenceValue(client: SequenceClient, sequenceName: string) {
  assertSafeSequenceName(sequenceName);

  const rows = await client.$queryRawUnsafe<Array<{ next_value: bigint }>>(
    `SELECT nextval('${quoteIdentifier(sequenceName)}') AS next_value`
  );

  const nextValue = rows[0]?.next_value;

  if (nextValue === undefined || nextValue === null) {
    throw new Error(`Nao foi possivel obter o proximo valor da sequence ${sequenceName}.`);
  }

  return Number(nextValue);
}

function getRoleDescription(roleName: string) {
  switch (roleName) {
    case "OWNER":
      return "Responsavel maximo pela operacao e administracao do sistema";
    case "MANAGER":
      return "Gerencia usuarios e acompanha operacoes administrativas";
    case "CASHIER":
      return "Operador de caixa autenticado";
    case "SELLER":
      return "Vendedor autenticado";
    case "STOCK":
      return "Operador de estoque autenticado";
    default:
      return `${roleName} do sistema`;
  }
}

async function main() {
  const storeCode = process.env.SEED_STORE_CODE ?? "LOJA-001";
  const storeName = process.env.SEED_STORE_NAME ?? "ALPHA TECNOLOGIA";
  const storeDisplayName = process.env.SEED_STORE_DISPLAY_NAME ?? storeName;
  const storePrimaryColor = process.env.SEED_STORE_PRIMARY_COLOR ?? "#f97316";
  const storeSecondaryColor = process.env.SEED_STORE_SECONDARY_COLOR ?? "#111827";
  const storeAccentColor = process.env.SEED_STORE_ACCENT_COLOR ?? "#ffffff";
  const storeLogoUrl = process.env.SEED_STORE_LOGO_URL?.trim() || null;
  const storeBannerUrl = process.env.SEED_STORE_BANNER_URL?.trim() || null;
  const storeHeroBannerEnabled =
    (process.env.SEED_STORE_HERO_BANNER_ENABLED ?? "true").toLowerCase() !== "false";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@local.test").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";
  const cashTerminalName = process.env.SEED_CASH_TERMINAL_NAME ?? "Caixa Principal";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.scannerSession.deleteMany();

  const store = await prisma.store.upsert({
    where: {
      code: storeCode
    },
    update: {
      name: storeName,
      displayName: storeDisplayName,
      active: true,
      primaryColor: storePrimaryColor,
      secondaryColor: storeSecondaryColor,
      accentColor: storeAccentColor,
      logoUrl: storeLogoUrl,
      bannerUrl: storeBannerUrl,
      heroBannerEnabled: storeHeroBannerEnabled
    },
    create: {
      code: storeCode,
      name: storeName,
      displayName: storeDisplayName,
      active: true,
      primaryColor: storePrimaryColor,
      secondaryColor: storeSecondaryColor,
      accentColor: storeAccentColor,
      logoUrl: storeLogoUrl,
      bannerUrl: storeBannerUrl,
      heroBannerEnabled: storeHeroBannerEnabled
    }
  });

  const roleNames = Object.keys(ROLE_PERMISSIONS);

  const roles = await Promise.all(
    roleNames.map((roleName) =>
      prisma.role.upsert({
        where: {
          name: roleName
        },
        update: {
          description: getRoleDescription(roleName),
          active: true,
          isSystem: true
        },
        create: {
          name: roleName,
          description: getRoleDescription(roleName),
          active: true,
          isSystem: true
        }
      })
    )
  );

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: {
        in: roles.map((role) => role.id)
      }
    }
  });

  await prisma.rolePermission.createMany({
    data: roles.flatMap((role) =>
      ROLE_PERMISSIONS[role.name].map((permissionKey) => ({
        roleId: role.id,
        permissionKey
      }))
    )
  });

  const ownerRole = roles.find((role) => role.name === "OWNER");

  if (!ownerRole) {
    throw new Error("Role OWNER nao encontrada durante o seed.");
  }

  await prisma.user.upsert({
    where: {
      email: adminEmail
    },
    update: {
      name: adminName,
      passwordHash,
      storeId: store.id,
      roleId: ownerRole.id,
      active: true,
      mustChangePassword: false
    },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      storeId: store.id,
      roleId: ownerRole.id,
      active: true,
      mustChangePassword: false
    }
  });

  await Promise.all(
    OWNER_USERS.map((user) =>
      prisma.user.upsert({
        where: {
          email: user.email
        },
        update: {
          name: user.name,
          passwordHash,
          storeId: store.id,
          roleId: ownerRole.id,
          active: true,
          mustChangePassword: false
        },
        create: {
          name: user.name,
          email: user.email,
          passwordHash,
          storeId: store.id,
          roleId: ownerRole.id,
          active: true,
          mustChangePassword: false
        }
      })
    )
  );

  const existingSupplier = await prisma.supplier.findFirst({
    where: {
      OR: [
        { name: INITIAL_SUPPLIER.name },
        { cnpj: INITIAL_SUPPLIER.cnpj }
      ]
    },
    select: {
      id: true
    }
  });

  if (existingSupplier) {
    await prisma.supplier.update({
      where: {
        id: existingSupplier.id
      },
      data: {
        name: INITIAL_SUPPLIER.name,
        tradeName: INITIAL_SUPPLIER.tradeName,
        cnpj: INITIAL_SUPPLIER.cnpj,
        stateRegistration: INITIAL_SUPPLIER.stateRegistration,
        notes: INITIAL_SUPPLIER.notes,
        active: true
      }
    });
  } else {
    await prisma.supplier.create({
      data: {
        ...INITIAL_SUPPLIER,
        active: true
      }
    });
  }

  const supplier = await prisma.supplier.findFirstOrThrow({
    where: {
      OR: [{ name: INITIAL_SUPPLIER.name }, { cnpj: INITIAL_SUPPLIER.cnpj }]
    },
    select: {
      id: true,
      name: true
    }
  });

  for (const category of INITIAL_CATEGORIES) {
    await prisma.category.upsert({
      where: {
        name: category.name
      },
      update: {
        prefix: category.prefix,
        description: category.description,
        defaultSerialized: category.defaultSerialized,
        sequenceName: category.sequenceName,
        active: true
      },
      create: {
        ...category,
        active: true
      }
    });

    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${category.sequenceName}" START WITH 1 INCREMENT BY 1`
    );
  }

  const cashTerminal = await prisma.cashTerminal.upsert({
    where: {
      storeId_name: {
        storeId: store.id,
        name: cashTerminalName
      }
    },
    update: {
      active: true
    },
    create: {
      storeId: store.id,
      name: cashTerminalName,
      active: true
    }
  });

  const stockLocation = await prisma.stockLocation.upsert({
    where: {
      storeId_name: {
        storeId: store.id,
        name: DEFAULT_STOCK_LOCATION.name
      }
    },
    update: {
      description: DEFAULT_STOCK_LOCATION.description,
      isDefault: DEFAULT_STOCK_LOCATION.isDefault,
      active: DEFAULT_STOCK_LOCATION.active
    },
    create: {
      storeId: store.id,
      ...DEFAULT_STOCK_LOCATION
    }
  });

  const categories = await prisma.category.findMany({
    where: {
      name: {
        in: INITIAL_CATEGORIES.map((category) => category.name)
      }
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      sequenceName: true,
      defaultSerialized: true
    }
  });

  const categoryMap = new Map(
    categories.map((category) => [normalizeSeedKey(category.name), category])
  );

  let seededProductsCount = 0;
  let seededInitialBalancesCount = 0;
  let seededSerializedProductsCount = 0;
  let seededSerializedUnitsCount = 0;
  let seededServicesCount = 0;

  for (const item of INITIAL_PRODUCTS) {
    const category = categoryMap.get(normalizeSeedKey(item.category));

    if (!category) {
      throw new Error(`Categoria nao encontrada no seed para o produto ${item.name}.`);
    }

    const costPrice = toCents(item.costPrice);
    const salePrice = Math.round(costPrice * 2);

    const existingProduct = await prisma.product.findUnique({
      where: {
        supplierId_supplierCode: {
          supplierId: supplier.id,
          supplierCode: item.supplierCode
        }
      },
      select: {
        id: true
      }
    });

    const product =
      existingProduct === null
        ? await prisma.$transaction(async (tx) => {
            await ensureSequenceExists(tx, category.sequenceName);
            const nextValue = await getNextSequenceValue(tx, category.sequenceName);
            const internalCode = buildInternalCode(category.prefix, nextValue);

            return tx.product.create({
              data: {
                categoryId: category.id,
                supplierId: supplier.id,
                name: item.name,
                internalCode,
                supplierCode: item.supplierCode,
                costPrice,
                salePrice,
                stockMin: 0,
                hasSerialControl: category.defaultSerialized,
                needsPriceReview: true,
                isService: false,
                active: true
              },
              select: {
                id: true,
                internalCode: true
              }
            });
          })
        : await prisma.product.update({
            where: {
              id: existingProduct.id
            },
            data: {
              categoryId: category.id,
              supplierId: supplier.id,
              name: item.name,
              supplierCode: item.supplierCode,
              costPrice,
              salePrice,
              stockMin: 0,
              hasSerialControl: category.defaultSerialized,
              needsPriceReview: true,
              isService: false,
              active: true
            },
            select: {
              id: true,
              internalCode: true
            }
          });

    if (existingProduct === null) {
      seededProductsCount += 1;
    }

    await ensureStoreBarcode(product.id, product.internalCode);

    const existingBalance = await prisma.stockBalance.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: stockLocation.id
        }
      },
      select: {
        id: true
      }
    });

    if (!existingBalance && item.quantity > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          locationId: stockLocation.id,
          movementType: "ENTRY",
          quantity: item.quantity,
          unitCost: costPrice,
          referenceType: "seed_initial_stock",
          notes: `Estoque inicial seedado para ${item.supplierCode}`
        }
      });

      await prisma.stockBalance.create({
        data: {
          productId: product.id,
          locationId: stockLocation.id,
          quantity: item.quantity
        }
      });

      seededInitialBalancesCount += 1;
    }
  }

  for (const item of INITIAL_SERVICES) {
    const category = categoryMap.get(normalizeSeedKey(item.category));

    if (!category) {
      throw new Error(`Categoria nao encontrada no seed para o servico ${item.name}.`);
    }

    const costPrice = toCents(item.costPrice);
    const salePrice = toCents(item.salePrice);

    const existingService = await prisma.product.findFirst({
      where: {
        name: item.name,
        categoryId: category.id,
        isService: true
      },
      select: {
        id: true
      }
    });

    const service =
      existingService === null
        ? await prisma.$transaction(async (tx) => {
            await ensureSequenceExists(tx, category.sequenceName);
            const nextValue = await getNextSequenceValue(tx, category.sequenceName);
            const internalCode = buildInternalCode(category.prefix, nextValue);

            return tx.product.create({
              data: {
                categoryId: category.id,
                supplierId: null,
                name: item.name,
                description: item.description,
                internalCode,
                supplierCode: null,
                costPrice,
                salePrice,
                stockMin: 0,
                hasSerialControl: false,
                needsPriceReview: false,
                isService: true,
                active: true
              },
              select: {
                id: true,
                internalCode: true
              }
            });
          })
        : await prisma.product.update({
            where: {
              id: existingService.id
            },
            data: {
              categoryId: category.id,
              supplierId: null,
              name: item.name,
              description: item.description,
              supplierCode: null,
              costPrice,
              salePrice,
              stockMin: 0,
              hasSerialControl: false,
              needsPriceReview: false,
              isService: true,
              active: true
            },
            select: {
              id: true,
              internalCode: true
            }
          });

    if (existingService === null && service.id) {
      seededServicesCount += 1;
    }
  }

  for (const item of INITIAL_SERIALIZED_PRODUCTS) {
    const category = categoryMap.get(normalizeSeedKey(item.category));

    if (!category) {
      throw new Error(
        `Categoria nao encontrada no seed para o produto serializado ${item.name}.`
      );
    }

    const costPrice = toCents(item.costPrice);
    const salePrice = toCents(item.salePrice);
    const existingProduct = await prisma.product.findUnique({
      where: {
        supplierId_supplierCode: {
          supplierId: supplier.id,
          supplierCode: item.supplierCode
        }
      },
      select: {
        id: true
      }
    });

    const product =
      existingProduct === null
        ? await prisma.$transaction(async (tx) => {
            await ensureSequenceExists(tx, category.sequenceName);
            const nextValue = await getNextSequenceValue(tx, category.sequenceName);
            const internalCode = buildInternalCode(category.prefix, nextValue);

            return tx.product.create({
              data: {
                categoryId: category.id,
                supplierId: supplier.id,
                name: item.name,
                description: item.notes,
                internalCode,
                supplierCode: item.supplierCode,
                costPrice,
                salePrice,
                stockMin: 0,
                hasSerialControl: true,
                needsPriceReview: false,
                isService: false,
                active: true
              },
              select: {
                id: true
              }
            });
          })
        : await prisma.product.update({
            where: {
              id: existingProduct.id
            },
            data: {
              categoryId: category.id,
              supplierId: supplier.id,
              name: item.name,
              description: item.notes,
              supplierCode: item.supplierCode,
              costPrice,
              salePrice,
              stockMin: 0,
              hasSerialControl: true,
              needsPriceReview: false,
              isService: false,
              active: true
            },
            select: {
              id: true
            }
          });

    if (existingProduct === null) {
      seededSerializedProductsCount += 1;
    }

    await ensureStoreBarcode(product.id, product.internalCode);

    for (const unit of item.units) {
      const existingUnit = await prisma.productUnit.findFirst({
        where: {
          OR: [
            { imei: unit.imei },
            { imei2: unit.imei2 },
            { serialNumber: unit.serialNumber }
          ]
        },
        select: {
          id: true
        }
      });

      if (existingUnit) {
        await prisma.productUnit.update({
          where: {
            id: existingUnit.id
          },
          data: {
            productId: product.id,
            supplierId: supplier.id,
            currentLocationId: stockLocation.id,
            purchasePrice: costPrice,
            unitStatus: "IN_STOCK",
            notes: item.notes
          }
        });
        continue;
      }

      await prisma.productUnit.create({
        data: {
          productId: product.id,
          supplierId: supplier.id,
          currentLocationId: stockLocation.id,
          purchasePrice: costPrice,
          unitStatus: "IN_STOCK",
          imei: unit.imei,
          imei2: unit.imei2,
          serialNumber: unit.serialNumber,
          notes: item.notes
        }
      });

      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          locationId: stockLocation.id,
          movementType: "ENTRY",
          quantity: 1,
          unitCost: costPrice,
          referenceType: "seed_serialized_stock",
          notes: `Unidade seedada ${unit.imei ?? unit.serialNumber ?? product.id}`
        }
      });

      const existingBalance = await prisma.stockBalance.findUnique({
        where: {
          productId_locationId: {
            productId: product.id,
            locationId: stockLocation.id
          }
        },
        select: {
          id: true
        }
      });

      if (existingBalance) {
        await prisma.stockBalance.update({
          where: {
            id: existingBalance.id
          },
          data: {
            quantity: {
              increment: 1
            }
          }
        });
      } else {
        await prisma.stockBalance.create({
          data: {
            productId: product.id,
            locationId: stockLocation.id,
            quantity: 1
          }
        });
      }

      seededSerializedUnitsCount += 1;
    }
  }

  console.log("Seed concluido.");
  console.log(`Loja: ${storeName} (${storeCode})`);
  console.log(`Usuario admin OWNER: ${adminEmail}`);
  console.log(
    `Owners adicionais: ${OWNER_USERS.map((user) => user.email).join(", ")}`
  );
  console.log(`Fornecedor inicial: ${INITIAL_SUPPLIER.name}`);
  console.log(`Categorias iniciais: ${INITIAL_CATEGORIES.length}`);
  console.log(`Produtos comerciais iniciais: ${INITIAL_PRODUCTS.length}`);
  console.log(`Produtos serializados seedados: ${seededSerializedProductsCount}`);
  console.log(`Unidades serializadas seedadas: ${seededSerializedUnitsCount}`);
  console.log(`Servicos iniciais: ${INITIAL_SERVICES.length}`);
  console.log(`Terminal inicial: ${cashTerminal.name}`);
  console.log(`Local de estoque inicial: ${stockLocation.name}`);
  console.log(`Produtos criados nesta execucao: ${seededProductsCount}`);
  console.log(`Servicos criados nesta execucao: ${seededServicesCount}`);
  console.log(
    `Saldos iniciais criados nesta execucao: ${seededInitialBalancesCount}`
  );
}

main()
  .catch((error) => {
    console.error("Falha ao executar seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
