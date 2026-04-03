import type { PermissionKey } from "@/shared";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  BarChart3,
  BadgePercent,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileBadge2,
  HandCoins,
  LayoutDashboard,
  MapPin,
  Package,
  PackagePlus,
  ReceiptText,
  ScanLine,
  Store,
  Truck,
  Undo2,
  Users
} from "lucide-react";
import { Wrench } from "lucide-react";

export type AppNavBadgeKey =
  | "service-orders-open"
  | "accounts-payable-overdue"
  | "accounts-receivable-overdue";

export type AppNavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  description: string;
  permission?: PermissionKey;
  badgeKey?: AppNavBadgeKey;
};

export type AppNavGroup = {
  label: string;
  items: AppNavItem[];
};

export const navigationGroups: AppNavGroup[] = [
  {
    label: "Operacao",
    items: [
      {
        label: "Dashboard",
        to: "/dashboard",
        icon: LayoutDashboard,
        description: "Indicadores, curva de vendas e alertas gerenciais.",
        permission: "reports.read"
      },
      {
        label: "PDV",
        to: "/pdv",
        icon: ScanLine,
        description: "Busca rapida, carrinho e checkout vinculado ao caixa.",
        permission: "sales.checkout"
      },
      {
        label: "Caixa",
        to: "/cash",
        icon: CircleDollarSign,
        description: "Abertura, reforco, sangria, fechamento e historico.",
        permission: "cash.read"
      },
      {
        label: "Vendas",
        to: "/sales",
        icon: ReceiptText,
        description: "Historico e detalhe das vendas concluidas.",
        permission: "sales.read"
      }
    ]
  },
  {
    label: "Estoque",
    items: [
      {
        label: "Estoque",
        to: "/inventory",
        icon: Boxes,
        description: "Saldos, movimentos e consulta real por local.",
        permission: "inventory.read"
      },
      {
        label: "Entradas",
        to: "/inventory/entry",
        icon: PackagePlus,
        description: "Lancamentos de entrada com atualizacao imediata do saldo.",
        permission: "inventory.entry"
      },
      {
        label: "Ajustes",
        to: "/inventory/adjustment",
        icon: ClipboardList,
        description: "Correcao rastreavel de divergencias de estoque.",
        permission: "inventory.adjust"
      },
      {
        label: "Transferencias",
        to: "/inventory/transfer",
        icon: ArrowRightLeft,
        description: "Movimentacao entre locais sem perder rastreabilidade.",
        permission: "inventory.transfer"
      },
      {
        label: "Unidades",
        to: "/inventory/units",
        icon: Package,
        description: "Controle por IMEI ou serial das unidades fisicas.",
        permission: "inventory.read"
      },
      {
        label: "Locais",
        to: "/stock-locations",
        icon: MapPin,
        description: "Cadastro e manutencao dos locais de estoque.",
        permission: "inventory.read"
      }
    ]
  },
  {
    label: "Cadastros",
    items: [
      {
        label: "Produtos",
        to: "/products",
        icon: Package,
        description: "Catalogo de produtos fisicos com precos, codigos e fornecedor.",
        permission: "products.read"
      },
      {
        label: "Servicos",
        to: "/services",
        icon: Wrench,
        description: "Catalogo de servicos sem dependencia de estoque.",
        permission: "products.read"
      },
      {
        label: "Clientes",
        to: "/customers",
        icon: Users,
        description: "Cadastro e manutencao de clientes.",
        permission: "customers.read"
      },
      {
        label: "Fornecedores",
        to: "/suppliers",
        icon: Truck,
        description: "Cadastro de fornecedores e parceiros.",
        permission: "suppliers.read"
      },
      {
        label: "Categorias",
        to: "/categories",
        icon: Boxes,
        description: "Prefixos e regras do catalogo.",
        permission: "categories.read"
      }
    ]
  },
  {
    label: "Financeiro",
    items: [
      {
        label: "Financeiro",
        to: "/financial",
        icon: CreditCard,
        description: "Pulso consolidado de entradas, saidas e previsao.",
        permission: "financial.read"
      },
      {
        label: "Contas a pagar",
        to: "/accounts-payable",
        icon: Truck,
        description: "Titulos de fornecedores, vencimentos e baixas.",
        permission: "accounts-payable.read",
        badgeKey: "accounts-payable-overdue"
      },
      {
        label: "Contas a receber",
        to: "/accounts-receivable",
        icon: Users,
        description: "Titulos de clientes, recebimentos e atrasos.",
        permission: "accounts-receivable.read",
        badgeKey: "accounts-receivable-overdue"
      }
    ]
  },
  {
    label: "Servicos",
    items: [
      {
        label: "Ordens de servico",
        to: "/service-orders",
        icon: Wrench,
        description: "Abertura de OS, timeline tecnica e consumo de pecas.",
        permission: "service-orders.read",
        badgeKey: "service-orders-open"
      },
      {
        label: "Pedidos de compra",
        to: "/purchase-orders",
        icon: Truck,
        description: "Planejamento, recebimento parcial e integracao com financeiro.",
        permission: "purchase-orders.read"
      },
      {
        label: "Devolucoes",
        to: "/sale-returns",
        icon: Undo2,
        description: "Retorno de itens, reembolso e rastreio pos-venda.",
        permission: "sale-returns.read"
      }
    ]
  },
  {
    label: "Gestao",
    items: [
      {
        label: "Relatorios",
        to: "/reports",
        icon: BarChart3,
        description: "Vendas, estoque, caixa, clientes e exportacoes CSV.",
        permission: "reports.read"
      },
      {
        label: "Minhas comissoes",
        to: "/commissions/my",
        icon: HandCoins,
        description: "Resumo mensal das comissoes registradas e meta pessoal.",
        permission: "commissions.read"
      },
      {
        label: "Comissoes da equipe",
        to: "/commissions/team",
        icon: BadgePercent,
        description: "Visao gerencial por vendedor com total vendido, comissao e meta.",
        permission: "commissions.manage"
      },
      {
        label: "Fiscal",
        to: "/fiscal",
        icon: FileBadge2,
        description: "Comprovantes internos, cancelamentos e relatorio fiscal base.",
        permission: "fiscal.read"
      },
      {
        label: "Configuracoes",
        to: "/settings/store",
        icon: Store,
        description: "Branding e configuracao institucional da loja.",
        permission: "stores.read"
      }
    ]
  }
];

const flatNavigation = navigationGroups.flatMap((group) => group.items);

export function findNavigationItem(pathname: string) {
  return [...flatNavigation]
    .sort((left, right) => right.to.length - left.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}

export function isNavigationItemActive(item: AppNavItem, pathname: string) {
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function getRouteTitle(pathname: string) {
  const matchedItem = findNavigationItem(pathname);

  if (matchedItem) {
    return {
      title: matchedItem.label,
      description: matchedItem.description
    };
  }

  return {
    title: "ALPHA TECNOLOGIA",
    description: "Workspace principal da operacao autenticada."
  };
}

export function resolveDefaultRoute(
  hasPermission: (permission?: PermissionKey | PermissionKey[]) => boolean
) {
  if (hasPermission("reports.read")) {
    return "/dashboard";
  }

  if (hasPermission("sales.checkout")) {
    return "/pdv";
  }

  if (hasPermission("inventory.read")) {
    return "/inventory";
  }

  const firstVisibleRoute = flatNavigation.find((item) => hasPermission(item.permission));
  return firstVisibleRoute?.to ?? "/unauthorized";
}
