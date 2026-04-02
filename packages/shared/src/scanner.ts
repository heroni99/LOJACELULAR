export const scannerSessionStatusValues = [
  "WAITING_DESKTOP",
  "WAITING_SCANNER",
  "CONNECTED",
  "CLOSED",
  "EXPIRED"
] as const;

export type ScannerSessionStatus = (typeof scannerSessionStatusValues)[number];

export const scannerSocketEvents = {
  desktopJoin: "scanner:desktop:join",
  desktopContextUpdate: "scanner:desktop:context:update",
  scannerJoin: "scanner:mobile:join",
  scannerRead: "scanner:mobile:read",
  sessionState: "scanner:session:state",
  productFound: "scanner:product:found",
  productNotFound: "scanner:product:not-found",
  readAccepted: "scanner:mobile:read:accepted",
  sessionClosed: "scanner:session:closed",
  error: "scanner:error"
} as const;
