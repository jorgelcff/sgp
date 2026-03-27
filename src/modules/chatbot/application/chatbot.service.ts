import { Injectable, Logger } from "@nestjs/common";
import { SessionService } from "../session/session.service";
import { StateMachineService } from "../state-machine/state-machine.service";
import {
  ChatState,
  WebhookPayload,
} from "../state-machine/state-machine.types";
import { WhatsappAdapterService } from "../whatsapp-adapter/whatsapp-adapter.service";

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly stateMachine: StateMachineService,
    private readonly whatsappAdapter: WhatsappAdapterService,
  ) {}

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    const telefone = normalizePhone(payload.telefone);
    await this.runLocked(telefone, async () => {
      const session = await this.sessionService.findOrCreate(telefone);
      const activeSession = await this.sessionService.ensureActive(session);

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
