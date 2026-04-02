import { io, type Socket } from "socket.io-client";
import { scannerSocketEvents } from "@/shared";
import { API_ORIGIN, type PdvProductResult, type ScannerSessionState } from "./api";

export type ScannerSocket = Socket;

export type ScannerProductFoundEvent = {
  code: string;
  product: PdvProductResult;
};

export type ScannerProductNotFoundEvent = {
  code: string;
  message: string;
};

export type ScannerReadAcceptedEvent = {
  code: string;
  productName: string;
};

export type ScannerSocketErrorEvent = {
  message: string;
};

export function createScannerSocket() {
  return io(`${API_ORIGIN}/scanner`, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 600,
    reconnectionDelayMax: 2500
  });
}

export { scannerSocketEvents };
export type { ScannerSessionState };
