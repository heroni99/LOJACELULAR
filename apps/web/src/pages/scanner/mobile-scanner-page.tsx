import { BrowserMultiFormatReader } from "@zxing/browser";
import { useMutation } from "@tanstack/react-query";
import { Camera, CameraOff, LogOut, Smartphone, Wifi } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pairScannerSession, type ScannerSessionState } from "@/lib/api";
import {
  createScannerSocket,
  scannerSocketEvents,
  type ScannerReadAcceptedEvent,
  type ScannerSocket,
  type ScannerSocketErrorEvent
} from "@/lib/scanner-socket";

const SCAN_COOLDOWN_MS = 1200;

type CameraControls = {
  stop(): void;
};

export function MobileScannerPage() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerSocketRef = useRef<ScannerSocket | null>(null);
  const scannerControlsRef = useRef<CameraControls | null>(null);
  const autoPairAttemptedRef = useRef(false);
  const lastReadRef = useRef<{ code: string; at: number } | null>(null);
  const [pairingCode, setPairingCode] = useState(searchParams.get("code") ?? "");
  const [sessionState, setSessionState] = useState<ScannerSessionState | null>(null);
  const [scannerSocketToken, setScannerSocketToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [readingActive, setReadingActive] = useState(false);
  const [lastReadProduct, setLastReadProduct] = useState<string | null>(null);

  const pairMutation = useMutation({
    mutationFn: pairScannerSession,
    onSuccess: (result) => {
      setSessionState(result.session);
      setScannerSocketToken(result.scannerSocketToken);
      setFeedback({
        tone: "success",
        text: `Conectado ao PDV ${result.session.cashTerminalName}.`
      });
    },
    onError: (error) => {
      setFeedback({
        tone: "error",
        text: (error as Error).message
      });
    }
  });

  useEffect(() => {
    const sessionId = searchParams.get("sid");
    const pairingToken = searchParams.get("token");

    if (!sessionId || !pairingToken || autoPairAttemptedRef.current) {
      return;
    }

    autoPairAttemptedRef.current = true;
    pairMutation.mutate({
      sessionId,
      pairingToken
    });
  }, [pairMutation, searchParams]);

  useEffect(() => {
    if (!scannerSocketToken || !sessionState?.id) {
      scannerSocketRef.current?.disconnect();
      scannerSocketRef.current = null;
      return;
    }

    const socket = createScannerSocket();
    scannerSocketRef.current = socket;

    const joinScanner = () => {
      socket.emit(scannerSocketEvents.scannerJoin, {
        socketToken: scannerSocketToken
      });
    };

    socket.on("connect", joinScanner);
    socket.on("connect_error", (error) => {
      setFeedback({
        tone: "error",
        text: error.message || "Falha ao conectar o celular ao servidor."
      });
    });
    socket.on(scannerSocketEvents.sessionState, (nextSession: ScannerSessionState) => {
      setSessionState(nextSession);

      if (nextSession.status === "CLOSED" || nextSession.status === "EXPIRED") {
        stopReading();
        setScannerSocketToken(null);
        setFeedback({
          tone: "error",
          text:
            nextSession.status === "EXPIRED"
              ? "A sessao de scanner expirou."
              : "A sessao de scanner foi encerrada."
        });
      }
    });
    socket.on(scannerSocketEvents.readAccepted, (payload: ScannerReadAcceptedEvent) => {
      setLastReadProduct(payload.productName);
      setFeedback({
        tone: "success",
        text: `Leitura enviada: ${payload.productName}.`
      });
    });
    socket.on(scannerSocketEvents.error, (payload: ScannerSocketErrorEvent) => {
      setFeedback({
        tone: "error",
        text: payload.message
      });
    });
    socket.on(scannerSocketEvents.sessionClosed, () => {
      stopReading();
      setScannerSocketToken(null);
      setFeedback({
        tone: "error",
        text: "A sessao de scanner foi encerrada pelo desktop."
      });
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (scannerSocketRef.current === socket) {
        scannerSocketRef.current = null;
      }
    };
  }, [scannerSocketToken, sessionState?.id]);

  useEffect(() => {
    return () => {
      stopReading();
      scannerSocketRef.current?.disconnect();
    };
  }, []);

  async function startReading() {
    if (!scannerSocketToken || !scannerSocketRef.current) {
      setFeedback({
        tone: "error",
        text: "Conecte o celular ao PDV antes de abrir a camera."
      });
      return;
    }

    if (!sessionState?.desktopConnected) {
      setFeedback({
        tone: "error",
        text: "O desktop do PDV ainda nao esta conectado para receber as leituras."
      });
      return;
    }

    if (!videoRef.current) {
      setFeedback({
        tone: "error",
        text: "Camera indisponivel no navegador."
      });
      return;
    }

    stopReading();

    const reader = new BrowserMultiFormatReader();

    try {
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          const nextCode = result?.getText()?.trim();
          if (!nextCode) {
            return;
          }

          const now = Date.now();
          const lastRead = lastReadRef.current;
          if (
            lastRead &&
            lastRead.code === nextCode &&
            now - lastRead.at < SCAN_COOLDOWN_MS
          ) {
            return;
          }

          lastReadRef.current = {
            code: nextCode,
            at: now
          };

          scannerSocketRef.current?.emit(scannerSocketEvents.scannerRead, {
            code: nextCode
          });
        }
      );

      scannerControlsRef.current = controls as CameraControls;
      setCameraOpen(true);
      setReadingActive(true);
      setFeedback({
        tone: "info",
        text: "Leitura ativa. Aponte a camera para o codigo de barras do produto."
      });
    } catch (error) {
      stopReading();
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nao foi possivel abrir a camera do celular."
      });
    }
  }

  function stopReading() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setReadingActive(false);
  }

  const statusMeta = describeStatus(sessionState, Boolean(scannerSocketToken));

  return (
    <main className="min-h-screen bg-background px-4 py-5 text-foreground">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Scanner mobile
              </p>
              <h1 className="text-3xl font-black tracking-tight">
                Celular como leitor
              </h1>
            </div>
            <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Conecte o celular ao PDV e use a camera para ler o barcode da etiqueta
            impressa no produto.
          </p>
        </header>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle className="text-xl">Pareamento com o PDV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="scanner-pairing-code">
                Codigo manual
              </label>
              <Input
                autoCapitalize="characters"
                autoCorrect="off"
                id="scanner-pairing-code"
                onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                placeholder="Ex.: A1B2C3D4"
                value={pairingCode}
              />
            </div>

            <Button
              className="w-full"
              disabled={pairMutation.isPending || !pairingCode.trim()}
              onClick={() =>
                pairMutation.mutate({
                  pairingCode: pairingCode.trim().toUpperCase()
                })
              }
              type="button"
            >
              <Wifi className="mr-2 h-4 w-4" />
              {pairMutation.isPending ? "Conectando..." : "Conectar ao PDV"}
            </Button>

            {sessionState ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniInfo label="Loja" value={sessionState.storeDisplayName} />
                <MiniInfo label="Terminal" value={sessionState.cashTerminalName} />
                <MiniInfo
                  label="Desktop"
                  value={sessionState.desktopConnected ? "Conectado" : "Aguardando"}
                />
                <MiniInfo
                  label="Leitor"
                  value={scannerSocketToken ? "Conectado" : "Desconectado"}
                />
              </div>
            ) : null}

            {!window.isSecureContext ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                A camera do celular costuma exigir HTTPS ou `localhost` para funcionar
                no navegador.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-white/95">
          <CardHeader>
            <CardTitle className="text-xl">Leitura da etiqueta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-slate-950">
              <div className="relative aspect-[3/4]">
                <video
                  autoPlay
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  ref={videoRef}
                />
                {!cameraOpen ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/88 px-6 text-center text-slate-200">
                    <Smartphone className="h-10 w-10 text-orange-300" />
                    <p className="text-sm leading-6">
                      Clique em `Iniciar leitura` para abrir a camera traseira e ler o
                      codigo de barras do produto.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                className="w-full"
                disabled={!scannerSocketToken || readingActive}
                onClick={() => void startReading()}
                type="button"
              >
                <Camera className="mr-2 h-4 w-4" />
                Iniciar leitura
              </Button>
              <Button
                className="w-full"
                disabled={!cameraOpen}
                onClick={stopReading}
                type="button"
                variant="outline"
              >
                <CameraOff className="mr-2 h-4 w-4" />
                Parar leitura
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  stopReading();
                  scannerSocketRef.current?.disconnect();
                  setScannerSocketToken(null);
                  setSessionState(null);
                  setFeedback(null);
                  setLastReadProduct(null);
                }}
                type="button"
                variant="outline"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair do scanner
              </Button>
            </div>

            {feedback ? (
              <div
                className={`rounded-2xl border p-4 text-sm ${
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : feedback.tone === "info"
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {feedback.text}
              </div>
            ) : null}

            {lastReadProduct ? (
              <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm text-muted-foreground">
                Ultimo produto enviado ao PDV:{" "}
                <strong className="text-foreground">{lastReadProduct}</strong>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold">{value}</p>
    </div>
  );
}

function describeStatus(session: ScannerSessionState | null, connected: boolean) {
  if (!session) {
    return {
      label: "Aguardando pareamento",
      tone: "amber" as const
    };
  }

  if (session.status === "EXPIRED") {
    return {
      label: "Expirado",
      tone: "orange" as const
    };
  }

  if (session.status === "CLOSED") {
    return {
      label: "Desconectado",
      tone: "slate" as const
    };
  }

  return {
    label: connected ? "Conectado ao PDV" : "Aguardando conexao",
    tone: connected ? ("green" as const) : ("amber" as const)
  };
}
