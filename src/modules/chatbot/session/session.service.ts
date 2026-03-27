import { Injectable } from "@nestjs/common";
import { Session } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { ChatState } from "../state-machine/state-machine.types";

const SESSION_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(telefone: string): Promise<Session> {
    const existing = await this.prisma.session.findUnique({
      where: { telefone },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.session.create({
      data: {
        telefone,
        estado: ChatState.MENU_PRINCIPAL,
        contexto: serializeContext({}),
      },
    });
  }

  async ensureActive(session: Session): Promise<Session> {
    const now = Date.now();
    const updatedAt = session.atualizadoEm.getTime();

    if (now - updatedAt <= SESSION_TTL_MS) {
      return session;
    }

    return this.prisma.session.update({
      where: { id: session.id },
      data: {
        estado: ChatState.MENU_PRINCIPAL,
        contexto: serializeContext({}),
      },
    });
  }

  async updateSession(params: {
    sessionId: string;
    estado: ChatState;
    contexto?: Record<string, unknown>;
  }): Promise<Session> {
    return this.prisma.session.update({
      where: { id: params.sessionId },
      data: {
        estado: params.estado,
        contexto: serializeContext(params.contexto ?? {}),
      },
    });
  }

  async listActive(): Promise<Session[]> {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS);

    return this.prisma.session.findMany({
      where: {
        atualizadoEm: { gte: cutoff },
      },
      orderBy: { atualizadoEm: "desc" },
    });
  }
}

function serializeContext(context: Record<string, unknown>): string {
  return JSON.stringify(context ?? {});
}
