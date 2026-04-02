import { Link } from "react-router-dom";
import { BarChart3, CircleDollarSign, ClipboardList, Users } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestao"
        title="Relatorios"
        description="Area gerencial ligada a consultas reais do PostgreSQL para vendas, estoque, caixa e clientes."
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <ReportCard
          description="Faturamento, ticket medio, itens vendidos, grafico diario e exportacao CSV."
          icon={BarChart3}
          title="Vendas"
          to="/reports/sales"
        />
        <ReportCard
          description="Saldo consolidado por produto e local, baixo estoque e valor do inventario."
          icon={ClipboardList}
          title="Estoque"
          to="/reports/stock"
        />
        <ReportCard
          description="Fluxo de caixa real por sessao e movimento, com filtros por terminal, periodo e pagamento."
          icon={CircleDollarSign}
          title="Caixa"
          to="/reports/cash"
        />
        <ReportCard
          description="Receita por cliente, ticket medio, ultima compra e recebiveis em aberto."
          icon={Users}
          title="Clientes"
          to="/reports/customers"
        />
      </div>
    </div>
  );
}

function ReportCard({
  description,
  icon: Icon,
  title,
  to
}: {
  description: string;
  icon: typeof BarChart3;
  title: string;
  to: string;
}) {
  return (
    <Link to={to}>
      <Card className="h-full border-border/70 bg-white/90 transition-colors hover:bg-secondary/40">
        <CardHeader className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-2">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 text-sm font-medium text-primary">
          Abrir relatorio
        </CardContent>
      </Card>
    </Link>
  );
}
