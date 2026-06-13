import { Injectable } from "@nestjs/common";

const ID_TTL_MS = 2 * 60 * 1000;
const ECHO_GRACE_MS = 20 * 1000;

/**
 * Permite distinguir, no webhook, entre uma mensagem "fromMe" que e o eco do
 * que o proprio bot acabou de enviar e uma mensagem enviada manualmente por
 * um atendente humano pelo mesmo numero.
 */
@Injectable()
export class OutboundMessageTrackerService {
  private readonly sentIds = new Map<string, number>();
  private readonly lastSentAt = new Map<string, number>();

  track(phone: string, messageId: string | null | undefined): void {
    const now = Date.now();
    this.lastSentAt.set(phone, now);

    if (messageId) {
      this.sentIds.set(messageId, now);
    }

    this.cleanup(now);
  }

  /**
   * Retorna true quando a mensagem "fromMe" recebida no webhook corresponde
   * (ou provavelmente corresponde) a uma mensagem que o bot acabou de enviar.
   */
  isLikelyEcho(phone: string, messageId: string | null | undefined): boolean {
    const now = Date.now();

    if (messageId && this.sentIds.has(messageId)) {
      this.sentIds.delete(messageId);
      return true;
    }

    const lastSentAt = this.lastSentAt.get(phone);
    if (lastSentAt && now - lastSentAt < ECHO_GRACE_MS) {
      return true;
    }

    return false;
  }

  private cleanup(now: number): void {
    for (const [id, timestamp] of this.sentIds) {
      if (now - timestamp > ID_TTL_MS) {
        this.sentIds.delete(id);
      }
    }
  }
}
