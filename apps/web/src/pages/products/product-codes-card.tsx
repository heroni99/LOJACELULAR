import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createProductCode,
  deleteProductCode,
  type ProductCode,
  type ProductCodeEditorType,
  updateProductCode
} from "@/lib/api";
import { queryClient } from "@/lib/query-client";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const productCodeTypeOptions: Array<{
  label: string;
  value: ProductCodeEditorType;
}> = [
  { label: "Barcode da loja (Code 128)", value: "INTERNAL_BARCODE" },
  { label: "Codigo de fabricante", value: "MANUFACTURER_BARCODE" },
  { label: "EAN-13", value: "EAN13" },
  { label: "Code 128", value: "CODE128" }
];

type ProductCodeDraft = {
  code: string;
  codeType: ProductCodeEditorType;
  isPrimary: boolean;
};

export function ProductCodesCard({
  productId,
  codes,
  isService
}: {
  productId: string;
  codes: ProductCode[];
  isService: boolean;
}) {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<ProductCodeDraft>({
    code: "",
    codeType: "EAN13",
    isPrimary: codes.length === 0
  });
  const [drafts, setDrafts] = useState<Record<string, ProductCodeDraft>>({});

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        codes.map((code) => [
          code.id,
          {
            code: code.code,
            codeType: code.codeType as ProductCodeEditorType,
            isPrimary: code.isPrimary
          }
        ])
      )
    );
    setCreateDraft((current) => ({
      ...current,
      isPrimary: codes.length === 0 ? true : current.isPrimary
    }));
  }, [codes]);

  const invalidateProductQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products", "detail", productId] }),
      queryClient.invalidateQueries({ queryKey: ["products"] })
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (draft: ProductCodeDraft) =>
      createProductCode(token, productId, {
        code: draft.code.trim(),
        codeType: draft.codeType,
        isPrimary: draft.isPrimary
      }),
    onSuccess: async () => {
      setFeedback({
        tone: "success",
        message: "Codigo alternativo criado e persistido no catalogo."
      });
      setCreateDraft({
        code: "",
        codeType: "EAN13",
        isPrimary: false
      });
      await invalidateProductQueries();
    },
    onError: (error: Error) => {
      setFeedback({
        tone: "error",
        message: error.message
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ codeId, draft }: { codeId: string; draft: ProductCodeDraft }) =>
      updateProductCode(token, productId, codeId, {
        code: draft.code.trim(),
        codeType: draft.codeType,
        isPrimary: draft.isPrimary
      }),
    onSuccess: async () => {
      setFeedback({
        tone: "success",
        message: "Codigo alternativo atualizado com sucesso."
      });
      await invalidateProductQueries();
    },
    onError: (error: Error) => {
      setFeedback({
        tone: "error",
        message: error.message
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (codeId: string) => deleteProductCode(token, productId, codeId),
    onSuccess: async () => {
      setFeedback({
        tone: "success",
        message: "Codigo alternativo removido do catalogo."
      });
      await invalidateProductQueries();
    },
    onError: (error: Error) => {
      setFeedback({
        tone: "error",
        message: error.message
      });
    }
  });

  const isBusy =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardTitle className="text-xl">Codigos alternativos</CardTitle>
        <CardDescription>
          {isService
            ? "Codigos auxiliares para localizar servicos sem depender do nome textual."
            : "Codigos de fabricante, EAN ou etiquetas internas para busca real no catalogo."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {feedback ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              feedback.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="grid gap-3 rounded-3xl border border-primary/15 bg-primary/5 p-4 xl:grid-cols-[minmax(0,1fr)_220px_160px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="new-product-code">
              Novo codigo
            </label>
            <Input
              id="new-product-code"
              onChange={(event) => {
                setCreateDraft((current) => ({
                  ...current,
                  code: event.target.value
                }));
              }}
              placeholder="EAN, etiqueta ou codigo do fabricante"
              value={createDraft.code}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="new-product-code-type">
              Tipo
            </label>
            <select
              className={selectClassName}
              id="new-product-code-type"
              onChange={(event) => {
                setCreateDraft((current) => ({
                  ...current,
                  codeType: event.target.value as ProductCodeEditorType
                }));
              }}
              value={createDraft.codeType}
            >
              {productCodeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-end gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-sm font-medium">
            <input
              checked={createDraft.isPrimary}
              className="h-4 w-4 rounded border border-input text-primary"
              onChange={(event) => {
                setCreateDraft((current) => ({
                  ...current,
                  isPrimary: event.target.checked
                }));
              }}
              type="checkbox"
            />
            Marcar como principal
          </label>

          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={isBusy || createDraft.code.trim().length < 3}
              onClick={() => {
                setFeedback(null);
                createMutation.mutate(createDraft);
              }}
              type="button"
            >
              {createMutation.isPending ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Adicionar
            </Button>
          </div>
        </div>

        {!codes.length ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/70 px-4 py-5 text-sm text-muted-foreground">
            Nenhum codigo alternativo cadastrado ainda. O item continua localizado pelo
            internal code e pelo supplier code, quando informado.
          </div>
        ) : null}

        {codes.length ? (
          <div className="space-y-3">
            {codes.map((code) => {
              const draft = drafts[code.id];

              if (!draft) {
                return null;
              }

              return (
                <div
                  key={code.id}
                  className="grid gap-3 rounded-3xl border border-border/70 bg-card/80 p-4 xl:grid-cols-[minmax(0,1fr)_220px_160px_auto_auto]"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={`code-${code.id}`}>
                      Codigo
                    </label>
                    <Input
                      id={`code-${code.id}`}
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [code.id]: {
                            ...current[code.id],
                            code: event.target.value
                          }
                        }));
                      }}
                      value={draft.code}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor={`code-type-${code.id}`}>
                      Tipo
                    </label>
                    <select
                      className={selectClassName}
                      id={`code-type-${code.id}`}
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [code.id]: {
                            ...current[code.id],
                            codeType: event.target.value as ProductCodeEditorType
                          }
                        }));
                      }}
                      value={draft.codeType}
                    >
                      {productCodeTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-end gap-3 rounded-2xl border border-border/70 bg-white/70 px-4 py-3 text-sm font-medium">
                    <input
                      checked={draft.isPrimary}
                      className="h-4 w-4 rounded border border-input text-primary"
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [code.id]: {
                            ...current[code.id],
                            isPrimary: event.target.checked
                          }
                        }));
                      }}
                      type="checkbox"
                    />
                    Principal
                  </label>

                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      disabled={isBusy || draft.code.trim().length < 3}
                      onClick={() => {
                        setFeedback(null);
                        updateMutation.mutate({
                          codeId: code.id,
                          draft
                        });
                      }}
                      type="button"
                      variant="outline"
                    >
                      {updateMutation.isPending ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar
                    </Button>
                  </div>

                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      disabled={isBusy}
                      onClick={() => {
                        setFeedback(null);
                        deleteMutation.mutate(code.id);
                      }}
                      type="button"
                      variant="outline"
                    >
                      {deleteMutation.isPending ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Remover
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
