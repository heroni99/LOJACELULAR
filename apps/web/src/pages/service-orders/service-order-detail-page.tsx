import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  CheckCircle2,
  Download,
  FileText,
  FileSearch,
  Link2,
  LoaderCircle,
  PackageCheck,
  Pencil,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailCard } from "@/components/ui/detail-card";
import { DetailTabs } from "@/components/ui/detail-tabs";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  approveServiceOrderQuote,
  changeServiceOrderStatus,
  consumeServiceOrderItem,
  deleteServiceOrderAttachment,
  getServiceOrder,
  listCustomers,
  listInventoryUnits,
  listProducts,
  listSales,
  listServiceOrderAttachments,
  listServiceOrderQuotes,
  listStockLocations,
  listUsers,
  rejectServiceOrderQuote,
  resolveApiAssetUrl,
  uploadServiceOrderAttachment,
  updateServiceOrder,
  type ServiceOrder,
  type ServiceOrderAttachment,
  type ServiceOrderQuote,
  type ServiceOrderReceiptFormat,
  type ServiceOrderQuoteStatusName,
  type ServiceOrderStatusName
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCurrency, formatDateTime, parseCurrencyToCents } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { openServiceOrderReceiptWindow } from "@/lib/service-order-receipt";
import { error as toastError, success } from "@/lib/toast";
import {
  AdvancedFeedback,
  ServiceOrderStatusBadge,
  advancedSelectClassName,
  advancedTextareaClassName,
  emptyToUndefined,
  formatServiceOrderItemType,
  formatServiceOrderStatus
} from "@/pages/advanced/advanced-shared";

const editableItemSchema = z.object({
  itemType: z.enum(["PART", "SERVICE", "MANUAL_ITEM"]),
  productId: z.string().optional(),
  productUnitId: z.string().optional(),
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unitPrice: z.string().trim().min(1)
});

const editSchema = z.object({
  customerId: z.string().uuid(),
  assignedToUserId: z.string().optional(),
  relatedSaleId: z.string().optional(),
  deviceType: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  imei: z.string().trim().optional(),
  imei2: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  color: z.string().trim().optional(),
  accessories: z.string().trim().optional(),
  reportedIssue: z.string().trim().min(1),
  foundIssue: z.string().trim().optional(),
  technicalNotes: z.string().trim().optional(),
  estimatedCompletionDate: z.string().trim().optional(),
  totalFinal: z.string().trim().optional(),
  items: z.array(editableItemSchema)
});

type EditValues = z.infer<typeof editSchema>;

type ContextualAction = {
  id: string;
  label: string;
  description: string;
  kind: "status" | "quote-approve" | "quote-reject";
  targetStatus?: ServiceOrderStatusName;
  tone: "primary" | "success" | "warning" | "danger";
  requiresTotalFinal?: boolean;
};

const mainFlowStatuses = [
  "OPEN",
  "WAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "READY_FOR_DELIVERY",
  "DELIVERED"
] as const satisfies readonly ServiceOrderStatusName[];

const mainFlowStepMeta: Record<
  (typeof mainFlowStatuses)[number],
  { shortLabel: string; icon: LucideIcon }
> = {
  OPEN: { shortLabel: "Aberta", icon: FileText },
  WAITING_APPROVAL: { shortLabel: "Aprovacao", icon: FileSearch },
  APPROVED: { shortLabel: "Aprovada", icon: BadgeCheck },
  IN_PROGRESS: { shortLabel: "Servico", icon: Wrench },
  READY_FOR_DELIVERY: { shortLabel: "Entrega", icon: PackageCheck },
  DELIVERED: { shortLabel: "Entregue", icon: ShieldCheck }
};

function getDefaultActionTotal(order?: ServiceOrder) {
  if (!order) {
    return "";
  }

  return ((order.totalFinal ?? order.totalEstimated) / 100).toFixed(2);
}

