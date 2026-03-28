import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { WhatsappGateway } from "../domain/whatsapp.gateway";

@Injectable()
export class WasenderService implements WhatsappGateway {
  private readonly logger = new Logger(WasenderService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendText(phone: string, message: string): Promise<void> {
    await this.post(this.getTextPath(), {
      to: formatPhone(phone),
      text: message,
    });
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    // Wasender docs: image is sent via send-message with imageUrl and optional text.
    const payload: Record<string, unknown> = {
      to: formatPhone(phone),
      imageUrl,
    };

    if (caption && caption.trim().length > 0) {
      payload.text = caption;
    }

    await this.post(this.getTextPath(), payload);
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<void> {
    const url = buildUrl(this.getBaseUrl(), path);
    const token = this.configService.get<string>("WASENDER_TOKEN");
    if (!token) {
      throw new Error("WASENDER_TOKEN nao configurado.");
    }

    const response = await firstValueFrom(
      this.httpService.post(url, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }),
    );

    this.logger.log(`Wasender enviado. Status=${response.status}.`);
  }

  private getBaseUrl(): string {
    return (
      this.configService.get<string>("WASENDER_BASE_URL") ??
      "https://wasenderapi.com/api"
    );
  }

  private getTextPath(): string {
    return this.configService.get<string>("WASENDER_SEND_TEXT_PATH") ?? "send-message";
  }

}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("+")) {
    return digits;
  }

  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${cleanPath}`;
}
