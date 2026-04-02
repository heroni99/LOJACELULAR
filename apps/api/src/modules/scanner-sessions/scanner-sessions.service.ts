import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { CashSessionStatus, Prisma, ScannerSessionStatus } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { sign, verify } from "jsonwebtoken";
import { getRequiredEnv } from "../../common/env";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PdvService } from "../pdv/pdv.service";
import { CreateScannerSessionDto } from "./dto/create-scanner-session.dto";
import { PairScannerSessionDto } from "./dto/pair-scanner-session.dto";

const scannerSessionInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  },
  cashSession: {
    select: {
      id: true,
      status: true
    }
  },
  cashTerminal: {
    select: {
      id: true,
      name: true,
      storeId: true
    }
  },
  desktopUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
} satisfies Prisma.ScannerSessionInclude;

type ScannerSessionRecord = Prisma.ScannerSessionGetPayload<{
  include: typeof scannerSessionInclude;
}>;

type ScannerSessionContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

type DesktopSocketTokenPayload = {
  kind: "desktop";
  sessionId: string;
  storeId: string;
  userId: string | null;
};

type ScannerSocketTokenPayload = {
  kind: "scanner";
  sessionId: string;
  storeId: string;
};

@Injectable()
export class ScannerSessionsService {
  private readonly desktopSockets = new Map<string, Set<string>>();
  private readonly scannerSockets = new Map<string, Set<string>>();
  private readonly desktopContext = new Map<string, { locationId: string | null }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pdvService: PdvService
  ) {}

  async create(payload: CreateScannerSessionDto, context: ScannerSessionContext) {
    if (!context.storeId) {
      throw new ForbiddenException("Loja do operador nao encontrada para o scanner.");
    }

    await this.expireSessions();

    const cashSession = await this.prisma.cashSession.findUnique({
      where: {
        id: payload.cashSessionId
      },
      include: {
        cashTerminal: {
          select: {
            id: true,
            name: true,
            storeId: true
          }
        }
      }
    });

    if (!cashSession) {
      throw new NotFoundException("Sessao de caixa nao encontrada para o scanner.");
    }

    if (cashSession.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException("O scanner exige uma sessao de caixa aberta.");
    }

    if (cashSession.cashTerminal.storeId !== context.storeId) {
      throw new ForbiddenException("Essa sessao de caixa nao pertence a loja atual.");
    }

    const now = new Date();
    await this.prisma.scannerSession.updateMany({
      where: {
        cashSessionId: cashSession.id,
        status: {
          in: [
            ScannerSessionStatus.WAITING_DESKTOP,
            ScannerSessionStatus.WAITING_SCANNER,
            ScannerSessionStatus.CONNECTED
          ]
        },
        closedAt: null
      },
      data: {
        status: ScannerSessionStatus.CLOSED,
        closedAt: now
      }
    });

    const pairingCode = await this.generatePairingCode();
    const pairingToken = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const session = await this.prisma.scannerSession.create({
      data: {
        storeId: cashSession.cashTerminal.storeId,
        cashSessionId: cashSession.id,
        cashTerminalId: cashSession.cashTerminal.id,
        desktopUserId: context.userId ?? null,
        pairingCode,
        pairingTokenHash: this.hashValue(pairingToken),
        status: ScannerSessionStatus.WAITING_DESKTOP,
        expiresAt
      },
      include: scannerSessionInclude
    });

    this.desktopContext.set(session.id, { locationId: null });

    await this.auditService.log({
      storeId: session.storeId,
      userId: context.userId ?? null,
      action: "scanner.sessions.created",
      entity: "scanner_sessions",
      entityId: session.id,
      newData: {
        cashSessionId: session.cashSessionId,
        cashTerminalId: session.cashTerminalId,
        pairingCode: session.pairingCode,
        expiresAt: session.expiresAt
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return {
      session: this.serializeSession(session),
      pairingToken,
      desktopSocketToken: this.signDesktopSocketToken(session)
    };
  }

  async pair(payload: PairScannerSessionDto) {
    await this.expireSessions();

    const session = await this.findPairableSession(payload);
    this.assertSessionCanBeUsed(session);

    return {
      session: this.serializeSession(session),
      scannerSocketToken: this.signScannerSocketToken(session)
    };
  }

  async findStatus(id: string, context: ScannerSessionContext) {
    const session = await this.findSessionById(id);
    this.assertSessionStore(session, context.storeId);
    return this.serializeSession(session);
  }

  async disconnect(id: string, context: ScannerSessionContext) {
    const session = await this.findSessionById(id);
    this.assertSessionStore(session, context.storeId);

    if (session.status === ScannerSessionStatus.CLOSED) {
      this.clearSessionRuntime(session.id);
      return this.serializeSession(session);
    }

    const closed = await this.prisma.scannerSession.update({
      where: {
        id: session.id
      },
      data: {
        status: ScannerSessionStatus.CLOSED,
        closedAt: new Date()
      },
      include: scannerSessionInclude
    });

    await this.auditService.log({
      storeId: closed.storeId,
      userId: context.userId ?? null,
      action: "scanner.sessions.closed",
      entity: "scanner_sessions",
      entityId: closed.id,
      newData: {
        cashSessionId: closed.cashSessionId,
        cashTerminalId: closed.cashTerminalId
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.serializeSession(closed);
  }

  async authorizeDesktopSocket(socketToken: string) {
    const payload = this.verifySocketToken<DesktopSocketTokenPayload>(socketToken);

    if (payload.kind !== "desktop") {
      throw new UnauthorizedException("Token de socket desktop invalido.");
    }

    const session = await this.findSessionById(payload.sessionId);
    this.assertSessionCanBeUsed(session);

    if (session.storeId !== payload.storeId || session.desktopUserId !== payload.userId) {
      throw new UnauthorizedException("Sessao desktop invalida para esse scanner.");
    }

    return session;
  }

  async authorizeScannerSocket(socketToken: string) {
    const payload = this.verifySocketToken<ScannerSocketTokenPayload>(socketToken);

    if (payload.kind !== "scanner") {
      throw new UnauthorizedException("Token de scanner invalido.");
    }

    const session = await this.findSessionById(payload.sessionId);
    this.assertSessionCanBeUsed(session);

    if (session.storeId !== payload.storeId) {
      throw new UnauthorizedException("Scanner nao autorizado para essa loja.");
    }

    return session;
  }

  async registerDesktopSocket(sessionId: string, socketId: string) {
    this.addSocket(this.desktopSockets, sessionId, socketId);
    return this.syncSessionPresence(sessionId, { touchDesktop: true });
  }

  async unregisterDesktopSocket(sessionId: string, socketId: string) {
    this.removeSocket(this.desktopSockets, sessionId, socketId);

    if (!this.getSocketCount(this.desktopSockets, sessionId)) {
      this.desktopContext.delete(sessionId);
    }

    return this.syncSessionPresence(sessionId);
  }

  async registerScannerSocket(sessionId: string, socketId: string) {
    this.addSocket(this.scannerSockets, sessionId, socketId);
    return this.syncSessionPresence(sessionId, { touchScanner: true });
  }

  async unregisterScannerSocket(sessionId: string, socketId: string) {
    this.removeSocket(this.scannerSockets, sessionId, socketId);
    return this.syncSessionPresence(sessionId);
  }

  async markScanRead(sessionId: string) {
    return this.syncSessionPresence(sessionId, { touchRead: true });
  }

  updateDesktopContext(sessionId: string, context: { locationId?: string | null }) {
    this.desktopContext.set(sessionId, {
      locationId: context.locationId?.trim() || null
    });
  }

  getDesktopSocketIds(sessionId: string) {
    return [...(this.desktopSockets.get(sessionId) ?? [])];
  }

  getScannerSocketIds(sessionId: string) {
    return [...(this.scannerSockets.get(sessionId) ?? [])];
  }

  clearSessionRuntime(sessionId: string) {
    this.desktopSockets.delete(sessionId);
    this.scannerSockets.delete(sessionId);
    this.desktopContext.delete(sessionId);
  }

  async resolveScannedCode(sessionId: string, code: string) {
    const session = await this.findSessionById(sessionId);
    this.assertSessionCanBeUsed(session);

    if (!this.getSocketCount(this.desktopSockets, sessionId)) {
      throw new BadRequestException("O PDV do desktop nao esta conectado para receber a leitura.");
    }

    const locationId = this.desktopContext.get(sessionId)?.locationId ?? undefined;
    const product = await this.pdvService.resolveScannedCode(code, locationId);

    if (!product) {
      throw new NotFoundException("Produto nao encontrado para esse codigo lido.");
    }

    return {
      normalizedCode: code.trim().toUpperCase(),
      product
    };
  }

  private async syncSessionPresence(
    sessionId: string,
    options?: {
      touchDesktop?: boolean;
      touchScanner?: boolean;
      touchRead?: boolean;
    }
  ) {
    const session = await this.findSessionById(sessionId);
    const nextStatus = this.resolveNextStatus(session);
    const now = new Date();
    const data: Prisma.ScannerSessionUpdateInput = {};

    if (nextStatus !== session.status) {
      data.status = nextStatus;
    }

    if (options?.touchDesktop) {
      data.connectedDesktopAt = now;
    }

    if (options?.touchScanner) {
      data.connectedScannerAt = now;
    }

    if (options?.touchRead) {
      data.lastReadAt = now;
    }

    const nextSession =
      Object.keys(data).length > 0
        ? await this.prisma.scannerSession.update({
            where: {
              id: session.id
            },
            data,
            include: scannerSessionInclude
          })
        : session;

    return this.serializeSession(nextSession);
  }

  private resolveNextStatus(session: ScannerSessionRecord) {
    const now = new Date();

    if (session.closedAt || session.status === ScannerSessionStatus.CLOSED) {
      return ScannerSessionStatus.CLOSED;
    }

    if (session.expiresAt <= now) {
      return ScannerSessionStatus.EXPIRED;
    }

    const desktopConnected = this.getSocketCount(this.desktopSockets, session.id) > 0;
    const scannerConnected = this.getSocketCount(this.scannerSockets, session.id) > 0;

    if (desktopConnected && scannerConnected) {
      return ScannerSessionStatus.CONNECTED;
    }

    if (desktopConnected) {
      return ScannerSessionStatus.WAITING_SCANNER;
    }

    return ScannerSessionStatus.WAITING_DESKTOP;
  }

  private async findPairableSession(payload: PairScannerSessionDto) {
    if (payload.sessionId && payload.pairingToken) {
      const session = await this.prisma.scannerSession.findUnique({
        where: {
          id: payload.sessionId
        },
        include: scannerSessionInclude
      });

      if (!session) {
        throw new NotFoundException("Sessao de scanner nao encontrada.");
      }

      if (session.pairingTokenHash !== this.hashValue(payload.pairingToken)) {
        throw new UnauthorizedException("Pareamento invalido para esse scanner.");
      }

      return session;
    }

    if (payload.pairingCode) {
      const session = await this.prisma.scannerSession.findUnique({
        where: {
          pairingCode: payload.pairingCode.trim().toUpperCase()
        },
        include: scannerSessionInclude
      });

      if (!session) {
        throw new NotFoundException("Codigo de pareamento nao encontrado.");
      }

      return session;
    }

    throw new BadRequestException(
      "Informe um codigo de pareamento ou um token valido do desktop."
    );
  }

  private async findSessionById(id: string) {
    const session = await this.prisma.scannerSession.findUnique({
      where: {
        id
      },
      include: scannerSessionInclude
    });

    if (!session) {
      throw new NotFoundException("Sessao de scanner nao encontrada.");
    }

    return session;
  }

  private assertSessionStore(session: ScannerSessionRecord, storeId?: string | null) {
    if (!storeId || session.storeId !== storeId) {
      throw new ForbiddenException("Sessao de scanner indisponivel para essa loja.");
    }
  }

  private assertSessionCanBeUsed(session: ScannerSessionRecord) {
    if (session.closedAt || session.status === ScannerSessionStatus.CLOSED) {
      throw new BadRequestException("A sessao do scanner ja foi encerrada.");
    }

    if (session.expiresAt <= new Date() || session.status === ScannerSessionStatus.EXPIRED) {
      throw new BadRequestException("A sessao do scanner expirou.");
    }

    if (session.cashSession.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException("A sessao de caixa vinculada ao scanner nao esta aberta.");
    }
  }

  private async expireSessions() {
    await this.prisma.scannerSession.updateMany({
      where: {
        status: {
          notIn: [ScannerSessionStatus.CLOSED, ScannerSessionStatus.EXPIRED]
        },
        expiresAt: {
          lt: new Date()
        }
      },
      data: {
        status: ScannerSessionStatus.EXPIRED
      }
    });
  }

  private serializeSession(session: ScannerSessionRecord) {
    return {
      id: session.id,
      storeId: session.storeId,
      storeCode: session.store.code,
      storeDisplayName: session.store.displayName,
      cashSessionId: session.cashSessionId,
      cashTerminalId: session.cashTerminalId,
      cashTerminalName: session.cashTerminal.name,
      desktopUserId: session.desktopUserId,
      pairingCode: session.pairingCode,
      status: this.resolveNextStatus(session),
      desktopConnected: this.getSocketCount(this.desktopSockets, session.id) > 0,
      scannerConnected: this.getSocketCount(this.scannerSockets, session.id) > 0,
      connectedDesktopAt: session.connectedDesktopAt,
      connectedScannerAt: session.connectedScannerAt,
      lastReadAt: session.lastReadAt,
      expiresAt: session.expiresAt,
      closedAt: session.closedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    };
  }

  private signDesktopSocketToken(session: ScannerSessionRecord) {
    return sign(
      {
        kind: "desktop",
        sessionId: session.id,
        storeId: session.storeId,
        userId: session.desktopUserId ?? null
      } satisfies DesktopSocketTokenPayload,
      this.getSocketSecret(),
      {
        expiresIn: "12h"
      }
    );
  }

  private signScannerSocketToken(session: ScannerSessionRecord) {
    return sign(
      {
        kind: "scanner",
        sessionId: session.id,
        storeId: session.storeId
      } satisfies ScannerSocketTokenPayload,
      this.getSocketSecret(),
      {
        expiresIn: "12h"
      }
    );
  }

  private verifySocketToken<T>(token: string) {
    try {
      return verify(token, this.getSocketSecret()) as T;
    } catch {
      throw new UnauthorizedException("Token de socket invalido.");
    }
  }

  private getSocketSecret() {
    return process.env.JWT_ACCESS_SECRET ?? getRequiredEnv("JWT_SECRET");
  }

  private hashValue(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private async generatePairingCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const nextCode = randomBytes(4).toString("hex").toUpperCase();
      const existing = await this.prisma.scannerSession.findUnique({
        where: {
          pairingCode: nextCode
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        return nextCode;
      }
    }

    throw new BadRequestException(
      "Nao foi possivel gerar um codigo de pareamento unico para o scanner."
    );
  }

  private addSocket(
    bucket: Map<string, Set<string>>,
    sessionId: string,
    socketId: string
  ) {
    const nextSet = bucket.get(sessionId) ?? new Set<string>();
    nextSet.add(socketId);
    bucket.set(sessionId, nextSet);
  }

  private removeSocket(
    bucket: Map<string, Set<string>>,
    sessionId: string,
    socketId: string
  ) {
    const currentSet = bucket.get(sessionId);
    if (!currentSet) {
      return;
    }

    currentSet.delete(socketId);

    if (!currentSet.size) {
      bucket.delete(sessionId);
    }
  }

  private getSocketCount(bucket: Map<string, Set<string>>, sessionId: string) {
    return bucket.get(sessionId)?.size ?? 0;
  }
}