export function ServiceOrderDetailPage() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, hasPermission } = useAppSession();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const receiptMenuRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [statusNotes, setStatusNotes] = useState("");
  const [statusTotalFinal, setStatusTotalFinal] = useState("");
  const [consumeLocationByItem, setConsumeLocationByItem] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ServiceOrderAttachment | null>(null);
  const [receiptMenuOpen, setReceiptMenuOpen] = useState(false);
  const [receiptPrintPending, setReceiptPrintPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<ContextualAction | null>(null);

  const orderQuery = useQuery({
    queryKey: ["service-orders", id],
    queryFn: () => getServiceOrder(session.accessToken, id),
    enabled: Boolean(id)
  });
  const attachmentsQuery = useQuery({
    queryKey: ["service-orders", id, "attachments"],
    queryFn: () => listServiceOrderAttachments(session.accessToken, id),
    enabled: Boolean(id)
  });
  const quotesQuery = useQuery({
    queryKey: ["service-orders", id, "quotes"],
    queryFn: () => listServiceOrderQuotes(session.accessToken, id),
    enabled: Boolean(id)
  });
  const customersQuery = useQuery({
    queryKey: ["customers", "service-order-detail"],
    queryFn: () => listCustomers(session.accessToken, { active: true, take: 150 })
  });
  const usersQuery = useQuery({
    queryKey: ["users", "service-order-detail"],
    queryFn: () => listUsers(session.accessToken, { active: true, take: 150 })
  });
  const salesQuery = useQuery({
    queryKey: ["sales", "service-order-detail"],
    queryFn: () => listSales(session.accessToken, { status: "COMPLETED", take: 80 })
  });
  const productsQuery = useQuery({
    queryKey: ["products", "service-order-detail"],
    queryFn: () => listProducts(session.accessToken, { active: true, take: 200 })
  });
  const unitsQuery = useQuery({
    queryKey: ["inventory", "units", "service-order-detail"],
    queryFn: () => listInventoryUnits(session.accessToken, { status: "IN_STOCK", take: 200 })
  });
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "service-order-detail"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 150 })
  });

  const products = productsQuery.data ?? [];
  const partProducts = useMemo(() => products.filter((product) => !product.isService), [products]);
  const serviceProducts = useMemo(() => products.filter((product) => product.isService), [products]);
  const inventoryUnits = unitsQuery.data ?? [];
  const order = orderQuery.data;
  const attachments = attachmentsQuery.data ?? [];
  const quotes = quotesQuery.data ?? [];
  const activeQuote =
    quotes.find((quote) => quote.status === "PENDING" || quote.status === "APPROVED") ?? null;
  const latestQuote = activeQuote ?? quotes[0] ?? null;
  const hasPendingQuote = latestQuote?.status === "PENDING";
  const selectedTab = searchParams.get("tab") === "quote" ? "quote" : "operation";
  const imageAttachments = attachments.filter((attachment) =>
    attachment.fileType.startsWith("image/")
  );
  const pdfAttachments = attachments.filter(
    (attachment) => attachment.fileType === "application/pdf"
  );

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      customerId: "",
      assignedToUserId: "",
      relatedSaleId: "",
      deviceType: "",
      brand: "",
      model: "",
      imei: "",
      imei2: "",
      serialNumber: "",
      color: "",
      accessories: "",
      reportedIssue: "",
      foundIssue: "",
      technicalNotes: "",
      estimatedCompletionDate: "",
      totalFinal: "",
      items: []
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });
  const watchItems = form.watch("items");

  useEffect(() => {
    if (!order) {
      return;
    }

    const editableItems = order.items
      .filter((item) => !item.stockConsumed)
      .map((item) => ({
        itemType: item.itemType,
        productId: item.product?.id ?? "",
        productUnitId: item.productUnit?.id ?? "",
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: (item.unitPrice / 100).toFixed(2)
      }));

    form.reset({
      customerId: order.customer.id,
      assignedToUserId: order.assignedToUser?.id ?? "",
      relatedSaleId: order.relatedSale?.id ?? "",
      deviceType: order.deviceType,
      brand: order.brand,
      model: order.model,
      imei: order.imei ?? "",
      imei2: order.imei2 ?? "",
      serialNumber: order.serialNumber ?? "",
      color: order.color ?? "",
      accessories: order.accessories ?? "",
      reportedIssue: order.reportedIssue,
      foundIssue: order.foundIssue ?? "",
      technicalNotes: order.technicalNotes ?? "",
      estimatedCompletionDate: order.estimatedCompletionDate?.slice(0, 10) ?? "",
      totalFinal: order.totalFinal === null ? "" : (order.totalFinal / 100).toFixed(2),
      items: editableItems
    });
    setStatusNotes("");
    setStatusTotalFinal(getDefaultActionTotal(order));
  }, [form, order]);

  const contextualActions = useMemo<ContextualAction[]>(() => {
    switch (order?.status) {
      case "OPEN":
        return [
          {
            id: "register-diagnosis",
            label: "Registrar diagnostico",
            description: "Envia a OS para aguardando aprovacao com o diagnostico registrado.",
            kind: "status",
            targetStatus: "WAITING_APPROVAL",
            tone: "warning"
          }
        ];
      case "WAITING_APPROVAL":
        if (hasPendingQuote) {
          return [
            {
              id: "approve-quote",
              label: "Aprovar",
              description: "Aprova o orcamento pendente e move a OS para aprovada.",
              kind: "quote-approve",
              tone: "success"
            },
            {
              id: "reject-quote",
              label: "Rejeitar",
              description: "Rejeita o orcamento pendente e encerra a OS como rejeitada.",
              kind: "quote-reject",
              tone: "danger"
            }
          ];
        }

        return [
          {
            id: "approve-order",
            label: "Aprovar",
            description: "Aprova esta OS e libera a execucao do servico.",
            kind: "status",
            targetStatus: "APPROVED",
            tone: "success"
          },
          {
            id: "reject-order",
            label: "Rejeitar",
            description: "Rejeita esta OS e encerra o fluxo operacional.",
            kind: "status",
            targetStatus: "REJECTED",
            tone: "danger"
          }
        ];
      case "APPROVED":
        return [
          {
            id: "start-service",
            label: "Iniciar servico",
            description: "Move a OS para em andamento.",
            kind: "status",
            targetStatus: "IN_PROGRESS",
            tone: "primary"
          }
        ];
      case "IN_PROGRESS":
        return [
          {
            id: "waiting-parts",
            label: "Aguardando peca",
            description: "Marca a OS como aguardando pecas para seguir com o reparo.",
            kind: "status",
            targetStatus: "WAITING_PARTS",
            tone: "warning"
          },
          {
            id: "ready-for-delivery",
            label: "Pronto para entrega",
            description: "Encerra a execucao tecnica e deixa a OS pronta para entrega.",
            kind: "status",
            targetStatus: "READY_FOR_DELIVERY",
            tone: "primary",
            requiresTotalFinal: true
          }
        ];
      case "WAITING_PARTS":
        return [
          {
            id: "resume-service",
            label: "Retomar servico",
            description: "Retira a OS da espera e volta para em andamento.",
            kind: "status",
            targetStatus: "IN_PROGRESS",
            tone: "primary"
          }
        ];
      case "READY_FOR_DELIVERY":
        return [
          {
            id: "register-delivery",
            label: "Registrar entrega",
            description: "Confirma a entrega do aparelho ao cliente e conclui a OS.",
            kind: "status",
            targetStatus: "DELIVERED",
            tone: "success",
            requiresTotalFinal: true
          }
        ];
      case "DELIVERED":
      case "CANCELED":
      case "REJECTED":
      default:
        return [];
    }
  }, [hasPendingQuote, order?.status]);

  useEffect(() => {
    if (!receiptMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!receiptMenuRef.current?.contains(event.target as Node)) {
        setReceiptMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReceiptMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [receiptMenuOpen]);

  function resetActionDialog() {
    setPendingAction(null);
    setStatusNotes("");
    setStatusTotalFinal(getDefaultActionTotal(order));
  }

  function openActionDialog(action: ContextualAction) {
    setFeedback(null);
    setPendingAction(action);
    setStatusNotes("");
    setStatusTotalFinal(getDefaultActionTotal(order));
  }

  const updateMutation = useMutation({
    mutationFn: async (values: EditValues) =>
      updateServiceOrder(session.accessToken, id, {
        customerId: values.customerId,
        assignedToUserId: values.assignedToUserId || undefined,
        relatedSaleId: values.relatedSaleId || undefined,
        deviceType: values.deviceType,
        brand: values.brand,
        model: values.model,
        imei: emptyToUndefined(values.imei),
        imei2: emptyToUndefined(values.imei2),
        serialNumber: emptyToUndefined(values.serialNumber),
        color: emptyToUndefined(values.color),
        accessories: emptyToUndefined(values.accessories),
        reportedIssue: values.reportedIssue,
        foundIssue: emptyToUndefined(values.foundIssue),
        technicalNotes: emptyToUndefined(values.technicalNotes),
        estimatedCompletionDate: emptyToUndefined(values.estimatedCompletionDate),
        totalFinal: values.totalFinal?.trim() ? parseCurrencyToCents(values.totalFinal) : undefined,
        items: values.items.map((item) => ({
          itemType: item.itemType,
          productId: item.productId || undefined,
          productUnitId: item.productUnitId || undefined,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: parseCurrencyToCents(item.unitPrice)
        }))
      }),
    onSuccess: async () => {
      setEditing(false);
      success("OS atualizada com sucesso.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: {
      status: ServiceOrderStatusName;
      notes?: string;
      totalFinal?: string;
    }) =>
      changeServiceOrderStatus(session.accessToken, id, {
        status: payload.status,
        notes: emptyToUndefined(payload.notes),
        totalFinal: payload.totalFinal?.trim()
          ? parseCurrencyToCents(payload.totalFinal)
          : undefined
      }),
    onSuccess: async () => {
      success("Status da OS atualizado.");
      resetActionDialog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const consumeMutation = useMutation({
    mutationFn: async (payload: { itemId: string; locationId?: string }) =>
      consumeServiceOrderItem(session.accessToken, id, payload.itemId, {
        locationId: payload.locationId
      }),
    onSuccess: async () => {
      success("Consumo de peca registrado no estoque.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "units"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const approveQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) =>
      approveServiceOrderQuote(session.accessToken, id, quoteId),
    onSuccess: async () => {
      resetActionDialog();
      success("Orcamento aprovado e OS atualizada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id, "quotes"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const rejectQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) =>
      rejectServiceOrderQuote(session.accessToken, id, quoteId),
    onSuccess: async () => {
      resetActionDialog();
      success("Orcamento rejeitado e OS encerrada como rejeitada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id, "quotes"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploadProgress(0);

      return uploadServiceOrderAttachment(
        session.accessToken,
        id,
        file,
        (progress) => setUploadProgress(progress)
      );
    },
    onSuccess: (attachment) => {
      queryClient.setQueryData<ServiceOrderAttachment[]>(
        ["service-orders", id, "attachments"],
        (current) => [attachment, ...(current ?? [])]
      );
      success("Anexo enviado com sucesso.");
    },
    onError: (error: Error) => {
      toastError(parseApiError(error));
    },
    onSettled: () => {
      setUploadProgress(null);
      setDragActive(false);
    }
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachment: ServiceOrderAttachment) => {
      const confirmed = window.confirm(
        `Deseja remover o anexo ${attachment.fileName}?`
      );

      if (!confirmed) {
        return { success: false, attachment };
      }

      await deleteServiceOrderAttachment(session.accessToken, id, attachment.id);
      return { success: true, attachment };
    },
    onSuccess: ({ success: didDelete, attachment }) => {
      if (!didDelete) {
        return;
      }

      queryClient.setQueryData<ServiceOrderAttachment[]>(
        ["service-orders", id, "attachments"],
        (current) => current?.filter((entry) => entry.id !== attachment.id) ?? []
      );

      if (previewAttachment?.id === attachment.id) {
        setPreviewAttachment(null);
      }

      success("Anexo removido.");
    },
    onError: (error: Error) => {
      toastError(parseApiError(error));
    }
  });

  const handleAttachmentSelection = (file: File | null | undefined) => {
    if (!file) {
      return;
    }

    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
      ].includes(file.type)
    ) {
      setFeedback({
        tone: "error",
        text: "Envie um anexo valido em JPG, PNG, WEBP ou PDF."
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFeedback({
        tone: "error",
        text: "O anexo deve ter no maximo 10 MB."
      });
      return;
    }

    setFeedback(null);
    uploadAttachmentMutation.mutate(file);
  };

  async function handleOpenReceipt(format: ServiceOrderReceiptFormat) {
    try {
      setReceiptPrintPending(true);
      setReceiptMenuOpen(false);
      setFeedback(null);
      await openServiceOrderReceiptWindow(session.accessToken, id, format);
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          parseApiError(error) || "Nao foi possivel abrir o comprovante da OS."
      });
    } finally {
      setReceiptPrintPending(false);
    }
  }

  async function handleConfirmAction() {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.kind === "status") {
      statusMutation.mutate({
        status: pendingAction.targetStatus!,
        notes: statusNotes,
        totalFinal: pendingAction.requiresTotalFinal ? statusTotalFinal : undefined
      });
      return;
    }

    if (!latestQuote) {
      setFeedback({
        tone: "error",
        text: "Nenhum orcamento pendente foi encontrado para esta OS."
      });
      return;
    }

    if (pendingAction.kind === "quote-approve") {
      approveQuoteMutation.mutate(latestQuote.id);
      return;
    }

    rejectQuoteMutation.mutate(latestQuote.id);
  }

  if (orderQuery.isLoading) {
    return <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">Carregando ordem de servico...</div>;
  }

  if (orderQuery.error || !order) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {(orderQuery.error as Error)?.message ?? "Ordem de servico nao encontrada."}
      </div>
    );
  }

  const actionDialogBusy =
    statusMutation.isPending || approveQuoteMutation.isPending || rejectQuoteMutation.isPending;
  const tabs = [
    {
      id: "operation",
      label: "Operacao",
      content: (
        <div className="space-y-6 p-6">
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">Itens e consumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item) => {
                const requiresLocation =
                  item.itemType === "PART" && !item.product?.hasSerialControl;

                return (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold">
                          {formatServiceOrderItemType(item.itemType)} • {item.description}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {item.product?.name ?? "Sem produto"} • {item.quantity} x{" "}
                          {formatCurrency(item.unitPrice)}
                        </p>
                        {item.productUnit ? (
                          <p className="text-sm text-muted-foreground">
                            Unidade:{" "}
                            {item.productUnit.imei ??
                              item.productUnit.serialNumber ??
                              item.productUnit.id}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                          {item.stockConsumed ? "Estoque consumido" : "Sem consumo"}
                        </span>
                        {hasPermission("service-orders.update") &&
                        item.itemType === "PART" &&
                        !item.stockConsumed ? (
                          <>
                            {requiresLocation ? (
                              <select
                                className={advancedSelectClassName}
                                onChange={(event) =>
                                  setConsumeLocationByItem((current) => ({
                                    ...current,
                                    [item.id]: event.target.value
                                  }))
                                }
                                value={consumeLocationByItem[item.id] ?? ""}
                              >
                                <option value="">Selecione o local</option>
                                {(locationsQuery.data ?? []).map((location) => (
                                  <option key={location.id} value={location.id}>
                                    {location.name}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <Button
                              onClick={() =>
                                consumeMutation.mutate({
                                  itemId: item.id,
                                  locationId: requiresLocation
                                    ? consumeLocationByItem[item.id]
                                    : undefined
                                })
                              }
                              type="button"
                              variant="outline"
                            >
                              <PackageCheck className="mr-2 h-4 w-4" />
                              Consumir peca
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )
    },
    {
      id: "quote",
      label: "Orcamento",
      badge: latestQuote ? <QuoteStatusBadge status={latestQuote.status} /> : null,
      content: (
        <div className="p-6">
          <ServiceOrderQuoteTab
            canUpdate={hasPermission("service-orders.update")}
            createHref={`/service-orders/${id}/quotes/new`}
            orderId={id}
            quote={latestQuote}
            quotesErrorMessage={(quotesQuery.error as Error | undefined)?.message ?? null}
            quotesLoading={quotesQuery.isLoading}
          />
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/service-orders"
        subtitle={`${order.customer.name} • ${order.deviceType} ${order.brand} ${order.model}`}
        title={order.orderNumber}
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="relative" ref={receiptMenuRef}>
              <Button
                aria-expanded={receiptMenuOpen}
                aria-haspopup="menu"
                disabled={receiptPrintPending}
                onClick={() => setReceiptMenuOpen((current) => !current)}
                type="button"
                variant="outline"
              >
                <Printer className="mr-2 h-4 w-4" />
                {receiptPrintPending ? "Abrindo..." : "Imprimir OS"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>

              {receiptMenuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-48 rounded-[1.25rem] border border-border/70 bg-white p-2 shadow-xl">
                  <button
                    className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    onClick={() => void handleOpenReceipt("a4")}
                    type="button"
                  >
                    Imprimir (A4)
                  </button>
                  <button
                    className="mt-1 flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    onClick={() => void handleOpenReceipt("thermal")}
                    type="button"
                  >
                    Imprimir (Termica)
                  </button>
                </div>
              ) : null}
            </div>
            {hasPermission("accounts-receivable.create") ? (
              <Button asChild type="button" variant="outline">
                <Link to={`/accounts-receivable?serviceOrderId=${order.id}`}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Gerar contas a receber
                </Link>
              </Button>
            ) : null}
            {hasPermission("service-orders.update") ? (
              <Button onClick={() => setEditing((current) => !current)} type="button" variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                {editing ? "Cancelar edicao" : "Editar"}
              </Button>
            ) : null}
          </div>
        }
      />

      <AdvancedFeedback feedback={feedback} />

      <ServiceOrderProgressCard order={order} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_340px]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              icon={<BadgeCheck className="h-5 w-5" />}
              label="Total previsto"
              value={formatCurrency(order.totalFinal ?? order.totalEstimated)}
            />
            <StatCard
              icon={<PackageCheck className="h-5 w-5" />}
              label="Itens vinculados"
              value={String(order.items.length)}
            />
            <StatCard
              icon={<RefreshCw className="h-5 w-5" />}
              label="Atualizada em"
              value={formatDateTime(order.updatedAt)}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DetailCard title="Dados do aparelho">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Tipo" value={order.deviceType} />
                <DetailField label="Marca" value={order.brand} />
                <DetailField label="Modelo" value={order.model} />
                <DetailField label="Cor" value={order.color} />
                <DetailField label="IMEI" value={order.imei} />
                <DetailField label="IMEI 2" value={order.imei2} />
                <DetailField label="Serial" value={order.serialNumber} />
                <DetailField label="Acessorios entregues" value={order.accessories} />
              </div>
            </DetailCard>

            <DetailCard title="Cliente e atendimento">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="Cliente" value={order.customer.name} />
                <DetailField label="Telefone" value={order.customer.phone} />
                <DetailField label="E-mail" value={order.customer.email} />
                <DetailField label="Responsavel" value={order.assignedToUser?.name} />
                <DetailField label="Venda relacionada" value={order.relatedSale?.saleNumber} />
                <DetailField
                  label="Data de entrada"
                  value={formatDateTime(order.createdAt)}
                />
                <DetailField
                  label="Prazo estimado"
                  value={
                    order.estimatedCompletionDate
                      ? formatDateTime(order.estimatedCompletionDate)
                      : null
                  }
                />
                <DetailField
                  label="Entrega"
                  value={order.deliveredAt ? formatDateTime(order.deliveredAt) : null}
                />
              </div>
            </DetailCard>
          </div>

          <DetailCard title="Problema e diagnostico">
            <div className="grid gap-4 lg:grid-cols-3">
              <DetailParagraph
                label="Problema relatado"
                value={order.reportedIssue}
              />
              <DetailParagraph
                label="Defeito constatado"
                value={order.foundIssue}
              />
              <DetailParagraph
                label="Observacoes tecnicas"
                value={order.technicalNotes}
              />
            </div>
          </DetailCard>

          {previewAttachment && previewAttachment.fileType.startsWith("image/") ? (
            <Dialog onOpenChange={(open) => !open && setPreviewAttachment(null)} open>
              <DialogContent className="max-w-[960px] overflow-hidden border-white/10 bg-slate-950 p-0">
                <img
                  alt={`Anexo ${previewAttachment.fileName}`}
                  className="max-h-[80vh] w-full object-contain"
                  src={resolveApiAssetUrl(previewAttachment.url) ?? previewAttachment.url}
                />
              </DialogContent>
            </Dialog>
          ) : null}

          <Card className="bg-white/90">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl">Fotos e anexos</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registre evidencias visuais, laudos em PDF e documentos vinculados a esta OS.
                </p>
              </div>

              {hasPermission("service-orders.update") ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      handleAttachmentSelection(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                    ref={attachmentInputRef}
                    type="file"
                  />
                  <Button
                    disabled={uploadAttachmentMutation.isPending}
                    onClick={() => attachmentInputRef.current?.click()}
                    type="button"
                  >
                    {uploadAttachmentMutation.isPending
                      ? `Enviando${uploadProgress !== null ? ` ${uploadProgress}%` : "..."}`
                      : "Adicionar foto/anexo"}
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-6">
              {hasPermission("service-orders.update") ? (
                <button
                  className={`flex min-h-28 w-full flex-col items-center justify-center rounded-[1.5rem] border border-dashed px-4 py-6 text-center transition-colors ${
                    dragActive ? "border-primary bg-primary/5" : "border-border/70 bg-secondary/20"
                  }`}
                  onClick={() => attachmentInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    const nextTarget = event.relatedTarget as Node | null;

                    if (!event.currentTarget.contains(nextTarget)) {
                      setDragActive(false);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                    handleAttachmentSelection(event.dataTransfer.files?.[0]);
                  }}
                  type="button"
                >
                  <p className="text-sm font-semibold">
                    Arraste uma foto ou PDF aqui
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tipos aceitos: JPG, PNG, WEBP e PDF, com limite de 10 MB por arquivo.
                  </p>
                  {uploadProgress !== null ? (
                    <div className="mt-4 w-full max-w-sm">
                      <div className="h-2 rounded-full bg-secondary">
                        <div
                          className="h-2 rounded-full bg-primary transition-[width]"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Upload em progresso: {uploadProgress}%
                      </p>
                    </div>
                  ) : null}
                </button>
              ) : null}

              {attachmentsQuery.isLoading ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
                  Carregando anexos...
                </div>
              ) : attachmentsQuery.error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                  {(attachmentsQuery.error as Error).message}
                </div>
              ) : !attachments.length ? (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum anexo registrado nesta OS.
                </div>
              ) : (
                <>
                  {imageAttachments.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {imageAttachments.map((attachment) => {
                        const imageUrl =
                          resolveApiAssetUrl(attachment.url) ?? attachment.url;

                        return (
                          <div
                            className="group relative overflow-hidden rounded-[1.5rem] border border-border/70 bg-secondary/20"
                            key={attachment.id}
                            title={buildAttachmentTooltip(attachment)}
                          >
                            <button
                              className="block w-full text-left"
                              onClick={() => setPreviewAttachment(attachment)}
                              type="button"
                            >
                              <img
                                alt={attachment.fileName}
                                className="aspect-square w-full object-cover"
                                src={imageUrl}
                              />
                              <div className="border-t border-border/60 px-3 py-2">
                                <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                              </div>
                            </button>

                            {hasPermission("service-orders.update") ? (
                              <button
                                aria-label={`Remover ${attachment.fileName}`}
                                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950/70 text-white opacity-0 transition-opacity hover:bg-slate-950 group-hover:opacity-100"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteAttachmentMutation.mutate(attachment);
                                }}
                                type="button"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {pdfAttachments.length ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">Documentos PDF</p>
                      {pdfAttachments.map((attachment) => {
                        const fileUrl =
                          resolveApiAssetUrl(attachment.url) ?? attachment.url;

                        return (
                          <div
                            className="flex flex-col gap-3 rounded-[1.5rem] border border-border/70 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                            key={attachment.id}
                            title={buildAttachmentTooltip(attachment)}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 shrink-0 text-red-500" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{attachment.fileName}</p>
                                  <p className="text-xs text-muted-foreground">
                                    PDF • enviado em {formatDateTime(attachment.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button asChild type="button" variant="outline">
                                <a
                                  download={attachment.fileName}
                                  href={fileUrl}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Baixar
                                </a>
                              </Button>
                              {hasPermission("service-orders.update") ? (
                                <Button
                                  disabled={deleteAttachmentMutation.isPending}
                                  onClick={() => deleteAttachmentMutation.mutate(attachment)}
                                  type="button"
                                  variant="outline"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remover
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {editing ? (
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((values) => {
                setFeedback(null);
                updateMutation.mutate(values);
              })}
            >
              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle className="text-xl">Editar cabecalho e itens</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-2">
                  <SelectField
                    label="Cliente"
                    options={[
                      { label: "Selecione", value: "" },
                      ...(customersQuery.data ?? []).map((customer) => ({
                        label: customer.name,
                        value: customer.id
                      }))
                    ]}
                    value={form.watch("customerId")}
                    onChange={(value) => form.setValue("customerId", value, { shouldValidate: true })}
                  />
                  <SelectField
                    label="Responsavel"
                    options={[
                      { label: "Nao atribuido", value: "" },
                      ...(usersQuery.data ?? []).map((user) => ({
                        label: user.name,
                        value: user.id
                      }))
                    ]}
                    value={form.watch("assignedToUserId") ?? ""}
                    onChange={(value) => form.setValue("assignedToUserId", value)}
                  />
                  <SelectField
                    label="Venda relacionada"
                    options={[
                      { label: "Sem venda relacionada", value: "" },
                      ...(salesQuery.data ?? []).map((sale) => ({
                        label: `${sale.saleNumber} • ${sale.customer?.name ?? "Consumidor final"}`,
                        value: sale.id
                      }))
                    ]}
                    value={form.watch("relatedSaleId") ?? ""}
                    onChange={(value) => form.setValue("relatedSaleId", value)}
                  />
                  <Field id="service-order-edit-eta" label="Previsao" registration={form.register("estimatedCompletionDate")} type="date" />
                  <Field id="service-order-edit-device" label="Tipo do aparelho" registration={form.register("deviceType")} />
                  <Field id="service-order-edit-brand" label="Marca" registration={form.register("brand")} />
                  <Field id="service-order-edit-model" label="Modelo" registration={form.register("model")} />
                  <Field id="service-order-edit-color" label="Cor" registration={form.register("color")} />
                  <Field id="service-order-edit-imei" label="IMEI" registration={form.register("imei")} />
                  <Field id="service-order-edit-imei2" label="IMEI 2" registration={form.register("imei2")} />
                  <Field id="service-order-edit-serial" label="Serial" registration={form.register("serialNumber")} />
                  <Field id="service-order-edit-total" label="Valor final (R$)" registration={form.register("totalFinal")} type="number" />
                  <TextAreaField id="service-order-edit-accessories" label="Acessorios" registration={form.register("accessories")} />
                  <TextAreaField id="service-order-edit-reported" label="Defeito relatado" registration={form.register("reportedIssue")} />
                  <TextAreaField id="service-order-edit-found" label="Defeito constatado" registration={form.register("foundIssue")} />
                  <TextAreaField id="service-order-edit-tech" label="Observacoes tecnicas" registration={form.register("technicalNotes")} />
                </CardContent>
              </Card>

              <Card className="bg-white/90">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-xl">Itens editaveis</CardTitle>
                  <Button
                    onClick={() =>
                      fieldArray.append({
                        itemType: "SERVICE",
                        productId: "",
                        productUnitId: "",
                        description: "",
                        quantity: "1",
                        unitPrice: "0.00"
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Adicionar item
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {fieldArray.fields.map((field, index) => {
                    const currentItem = watchItems[index];
                    const productOptions =
                      currentItem?.itemType === "PART" ? partProducts : serviceProducts;
                    const unitOptions = inventoryUnits.filter(
                      (unit) => unit.product.id === currentItem?.productId
                    );

                    return (
                      <div
                        key={field.id}
                        className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <p className="font-semibold">
                            Item {index + 1} • {formatServiceOrderItemType(currentItem.itemType)}
                          </p>
                          <Button onClick={() => fieldArray.remove(index)} type="button" variant="ghost">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover
                          </Button>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                          <SelectField
                            label="Tipo"
                            options={[
                              { label: "Peca", value: "PART" },
                              { label: "Servico", value: "SERVICE" },
                              { label: "Item manual", value: "MANUAL_ITEM" }
                            ]}
                            value={currentItem.itemType}
                            onChange={(value) => {
                              form.setValue(`items.${index}.itemType`, value as EditValues["items"][number]["itemType"]);
                              form.setValue(`items.${index}.productId`, "");
                              form.setValue(`items.${index}.productUnitId`, "");
                            }}
                          />
                          <SelectField
                            label="Produto vinculado"
                            options={[
                              {
                                label: currentItem.itemType === "MANUAL_ITEM" ? "Nao se aplica" : "Selecione",
                                value: ""
                              },
                              ...productOptions.map((product) => ({
                                label: `${product.internalCode} • ${product.name}`,
                                value: product.id
                              }))
                            ]}
                            value={currentItem.productId ?? ""}
                            onChange={(value) => form.setValue(`items.${index}.productId`, value)}
                          />
                          {currentItem.itemType === "PART" ? (
                            <SelectField
                              label="Unidade serializada"
                              options={[
                                { label: "Sem unidade especifica", value: "" },
                                ...unitOptions.map((unit) => ({
                                  label: `${unit.imei ?? unit.serialNumber ?? unit.id} • ${unit.currentLocation?.name ?? "Sem local"}`,
                                  value: unit.id
                                }))
                              ]}
                              value={currentItem.productUnitId ?? ""}
                              onChange={(value) => form.setValue(`items.${index}.productUnitId`, value)}
                            />
                          ) : null}
                          <Field id={`service-order-edit-qty-${index}`} label="Quantidade" registration={form.register(`items.${index}.quantity`)} type="number" />
                          <Field id={`service-order-edit-price-${index}`} label="Valor unitario (R$)" registration={form.register(`items.${index}.unitPrice`)} type="number" />
                          <TextAreaField id={`service-order-edit-description-${index}`} label="Descricao" registration={form.register(`items.${index}.description`)} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <LoadingButton isLoading={updateMutation.isPending} loadingText="Salvando..." type="submit">
                  <Save className="mr-2 h-4 w-4" />
                  Salvar alteracoes
                </LoadingButton>
              </div>
            </form>
          ) : null}

          <DetailTabs
            activeTabId={selectedTab}
            defaultTabId="operation"
            onActiveTabIdChange={(tabId) => {
              const nextParams = new URLSearchParams(searchParams);

              if (tabId === "quote") {
                nextParams.set("tab", "quote");
              } else {
                nextParams.delete("tab");
              }

              setSearchParams(nextParams, { replace: true });
            }}
            tabs={tabs}
          />
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <ServiceOrderContextualActionCard
            canUpdate={hasPermission("service-orders.update")}
            currentStatus={order.status}
            hasPendingQuote={hasPendingQuote}
            onActionClick={openActionDialog}
            onPrint={() => void handleOpenReceipt("a4")}
            pending={actionDialogBusy || receiptPrintPending}
            actions={contextualActions}
          />
          <ServiceOrderStatusTimeline entries={order.statusHistory} />
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && resetActionDialog()} open={Boolean(pendingAction)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{pendingAction?.label ?? "Confirmar acao"}</DialogTitle>
            <DialogDescription>
              {pendingAction?.description ??
                "Confirme a proxima acao desta ordem de servico."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
              {order.orderNumber} • {order.customer.name} • {formatServiceOrderStatus(order.status)}
            </div>

            {pendingAction?.kind === "status" ? (
              <>
                {pendingAction.requiresTotalFinal ? (
                  <FieldControlled
                    id="service-order-action-total"
                    label="Valor final (R$)"
                    onChange={setStatusTotalFinal}
                    type="number"
                    value={statusTotalFinal}
                  />
                ) : null}
                <TextAreaControlled
                  id="service-order-action-notes"
                  label="Notas da mudanca (opcional)"
                  onChange={setStatusNotes}
                  value={statusNotes}
                />
              </>
            ) : latestQuote ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Orcamento pendente em {formatCurrency(latestQuote.total)}. A confirmacao usa o fluxo
                de orcamento ja existente.
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => resetActionDialog()} type="button" variant="outline">
              Cancelar
            </Button>
            <LoadingButton
              className={getActionButtonClassName(pendingAction?.tone)}
              disabled={false}
              isLoading={actionDialogBusy}
              loadingText="Processando..."
              onClick={() => void handleConfirmAction()}
              type="button"
            >
              {pendingAction?.label ?? "Confirmar"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceOrderQuoteTab({
  orderId,
  quote,
  quotesLoading,
  quotesErrorMessage,
  canUpdate,
  createHref
}: {
  orderId: string;
  quote: ServiceOrderQuote | null;
  quotesLoading: boolean;
  quotesErrorMessage: string | null;
  canUpdate: boolean;
  createHref: string;
}) {
  if (quotesLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">
        Carregando orcamento...
      </div>
    );
  }

  if (quotesErrorMessage) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {quotesErrorMessage}
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-border/70 px-6 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <FileText className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">Nenhum orcamento criado</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Monte o orcamento comercial antes de aprovar ou rejeitar esta OS.
        </p>
        {canUpdate ? (
          <div className="mt-5">
            <Button asChild type="button">
              <Link to={createHref}>
                <Pencil className="mr-2 h-4 w-4" />
                Criar orcamento
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">Orcamento da OS</h3>
            <QuoteStatusBadge status={quote.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Criado em {formatDateTime(quote.createdAt)} • atualizado em{" "}
            {formatDateTime(quote.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {quote.status === "PENDING" && canUpdate ? (
            <Button asChild type="button" variant="outline">
              <Link to={`/service-orders/${orderId}/quotes/${quote.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar orcamento
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Subtotal" value={formatCurrency(quote.subtotal)} />
        <StatCard label="Desconto" value={formatCurrency(quote.discountAmount)} />
        <StatCard label="Total" value={formatCurrency(quote.total)} />
      </div>

      <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-white/90">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Descricao</th>
                <th className="px-4 py-3 font-medium">Qtd</th>
                <th className="px-4 py-3 font-medium">Valor unit</th>
                <th className="px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr className="border-b border-border/60 align-top" key={item.id}>
                  <td className="px-4 py-4">{formatServiceOrderItemType(item.itemType)}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{item.description}</p>
                    {item.product ? (
                      <p className="text-xs text-muted-foreground">
                        {item.product.internalCode} • {item.product.name}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-4">{item.quantity}</td>
                  <td className="px-4 py-4">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-4">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {quote.notes ? (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Notas do orcamento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6">{quote.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {quote.status === "PENDING" ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          A decisao de aprovar ou rejeitar este orcamento fica concentrada no painel lateral de
          proximo passo.
        </div>
      ) : null}

      {quote.status === "APPROVED" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Orcamento aprovado
          </div>
          <p className="mt-1">
            O valor aprovado desta OS esta consolidado em {formatCurrency(quote.total)}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function QuoteStatusBadge({ status }: { status: ServiceOrderQuoteStatusName }) {
  const tone =
    status === "APPROVED"
      ? "green"
      : status === "REJECTED"
        ? "slate"
        : "amber";

  return (
    <StatusBadge tone={tone}>
      {formatServiceOrderQuoteStatus(status)}
    </StatusBadge>
  );
}

function ServiceOrderProgressCard({ order }: { order: ServiceOrder }) {
  const highlightedStatus = resolveHighlightedMainStatus(order);
  const highlightedIndex = mainFlowStatuses.indexOf(highlightedStatus);
  const lateralStatus = mainFlowStatuses.includes(order.status as (typeof mainFlowStatuses)[number])
    ? null
    : order.status;

  return (
    <DetailCard title="Fluxo da OS">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            A etapa atual fica destacada com a cor da loja. Passos concluidos aparecem com check
            verde e os proximos seguem em cinza.
          </p>
          {lateralStatus ? (
            <div className="flex flex-wrap items-center gap-2">
              <ServiceOrderStatusBadge status={order.status} />
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                fora do fluxo principal
              </span>
            </div>
          ) : (
            <ServiceOrderStatusBadge status={order.status} />
          )}
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          {mainFlowStatuses.map((status, index) => {
            const step = mainFlowStepMeta[status];
            const Icon = step.icon;
            const occurredAt = getStatusOccurrence(order, status);
            const isDone = index < highlightedIndex;
            const isActive = index === highlightedIndex;

            return (
              <div className="flex min-w-0 flex-1 items-start gap-3" key={status}>
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                    isDone
                      ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                      : isActive
                        ? "bg-white/10 text-[var(--color-primary)]"
                        : "border-white/10 bg-white/5 text-white/45"
                  }`}
                  style={isActive ? { boxShadow: "inset 0 0 0 1px var(--color-primary)" } : undefined}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>

                <div className="min-w-0">
                  <p
                    className="text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {step.shortLabel}
                  </p>
                  <p
                    className={`mt-1 text-sm font-semibold ${isActive || isDone ? "" : "opacity-70"}`}
                    style={{ color: "var(--color-text)" }}
                  >
                    {formatServiceOrderStatus(status)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {occurredAt ? formatDateTime(occurredAt) : "—"}
                  </p>
                </div>

                {index < mainFlowStatuses.length - 1 ? (
                  <div
                    className={`mt-5 hidden h-px flex-1 xl:block ${
                      index < highlightedIndex ? "bg-emerald-400/40" : "bg-white/10"
                    }`}
                    style={index === highlightedIndex ? { backgroundColor: "var(--color-primary)" } : undefined}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </DetailCard>
  );
}

function ServiceOrderContextualActionCard({
  currentStatus,
  hasPendingQuote,
  canUpdate,
  actions,
  pending,
  onActionClick,
  onPrint
}: {
  currentStatus: ServiceOrderStatusName;
  hasPendingQuote: boolean;
  canUpdate: boolean;
  actions: ContextualAction[];
  pending: boolean;
  onActionClick: (action: ContextualAction) => void;
  onPrint: () => void;
}) {
  const isTerminal = actions.length === 0;

  return (
    <DetailCard title="Proximo passo">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <ServiceOrderStatusBadge status={currentStatus} />
          {hasPendingQuote ? <QuoteStatusBadge status="PENDING" /> : null}
        </div>

        <p className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
          {isTerminal
            ? currentStatus === "REJECTED"
              ? "A OS foi rejeitada e nao possui novos avancos de status. A impressao continua disponivel."
              : "O fluxo desta OS foi encerrado. A impressao continua disponivel para registro."
            : hasPendingQuote && currentStatus === "WAITING_APPROVAL"
              ? "Esta OS depende da decisao do orcamento pendente. A confirmacao abaixo mantem o fluxo atual de aprovacao e rejeicao."
              : "Exiba apenas a proxima acao operacional relevante para manter a tela limpa e objetiva."}
        </p>

        {!canUpdate ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Esta conta possui acesso de consulta. A alteracao de status segue disponivel apenas para quem pode atualizar OS.
          </div>
        ) : isTerminal ? (
          <Button
            className="w-full"
            disabled={pending}
            onClick={onPrint}
            size="lg"
            type="button"
            variant="outline"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimir OS
          </Button>
        ) : (
          <div className={`grid gap-3 ${actions.length > 1 ? "sm:grid-cols-2 xl:grid-cols-1" : ""}`}>
            {actions.map((action) => (
              <Button
                className={getActionButtonClassName(action.tone)}
                disabled={pending}
                key={action.id}
                onClick={() => onActionClick(action)}
                size="lg"
                type="button"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </DetailCard>
  );
}

function ServiceOrderStatusTimeline({
  entries
}: {
  entries: ServiceOrder["statusHistory"];
}) {
  return (
    <DetailCard title="Historico de status">
      <div className="relative space-y-5 pl-8 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-white/10 before:content-['']">
        {entries.map((entry) => (
          <div className="relative" key={entry.id}>
            <span
              className={`absolute -left-[29px] top-1.5 h-5 w-5 rounded-full border ${getTimelineDotClassName(entry.newStatus)}`}
            />

            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {formatDateTime(entry.createdAt)} • {entry.changedByUser?.name ?? "Sistema"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {entry.oldStatus ? <ServiceOrderStatusBadge status={entry.oldStatus} /> : null}
              <span style={{ color: "var(--color-text-muted)" }}>→</span>
              <ServiceOrderStatusBadge status={entry.newStatus} />
            </div>
            {entry.notes ? (
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text)" }}>
                {entry.notes}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </DetailCard>
  );
}

function DetailField({
  label,
  value
}: {
  label: string;
  value?: ReactNode | null;
}) {
  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <p
        className="text-[11px] uppercase tracking-[0.14em]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>
      <div className="mt-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {isEmpty ? (
          <span style={{ color: "var(--color-text-muted)" }}>—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function DetailParagraph({
  label,
  value
}: {
  label: string;
  value?: string | null;
}) {
  const content = value?.trim();

  return (
    <div className="rounded-[10px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <p
        className="text-[11px] uppercase tracking-[0.14em]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>
      <p className="mt-3 text-sm leading-6" style={{ color: content ? "var(--color-text)" : "var(--color-text-muted)" }}>
        {content || "—"}
      </p>
    </div>
  );
}

function resolveHighlightedMainStatus(order: ServiceOrder): (typeof mainFlowStatuses)[number] {
  if (mainFlowStatuses.includes(order.status as (typeof mainFlowStatuses)[number])) {
    return order.status as (typeof mainFlowStatuses)[number];
  }

  if (order.status === "WAITING_PARTS") {
    return "IN_PROGRESS";
  }

  for (let index = order.statusHistory.length - 1; index >= 0; index -= 1) {
    const entry = order.statusHistory[index];

    if (mainFlowStatuses.includes(entry.oldStatus as (typeof mainFlowStatuses)[number])) {
      return entry.oldStatus as (typeof mainFlowStatuses)[number];
    }

    if (mainFlowStatuses.includes(entry.newStatus as (typeof mainFlowStatuses)[number])) {
      return entry.newStatus as (typeof mainFlowStatuses)[number];
    }
  }

  return "OPEN";
}

function getStatusOccurrence(
  order: ServiceOrder,
  status: (typeof mainFlowStatuses)[number]
) {
  for (let index = order.statusHistory.length - 1; index >= 0; index -= 1) {
    if (order.statusHistory[index].newStatus === status) {
      return order.statusHistory[index].createdAt;
    }
  }

  if (status === "OPEN") {
    return order.createdAt;
  }

  if (status === "APPROVED") {
    return order.approvedAt;
  }

  if (status === "DELIVERED") {
    return order.deliveredAt;
  }

  return null;
}

function getActionButtonClassName(tone?: ContextualAction["tone"]) {
  switch (tone) {
    case "success":
      return "w-full bg-emerald-600 text-white hover:bg-emerald-500";
    case "warning":
      return "w-full bg-amber-500 text-white hover:bg-amber-400";
    case "danger":
      return "w-full bg-rose-600 text-white hover:bg-rose-500";
    case "primary":
    default:
      return "w-full";
  }
}

function getTimelineDotClassName(status: ServiceOrderStatusName) {
  switch (status) {
    case "DELIVERED":
      return "border-emerald-400/40 bg-emerald-500/20";
    case "REJECTED":
    case "CANCELED":
      return "border-slate-300/30 bg-slate-300/10";
    case "READY_FOR_DELIVERY":
      return "border-sky-400/40 bg-sky-500/20";
    case "WAITING_PARTS":
      return "border-amber-400/40 bg-amber-500/20";
    case "APPROVED":
    case "IN_PROGRESS":
      return "border-white/20 bg-white/10";
    case "OPEN":
    case "WAITING_APPROVAL":
    default:
      return "border-orange-300/40 bg-orange-400/15";
  }
}

function Field({
  id,
  label,
  registration,
  type = "text"
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} {...registration} />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  registration
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea className={advancedTextareaClassName} id={id} {...registration} />
    </div>
  );
}

function FieldControlled({
  id,
  label,
  value,
  onChange,
  type = "text"
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </div>
  );
}

function TextAreaControlled({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        className={advancedTextareaClassName}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className={advancedSelectClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatServiceOrderQuoteStatus(status: ServiceOrderQuoteStatusName) {
  switch (status) {
    case "APPROVED":
      return "Aprovado";
    case "REJECTED":
      return "Rejeitado";
    case "PENDING":
    default:
      return "Pendente";
  }
}

function buildAttachmentTooltip(attachment: ServiceOrderAttachment) {
  return `${attachment.fileName}\n${attachment.fileType} • ${formatDateTime(attachment.createdAt)}`;
}
