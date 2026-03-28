import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappGateway } from "../../whatsapp/domain/whatsapp.gateway";
import { WHATSAPP_GATEWAY } from "../../whatsapp/domain/whatsapp.tokens";
import { ChatResponse } from "../state-machine/state-machine.types";

@Injectable()
export class WhatsappAdapterService {
  private readonly logger = new Logger(WhatsappAdapterService.name);

  constructor(
    @Inject(WHATSAPP_GATEWAY)
    private readonly whatsappGateway: WhatsappGateway,
    private readonly configService: ConfigService,
  ) {}

  async sendResponses(
    telefone: string,
    responses: ChatResponse[],
  ): Promise<void> {
    const target = this.resolveTargetPhone(telefone);
    for (const response of responses) {
      await this.sendWithRetry(target, response);
      await this.delayBetweenMessages();
    }

    this.logger.log(
      `Respostas enviadas para ${target}. Total: ${responses.length}.`,
    );
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
      this.configService.get<number>("WHATSAPP_MESSAGE_DELAY_MS") ?? 800;
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendWithRetry(
    target: string,
    response: ChatResponse,
  ): Promise<void> {
    const maxAttempts =
      this.configService.get<number>("WHATSAPP_MESSAGE_RETRIES") ?? 3;
    const baseDelay =
      this.configService.get<number>("WHATSAPP_RETRY_BASE_MS") ?? 1000;
    const multiplier =
      this.configService.get<number>("WHATSAPP_RETRY_MULTIPLIER") ?? 2;
    const maxDelay =
      this.configService.get<number>("WHATSAPP_RETRY_MAX_MS") ?? 8000;

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        if (response.type === "text") {
          await this.whatsappGateway.sendText(target, response.text);
        }

        if (response.type === "image") {
          await this.whatsappGateway.sendImage(
            target,
            response.imageUrl,
            response.caption,
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
        const delay = is429 ? scaled : Math.min(baseDelay / 2, scaled);
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

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private buildErrorDetail(error: any): string {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const message =
      (typeof data === "string" && data) ||
      data?.message ||
      data?.error ||
      data?.detail;
    if (!status && !message) {
      return "";
    }
    if (status && message) {
      return `erro=${message}`;
    }
    if (message) {
      return `erro=${message}`;
    }
    return "";
  }
}
