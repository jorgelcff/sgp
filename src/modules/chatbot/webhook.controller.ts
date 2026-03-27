import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { ChatbotService } from "./application/chatbot.service";
import { WebhookPayload } from "./state-machine/state-machine.types";

@Controller("webhook")
export class WebhookController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post("whatsapp")
  async handleWebhook(@Body() body: unknown): Promise<{ status: string }> {
    const payload = this.parsePayload(body);
    await this.chatbotService.handleWebhook(payload);
    return { status: "ok" };
  }

  private parsePayload(body: unknown): WebhookPayload {
    const raw = body as Record<string, any>;

    // Payload legado (direto no formato WebhookPayload)
    if (raw?.telefone) {
      return {
        telefone: normalize(raw.telefone),
        mensagem: raw.mensagem ?? "",
        tipo: raw.tipo ?? "text",
        mediaUrl: raw.mediaUrl ?? null,
      };
    }

    // Payload no formato Wasender (event: messages.received)
    const rawMessage = raw?.data?.messages ?? raw?.data?.message;
    const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;
    if (!message) {
      throw new BadRequestException("Formato de webhook invalido.");
    }

    const telefone =
      message.cleanedSenderPn ??
      message.senderPn ??
      message.key?.cleanedSenderPn ??
      extractJid(message.key?.remoteJid);

    if (!telefone) {
      throw new BadRequestException("Telefone ausente no webhook.");
    }

    const { tipo, mediaUrl } = detectMedia(message.message ?? message);
    const mensagem =
      message.messageBody ??
      message.message?.conversation ??
      message.message?.extendedTextMessage?.text ??
      "";

    return {
      telefone: normalize(telefone),
      mensagem,
      tipo,
      mediaUrl,
    };
  }
}

function normalize(phone: string): string {
  return phone.replace(/\D/g, "");
}

function extractJid(jid?: string): string | null {
  if (!jid) return null;
  const at = jid.indexOf("@");
  return at === -1 ? jid : jid.slice(0, at);
}

function detectMedia(message: Record<string, any>): {
  tipo: "text" | "image" | "document";
  mediaUrl: string | null;
} {
  const imageUrl =
    message?.imageMessage?.url || message?.message?.imageMessage?.url;
  if (imageUrl) {
    return { tipo: "image", mediaUrl: imageUrl };
  }

  const docUrl =
    message?.documentMessage?.url || message?.message?.documentMessage?.url;
  if (docUrl) {
    return { tipo: "document", mediaUrl: docUrl };
  }

  return { tipo: "text", mediaUrl: null };
}
