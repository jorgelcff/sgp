import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { WhatsappGateway } from "../domain/whatsapp.gateway";

@Injectable()
export class WasenderService implements WhatsappGateway {
  private readonly logger = new Logger(WasenderService.name);
  // Numeros cuja conta no WhatsApp esta registrada na outra variante do nono
  // digito (com/sem o 9). Evita repetir a tentativa que falha a cada mensagem.
  private readonly jidOverrides = new Map<string, string>();

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async sendText(phone: string, message: string): Promise<string | null> {
    return this.sendWithNinthDigitFallback(phone, (to) => ({
      to,
      text: message,
    }));
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<string | null> {
    // Wasender docs: image is sent via send-message with imageUrl and optional text.
    return this.sendWithNinthDigitFallback(phone, (to) => {
      const payload: Record<string, unknown> = { to, imageUrl };
      if (caption && caption.trim().length > 0) {
        payload.text = caption;
      }
      return payload;
    });
  }

  /**
   * Contas antigas de WhatsApp no Brasil podem estar registradas sem o nono
   * digito (ou o cadastro pode estar sem ele). Quando o Wasender responde que
   * o numero nao existe, tenta uma vez a outra variante antes de desistir.
   */
  private async sendWithNinthDigitFallback(
    phone: string,
    buildPayload: (to: string) => Record<string, unknown>,
  ): Promise<string | null> {
    const primary = formatPhone(phone);
    const known = this.jidOverrides.get(primary);
    if (known) {
      return this.post(this.getTextPath(), buildPayload(known));
    }

    try {
      return await this.post(this.getTextPath(), buildPayload(primary));
    } catch (error) {
      const alternate = isJidNotFound(error)
        ? alternateNinthDigit(primary)
        : null;
      if (!alternate) {
        throw error;
      }

      try {
        const messageId = await this.post(
          this.getTextPath(),
          buildPayload(alternate),
        );
        this.jidOverrides.set(primary, alternate);
        this.logger.warn(
          `Numero ${primary} nao existe no WhatsApp; enviado para a variante ${alternate}. Corrija o cadastro do cliente.`,
        );
        return messageId;
      } catch (alternateError) {
        if (!isJidNotFound(alternateError)) {
          throw alternateError;
        }
        // Nenhuma das variantes tem WhatsApp: devolve o erro original.
        throw error;
      }
    }
  }

  private async post(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
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
    return extractMessageId(response.data);
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

function isJidNotFound(error: unknown): boolean {
  const response = (
    error as { response?: { status?: unknown; data?: unknown } }
  )?.response;
  if (response?.status !== 422) {
    return false;
  }
  const data = response.data;
  const text = typeof data === "string" ? data : JSON.stringify(data ?? "");
  return /jid does not exist/i.test(text);
}

/**
 * Para celular brasileiro (+55 DDD numero), devolve a outra variante do nono
 * digito: remove o 9 inicial de um numero de 9 digitos ou acrescenta em um de
 * 8 digitos. Retorna null para qualquer outro formato.
 */
function alternateNinthDigit(formatted: string): string | null {
  const digits = formatted.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    return null;
  }
  const ddd = digits.slice(2, 4);
  const local = digits.slice(4);
  if (local.length === 9 && local.startsWith("9")) {
    return `+55${ddd}${local.slice(1)}`;
  }
  if (local.length === 8 && /^[6-9]/.test(local)) {
    return `+55${ddd}9${local}`;
  }
  return null;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/${cleanPath}`;
}

function extractMessageId(data: unknown): string | null {
  const root = data as Record<string, any> | undefined;
  const id =
    root?.data?.msgId ??
    root?.data?.key?.id ??
    root?.data?.message?.key?.id ??
    root?.msgId ??
    root?.key?.id;

  return typeof id === "string" ? id : null;
}
