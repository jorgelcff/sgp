import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SessionService } from "../session/session.service";
import { StateMachineService } from "../state-machine/state-machine.service";
import {
  ChatState,
  WebhookPayload,
} from "../state-machine/state-machine.types";
import { WhatsappAdapterService } from "../whatsapp-adapter/whatsapp-adapter.service";
import { OutboundMessageTrackerService } from "../../whatsapp/infrastructure/outbound-message-tracker.service";
import {
  getHumanHandoffThresholdMs,
  isHumanHandoffActive,
} from "../session/human-handoff.util";

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly stateMachine: StateMachineService,
    private readonly whatsappAdapter: WhatsappAdapterService,
    private readonly outboundTracker: OutboundMessageTrackerService,
    private readonly configService: ConfigService,
  ) {}

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const telefone = normalizePhone(payload.telefone);

    if (payload.fromMe) {
      await this.handleOutgoingMessage(telefone, payload);
      return;
    }

    await this.runLocked(telefone, async () => {
      const session = await this.sessionService.findOrCreate(telefone);
      const activeSession = await this.sessionService.ensureActive(session);

      const handoffThreshold = getHumanHandoffThresholdMs(this.configService);
      if (isHumanHandoffActive(activeSession.atendimentoHumanoEm, handoffThreshold)) {
        this.logger.log(
          `Atendimento humano ativo para ${telefone}. Bot permanece em silencio.`,
        );
        return;
      }

      if (activeSession.atendimentoHumanoEm) {
        await this.sessionService.clearHumanHandoff(activeSession.id);
      }

      const state = isChatState(activeSession.estado)
        ? (activeSession.estado as ChatState)
        : ChatState.MENU_PRINCIPAL;

      const context = parseContext(activeSession.contexto);

      const result = await this.stateMachine.handleInput({
        state,
        context,
        payload: { ...payload, telefone },
      });

      const nextContext = result.context ?? context;

      try {
        await this.whatsappAdapter.sendResponses(telefone, result.responses);
      } catch (error) {
        this.logger.warn(
          `Falha ao enviar respostas para ${telefone}: ${getErrorMessage(
            error,
          )}. Mantendo estado ${state}.`,
        );
        return;
      }

      await this.sessionService.updateSession({
        sessionId: activeSession.id,
        estado: result.nextState,
        contexto: nextContext,
      });

      this.logger.log(
        `Webhook processado para ${telefone}. Estado: ${result.nextState}.`,
      );
    });
  }

  private async handleOutgoingMessage(
    telefone: string,
    payload: WebhookPayload,
  ): Promise<void> {
    if (this.outboundTracker.isLikelyEcho(telefone, payload.messageId)) {
      return;
    }

    await this.runLocked(telefone, async () => {
      const session = await this.sessionService.findOrCreate(telefone);
      await this.sessionService.markHumanHandoff(session.id);
    });

    this.logger.log(
      `Atendente humano respondeu ${telefone}. Bot pausado para esta sessao.`,
    );
  }

  private async runLocked(
    telefone: string,
    task: () => Promise<void>,
  ): Promise<void> {
    const previous = this.locks.get(telefone) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.locks.get(telefone) === current) {
          this.locks.delete(telefone);
        }
      });

    this.locks.set(telefone, current);
    await current;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function isChatState(value: string): boolean {
  return Object.values(ChatState).includes(value as ChatState);
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
