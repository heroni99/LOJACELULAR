import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link2, Smartphone, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createScannerSession,
  disconnectScannerSession,
  type PdvProductResult,
  type ScannerSessionState
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import {
  createScannerSocket,
  scannerSocketEvents,
  type ScannerProductFoundEvent,
  type ScannerProductNotFoundEvent,
  type ScannerSocket,
  type ScannerSocketErrorEvent
} from "@/lib/scanner-socket";

type PdvScannerPanelProps = {
  token: string | undefined | null;
  cashSessionId: string;
  stockLocationId: string;
  onFeedback(next: { tone: "success" | "error"; text: string } | null): void;
  onProductScanned(product: PdvProductResult, code: string): boolean;
};

type SessionSummaryState = {
  session: ScannerSessionState;
  desktopSocketToken: string | null;
  pairingToken: string | null;
};

type ScanEventState = {
  tone: "success" | "error";
  code: string;
  text: string;
};

export function PdvScannerPanel({
  token,
  cashSessionId,
  stockLocationId,
  onFeedback,
  onProductScanned
}: PdvScannerPanelProps) {
  const socketRef = useRef<ScannerSocket | null>(null);
  const stockLocationIdRef = useRef(stockLocationId);
  const onFeedbackRef = useRef(onFeedback);
  const onProductScannedRef = useRef(onProductScanned);
  const [sessionSummary, setSessionSummary] = useState<SessionSummaryState | null>(null);
  const [lastScan, setLastScan] = useState<ScanEventState | null>(null);

  useEffect(() => {
    stockLocationIdRef.current = stockLocationId;
    onFeedbackRef.current = onFeedback;
    onProductScannedRef.current = onProductScanned;
  }, [onFeedback, onProductScanned, stockLocationId]);

  const createMutation = useMutation({
    mutationFn: () => createScannerSession(token, { cashSessionId }),
    onSuccess: (result) => {
      setSessionSummary({
        session: result.session,
        pairingToken: result.pairingToken,
        desktopSocketToken: result.desktopSocketToken
      });
      setLastScan(null);
      onFeedback(null);
    },
    onError: (error) => {
      onFeedback({ tone: "error", text: parseApiError(error) });
    }
  });

  const disconnectMutation = useMutation({
    mutationFn: (sessionId: string) => disconnectScannerSession(token, sessionId),
    onSuccess: (nextSession) => {
      setSessionSummary((current) =>
        current
          ? {
              ...current,
              session: nextSession,
              desktopSocketToken: null,
              pairingToken: null
            }
          : {
              session: nextSession,
              desktopSocketToken: null,
              pairingToken: null
            }
      );
      setLastScan(null);
      onFeedback({ tone: "success", text: "Scanner desconectado." });
    },
    onError: (error) => {
      onFeedback({ tone: "error", text: parseApiError(error) });
    }
  });

  const pairingUrl = useMemo(() => {
    if (
      typeof window === "undefined" ||
      !sessionSummary?.session.id ||
      !sessionSummary.pairingToken
    ) {
      return null;
    }

    const url = new URL("/scanner", window.location.origin);
    url.searchParams.set("sid", sessionSummary.session.id);
    url.searchParams.set("token", sessionSummary.pairingToken);
    url.searchParams.set("code", sessionSummary.session.pairingCode);
    return url.toString();
  }, [sessionSummary]);

  useEffect(() => {
    const activeSessionId = sessionSummary?.session.id;
    const desktopSocketToken = sessionSummary?.desktopSocketToken;

    if (!activeSessionId || !desktopSocketToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = createScannerSocket();
    socketRef.current = socket;

    const pushDesktopContext = () => {
      socket.emit(scannerSocketEvents.desktopContextUpdate, {
        locationId: stockLocationIdRef.current || null
      });
    };

    const joinDesktop = () => {
      socket.emit(scannerSocketEvents.desktopJoin, {
        socketToken: desktopSocketToken
      });
      pushDesktopContext();
    };

    socket.on("connect", joinDesktop);
    socket.on("connect_error", (error) => {
      onFeedbackRef.current({
        tone: "error",
        text: error.message || "Falha ao conectar o scanner em tempo real."
      });
    });
    socket.on(scannerSocketEvents.sessionState, (nextSession: ScannerSessionState) => {
      setSessionSummary((current) =>
        current
          ? {
              ...current,
              session: nextSession,
              ...(nextSession.status === "CLOSED" || nextSession.status === "EXPIRED"
                ? {
                    desktopSocketToken: null,
                    pairingToken: null
                  }
                : {})
            }
          : null
      );
    });
    socket.on(scannerSocketEvents.productFound, (payload: ScannerProductFoundEvent) => {
      const added = onProductScannedRef.current(payload.product, payload.code);
      setLastScan({
        tone: "success",
        code: payload.code,
        text: added
          ? `${payload.product.name} entrou no carrinho.`
          : `${payload.product.name} localizado no PDV.`
      });
    });
    socket.on(
      scannerSocketEvents.productNotFound,
      (payload: ScannerProductNotFoundEvent) => {
        setLastScan({
          tone: "error",
          code: payload.code,
          text: payload.message
        });
        onFeedbackRef.current({ tone: "error", text: payload.message });
      }
    );
    socket.on(scannerSocketEvents.error, (payload: ScannerSocketErrorEvent) => {
      onFeedbackRef.current({ tone: "error", text: payload.message });
    });
    socket.on(scannerSocketEvents.sessionClosed, () => {
      setSessionSummary((current) =>
        current
          ? {
              ...current,
              desktopSocketToken: null,
              pairingToken: null
            }
          : null
      );
      setLastScan({
        tone: "error",
        code: "",
        text: "Sessao de scanner encerrada."
      });
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [sessionSummary?.desktopSocketToken, sessionSummary?.session.id]);

  useEffect(() => {
    if (!socketRef.current?.connected || !sessionSummary?.desktopSocketToken) {
      return;
    }

    socketRef.current.emit(scannerSocketEvents.desktopContextUpdate, {
      locationId: stockLocationId || null
    });
  }, [sessionSummary?.desktopSocketToken, stockLocationId]);

  const statusMeta = describeStatus(sessionSummary?.session ?? null);
  const isScannerActive = Boolean(sessionSummary?.desktopSocketToken);
  const sessionId = sessionSummary?.session.id ?? null;

  return (
    <Card className="bg-white/90">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Usar celular como leitor</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pareie o celular com o PDV para ler o barcode da etiqueta impressa e
              adicionar itens em tempo real.
            </p>
          </div>
          <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={createMutation.isPending || isScannerActive}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            <Smartphone className="mr-2 h-4 w-4" />
            {createMutation.isPending ? "Conectando..." : "Conectar celular"}
          </Button>
          <Button
            disabled={!sessionId || disconnectMutation.isPending}
            onClick={() => {
              if (sessionId) {
                disconnectMutation.mutate(sessionId);
              }
            }}
            type="button"
            variant="outline"
          >
            <Unplug className="mr-2 h-4 w-4" />
            Desconectar scanner
          </Button>
        </div>

        {sessionSummary?.session ? (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="rounded-3xl border border-border/70 bg-card/70 p-4">
              {pairingUrl ? (
                <div className="space-y-3">
                  <div className="flex justify-center rounded-2xl border border-border/70 bg-white p-3">
                    <QRCodeSVG size={180} value={pairingUrl} />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Abra a rota `/scanner` no celular ou aponte a camera para o QR.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/80 bg-secondary/30 p-4 text-sm text-muted-foreground">
                  Gere a sessao para exibir o QR de pareamento.
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ScannerInfo label="Codigo manual" value={sessionSummary.session.pairingCode} />
                <ScannerInfo
                  label="Terminal"
                  value={sessionSummary.session.cashTerminalName}
                />
                <ScannerInfo
                  label="Desktop"
                  value={sessionSummary.session.desktopConnected ? "Conectado" : "Aguardando"}
                />
                <ScannerInfo
                  label="Celular"
                  value={sessionSummary.session.scannerConnected ? "Conectado" : "Aguardando"}
                />
              </div>

              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                O celular abre a camera apenas depois do clique em `Iniciar leitura`.
                Use o barcode da etiqueta impressa no produto para lancar o item no
                carrinho do PDV.
              </div>

              {!window.isSecureContext ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  A camera do navegador costuma exigir HTTPS ou `localhost` para
                  funcionar corretamente no celular.
                </div>
              ) : null}

              {lastScan ? (
                <div
                  className={`rounded-2xl border p-4 text-sm ${
                    lastScan.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  <p className="font-semibold">
                    {lastScan.code ? `Leitura ${lastScan.code}` : "Scanner"}
                  </p>
                  <p className="mt-1">{lastScan.text}</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card/70 p-4 text-sm text-muted-foreground">
            Crie uma sessao para exibir o QR de pareamento e receber leituras do
            celular.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScannerInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function describeStatus(session: ScannerSessionState | null) {
  if (!session) {
    return {
      label: "Desconectado",
      tone: "slate" as const
    };
  }

  switch (session.status) {
    case "CONNECTED":
      return { label: "Conectado", tone: "green" as const };
    case "WAITING_SCANNER":
      return { label: "Aguardando celular", tone: "amber" as const };
    case "WAITING_DESKTOP":
      return { label: "Aguardando desktop", tone: "amber" as const };
    case "EXPIRED":
      return { label: "Expirado", tone: "orange" as const };
    case "CLOSED":
    default:
      return { label: "Desconectado", tone: "slate" as const };
  }
}
