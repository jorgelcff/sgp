import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappGateway } from "../domain/whatsapp.gateway";
import { WHATSAPP_GATEWAY } from "../domain/whatsapp.tokens";

type TextPayload = { type: "text"; text: string };
type ImagePayload = { type: "image"; imageUrl: string; caption?: string };
type Payload = TextPayload | ImagePayload;

@Injectable()
export class WhatsappQueueService {
  private readonly logger = new Logger(WhatsappQueueService.name);
  private globalQueue = Promise.resolve();

  constructor(
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsappGateway,
    private readonly configService: ConfigService,
  ) {}

  async sendText(phone: string, message: string): Promise<void> {
    await this.enqueue(phone, { type: "text", text: message });
  }

  async sendTexts(phone: string, messages: string[]): Promise<void> {
    const filtered = messages.filter((m) => m && m.trim().length > 0);
    if (filtered.length === 0) return;
    await this.enqueueBatch(
      phone,
      filtered.map((m) => ({ type: "text", text: m })),
    );
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    await this.enqueue(phone, { type: "image", imageUrl, caption });
  }

  private enqueue(phone: string, payload: Payload): Promise<void> {
    const task = async () => {
      const target = this.resolveTargetPhone(phone);
      await this.sendWithRetry(target, payload);
      await this.delayBetweenMessages();
    };

    const current = this.globalQueue.then(task);
    this.globalQueue = current.catch(() => undefined);
    return current;
  }

  private enqueueBatch(phone: string, payloads: Payload[]): Promise<void> {
    const task = async () => {
      const target = this.resolveTargetPhone(phone);
      for (const payload of payloads) {
        await this.sendWithRetry(target, payload);
        await this.delayBetweenMessages();
      }
    };

    const current = this.globalQueue.then(task);
    this.globalQueue = current.catch(() => undefined);
    return current;
  }

  private resolveTargetPhone(original: string): string {
    const testNumber = this.configService.get<string>("WHATSAPP_TEST_NUMBER");
    if (testNumber) {
      return testNumber.replace(/\D/g, "");
    }
    return original;
  }

  private async delayBetweenMessages(): Promise<void> {
    const ms =
      this.configService.get<number>("WHATSAPP_MESSAGE_DELAY_MS") ?? 5000;
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendWithRetry(target: string, payload: Payload): Promise<void> {
    const maxAttempts =
      this.configService.get<number>("WHATSAPP_MESSAGE_RETRIES") ?? 3;
    const baseDelay =
      this.configService.get<number>("WHATSAPP_RETRY_BASE_MS") ?? 1000;
    const multiplier =
      this.configService.get<number>("WHATSAPP_RETRY_MULTIPLIER") ?? 2;
    const maxDelay =
      this.configService.get<number>("WHATSAPP_RETRY_MAX_MS") ?? 8000;
    const minInterval =
      this.configService.get<number>("WHATSAPP_MIN_INTERVAL_MS") ?? 5000;

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        if (payload.type === "text") {
          await this.whatsappGateway.sendText(target, payload.text);
        } else {
          await this.whatsappGateway.sendImage(
            target,
            payload.imageUrl,
            payload.caption,
          );
        }
        return;
      } catch (error) {
        const status = (error as any)?.response?.status;
        const is429 = status === 429;
        const scaled = Math.min(
          baseDelay * Math.pow(multiplier, attempt - 1),
          maxDelay,
        );
        const delay = Math.max(
          minInterval,
          is429 ? scaled : Math.min(baseDelay / 2, scaled),
        );
        const detail = this.buildErrorDetail(error);

        this.logger.warn(
          `Tentativa ${attempt}/${maxAttempts} falhou para ${target} (status=${status ?? "unknown"}${detail ? ", " + detail : ""}).`,
        );

        if (attempt >= maxAttempts) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private buildErrorDetail(error: any): string {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const message =
      (typeof data === "string" && data) ||
      data?.message ||
      data?.error ||
      data?.detail;
    if (!status && !message) return "";
    if (message) return `erro=${message}`;
    return "";
  }
}
