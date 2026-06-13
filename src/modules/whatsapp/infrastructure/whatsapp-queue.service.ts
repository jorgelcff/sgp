import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappGateway } from "../domain/whatsapp.gateway";
import { WHATSAPP_GATEWAY } from "../domain/whatsapp.tokens";
import { OutboundMessageTrackerService } from "./outbound-message-tracker.service";

type TextPayload = { type: "text"; text: string };
type ImagePayload = { type: "image"; imageUrl: string; caption?: string };
type Payload = TextPayload | ImagePayload;

export type QueuePriority = "normal" | "low";

type QueueItem = {
  phone: string;
  payload: Payload;
  resolve: () => void;
  reject: (error: unknown) => void;
};

@Injectable()
export class WhatsappQueueService {
  private readonly logger = new Logger(WhatsappQueueService.name);
  private readonly highQueue: QueueItem[] = [];
  private readonly lowQueue: QueueItem[] = [];
  private processing = false;

  constructor(
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsappGateway,
    private readonly configService: ConfigService,
    private readonly outboundTracker: OutboundMessageTrackerService,
  ) {}

  async sendText(
    phone: string,
    message: string,
    priority: QueuePriority = "normal",
  ): Promise<void> {
    await this.enqueue(phone, { type: "text", text: message }, priority);
  }

  async sendTexts(
    phone: string,
    messages: string[],
    priority: QueuePriority = "normal",
  ): Promise<void> {
    const filtered = messages.filter((m) => m && m.trim().length > 0);
    if (filtered.length === 0) return;
    await this.enqueueBatch(
      phone,
      filtered.map((m) => ({ type: "text", text: m })),
      priority,
    );
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
    priority: QueuePriority = "normal",
  ): Promise<void> {
    await this.enqueue(phone, { type: "image", imageUrl, caption }, priority);
  }

  private enqueue(
    phone: string,
    payload: Payload,
    priority: QueuePriority,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.push({ phone, payload, resolve, reject }, priority);
      this.processQueue();
    });
  }

  private enqueueBatch(
    phone: string,
    payloads: Payload[],
    priority: QueuePriority,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let remaining = payloads.length;
      for (const payload of payloads) {
        this.push(
          {
            phone,
            payload,
            resolve: () => {
              remaining -= 1;
              if (remaining === 0) {
                resolve();
              }
            },
            reject,
          },
          priority,
        );
      }
      this.processQueue();
    });
  }

  private push(item: QueueItem, priority: QueuePriority): void {
    if (priority === "low") {
      this.lowQueue.push(item);
    } else {
      this.highQueue.push(item);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      let item = this.nextItem();
      while (item) {
        const target = this.resolveTargetPhone(item.phone);
        try {
          await this.sendWithRetry(target, item.payload);
          item.resolve();
        } catch (error) {
          item.reject(error);
        }

        await this.delayBetweenMessages();
        item = this.nextItem();
      }
    } finally {
      this.processing = false;
    }
  }

  private nextItem(): QueueItem | undefined {
    return this.highQueue.shift() ?? this.lowQueue.shift();
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
        let messageId: string | null;
        if (payload.type === "text") {
          messageId = await this.whatsappGateway.sendText(target, payload.text);
        } else {
          messageId = await this.whatsappGateway.sendImage(
            target,
            payload.imageUrl,
            payload.caption,
          );
        }
        this.outboundTracker.track(target, messageId);
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
