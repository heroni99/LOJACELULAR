import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { scannerSocketEvents } from "@lojacelular/shared";
import { ScannerSessionsService } from "./scanner-sessions.service";

type DesktopJoinPayload = {
  socketToken: string;
};

type DesktopContextPayload = {
  locationId?: string | null;
};

type ScannerJoinPayload = {
  socketToken: string;
};

type ScannerReadPayload = {
  code: string;
};

@WebSocketGateway({
  namespace: "scanner",
  cors: {
    origin: true,
    credentials: true
  }
})
export class ScannerSessionsGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly scannerSessionsService: ScannerSessionsService) {}

  @SubscribeMessage(scannerSocketEvents.desktopJoin)
  async handleDesktopJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DesktopJoinPayload
  ) {
    try {
      const session = await this.scannerSessionsService.authorizeDesktopSocket(
        payload.socketToken
      );

      await this.disconnectSockets(
        this.scannerSessionsService.getDesktopSocketIds(session.id),
        socket.id
      );

      socket.data.scannerRole = "desktop";
      socket.data.scannerSessionId = session.id;
      socket.join(this.desktopRoom(session.id));

      const state = await this.scannerSessionsService.registerDesktopSocket(
        session.id,
        socket.id
      );
      this.broadcastSessionState(session.id, state);
    } catch (error) {
      socket.emit(scannerSocketEvents.error, {
        message: error instanceof Error ? error.message : "Nao foi possivel conectar o desktop."
      });
      socket.disconnect();
    }
  }

  @SubscribeMessage(scannerSocketEvents.desktopContextUpdate)
  async handleDesktopContextUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: DesktopContextPayload
  ) {
    if (socket.data.scannerRole !== "desktop" || !socket.data.scannerSessionId) {
      return;
    }

    this.scannerSessionsService.updateDesktopContext(socket.data.scannerSessionId, payload);
  }

  @SubscribeMessage(scannerSocketEvents.scannerJoin)
  async handleScannerJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ScannerJoinPayload
  ) {
    try {
      const session = await this.scannerSessionsService.authorizeScannerSocket(
        payload.socketToken
      );

      await this.disconnectSockets(
        this.scannerSessionsService.getScannerSocketIds(session.id),
        socket.id
      );

      socket.data.scannerRole = "scanner";
      socket.data.scannerSessionId = session.id;
      socket.join(this.scannerRoom(session.id));

      const state = await this.scannerSessionsService.registerScannerSocket(
        session.id,
        socket.id
      );
      this.broadcastSessionState(session.id, state);
    } catch (error) {
      socket.emit(scannerSocketEvents.error, {
        message: error instanceof Error ? error.message : "Nao foi possivel conectar o scanner."
      });
      socket.disconnect();
    }
  }

  @SubscribeMessage(scannerSocketEvents.scannerRead)
  async handleScannerRead(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: ScannerReadPayload
  ) {
    if (socket.data.scannerRole !== "scanner" || !socket.data.scannerSessionId) {
      return;
    }

    const scannedCode = payload.code?.trim();
    if (!scannedCode) {
      socket.emit(scannerSocketEvents.error, {
        message: "Informe um codigo valido para leitura."
      });
      return;
    }

    try {
      const result = await this.scannerSessionsService.resolveScannedCode(
        socket.data.scannerSessionId,
        scannedCode
      );

      socket.emit(scannerSocketEvents.readAccepted, {
        code: result.normalizedCode,
        productName: result.product.name
      });

      this.server.to(this.desktopRoom(socket.data.scannerSessionId)).emit(
        scannerSocketEvents.productFound,
        {
          code: result.normalizedCode,
          product: result.product
        }
      );

      const state = await this.scannerSessionsService.markScanRead(
        socket.data.scannerSessionId
      );
      this.broadcastSessionState(socket.data.scannerSessionId, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao ler esse codigo.";

      socket.emit(scannerSocketEvents.error, {
        message
      });

      this.server.to(this.desktopRoom(socket.data.scannerSessionId)).emit(
        scannerSocketEvents.productNotFound,
        {
          code: scannedCode.toUpperCase(),
          message
        }
      );
    }
  }

  async handleDisconnect(socket: Socket) {
    const sessionId = socket.data.scannerSessionId as string | undefined;
    const role = socket.data.scannerRole as "desktop" | "scanner" | undefined;

    if (!sessionId || !role) {
      return;
    }

    const state =
      role === "desktop"
        ? await this.scannerSessionsService.unregisterDesktopSocket(sessionId, socket.id)
        : await this.scannerSessionsService.unregisterScannerSocket(sessionId, socket.id);

    this.broadcastSessionState(sessionId, state);
  }

  async closeSession(sessionId: string, state: unknown) {
    this.broadcastSessionState(sessionId, state);
    this.server.to(this.desktopRoom(sessionId)).emit(scannerSocketEvents.sessionClosed, {
      sessionId
    });
    this.server.to(this.scannerRoom(sessionId)).emit(scannerSocketEvents.sessionClosed, {
      sessionId
    });
    await this.disconnectSockets([
      ...this.scannerSessionsService.getDesktopSocketIds(sessionId),
      ...this.scannerSessionsService.getScannerSocketIds(sessionId)
    ]);
    this.scannerSessionsService.clearSessionRuntime(sessionId);
  }

  private broadcastSessionState(sessionId: string, state: unknown) {
    this.server.to(this.desktopRoom(sessionId)).emit(scannerSocketEvents.sessionState, state);
    this.server.to(this.scannerRoom(sessionId)).emit(scannerSocketEvents.sessionState, state);
  }

  private async disconnectSockets(socketIds: string[], exceptSocketId?: string) {
    for (const socketId of socketIds) {
      if (socketId === exceptSocketId) {
        continue;
      }

      this.server.sockets.sockets.get(socketId)?.disconnect(true);
    }
  }

  private desktopRoom(sessionId: string) {
    return `scanner:desktop:${sessionId}`;
  }

  private scannerRoom(sessionId: string) {
    return `scanner:mobile:${sessionId}`;
  }
}
