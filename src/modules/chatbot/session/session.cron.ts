import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../../database/prisma.service";
import { WhatsappAdapterService } from "../whatsapp-adapter/whatsapp-adapter.service";

const SESSION_TTL_MS = 30 * 60 * 1000;
const WARNING_AFTER_MS = 30 * 60 * 1000;
const FINAL_NOTICE_AFTER_MS = 35 * 60 * 1000;

@Injectable()
export class SessionCron {
  private readonly logger = new Logger(SessionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappAdapter: WhatsappAdapterService,
  ) {}

  @Cron("*/1 * * * *")
  async handleNotifications(): Promise<void> {
    const now = Date.now();
    await this.notifyWindow(now, WARNING_AFTER_MS, "warningSentAt", () =>
      "Sua sessao vai expirar. Envie uma mensagem para continuar.",
    );
    await this.notifyWindow(now, FINAL_NOTICE_AFTER_MS, "finalSentAt", () =>
      "Sessao expirada. Envie uma mensagem para iniciar novamente.",
    );
  }

  private async notifyWindow(
    now: number,
    thresholdMs: number,
    flag: "warningSentAt" | "finalSentAt",
    buildMessage: () => string,
  ): Promise<void> {
    const start = new Date(now - thresholdMs - 60 * 1000);
    const end = new Date(now - thresholdMs);

    const sessions = await this.prisma.session.findMany({
      where: {
        atualizadoEm: {
          gte: start,
          lte: end,
        },
      },
    });

    for (const session of sessions) {
      const context = parseContext(session.contexto);
      if (context[flag]) {
        continue;
      }

      try {
        await this.whatsappAdapter.sendResponses(session.telefone, [
          { type: "text", text: buildMessage() },
        ]);
        context[flag] = new Date().toISOString();
        await this.prisma.session.update({
          where: { id: session.id },
          data: { contexto: JSON.stringify(context) },
        });
      } catch (error) {
        this.logger.warn(
          `Falha ao notificar sessao ${session.id}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}

function parseContext(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
