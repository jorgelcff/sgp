import { Injectable, Logger } from "@nestjs/common";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  WASocket,
} from "baileys";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import { WhatsappGateway } from "../domain/whatsapp.gateway";

@Injectable()
export class WhatsappService implements WhatsappGateway {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly authDir = resolve("./auth");
  private socket: WASocket | null = null;
  private connecting: Promise<void> | null = null;
  private latestQr: { value: string; generatedAt: Date } | null = null;
  private pendingMessages: Array<
    | { type: "text"; phone: string; message: string }
    | { type: "image"; phone: string; imageUrl: string; caption?: string }
  > = [];

  async sendText(phone: string, message: string): Promise<void> {
    await this.connect();

    if (!this.socket) {
      throw new Error("WhatsApp nao conectado.");
    }

    if (!this.socket.user?.id) {
      this.queueMessage({ type: "text", phone, message });
      this.logger.warn("WhatsApp ainda nao autenticado. Mensagem enfileirada.");
      return;
    }

    const jid = `${normalizePhone(phone)}@s.whatsapp.net`;
    await this.socket.sendMessage(jid, { text: message });
  }

  async sendImage(
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    await this.connect();

    if (!this.socket) {
      throw new Error("WhatsApp nao conectado.");
    }

    if (!this.socket.user?.id) {
      this.queueMessage({ type: "image", phone, imageUrl, caption });
      this.logger.warn("WhatsApp ainda nao autenticado. Imagem enfileirada.");
      return;
    }

    const jid = `${normalizePhone(phone)}@s.whatsapp.net`;
    await this.socket.sendMessage(jid, {
      image: { url: imageUrl },
      caption,
    });
  }

  private async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.createConnection();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async createConnection(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState("./auth");
    const { version } = await fetchLatestBaileysVersion();

    this.socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    });

    this.socket.ev.on("creds.update", saveCreds);

    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      const statusCode = (
        lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined
      )?.output?.statusCode;

      if (qr) {
        this.latestQr = { value: qr, generatedAt: new Date() };
        void this.logQrToTerminal(qr);
      }
      if (connection === "close") {
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        this.logger.warn(`Conexao fechada. Reconnect: ${shouldReconnect}`);
        this.socket = null;
        if (statusCode === DisconnectReason.loggedOut) {
          void this.handleLoggedOut();
        } else if (shouldReconnect) {
          void this.connect();
        }
      }

      if (connection === "open") {
        this.logger.log("WhatsApp conectado.");
        void this.flushPending();
      }
    });
  }

  getLatestQr(): { value: string; generatedAt: Date } | null {
    return this.latestQr;
  }

  async getLatestQrDataUrl(): Promise<string | null> {
    if (!this.latestQr) {
      return null;
    }

    return QRCode.toDataURL(this.latestQr.value);
  }

  async getLatestQrPng(scale = 6): Promise<Buffer | null> {
    if (!this.latestQr) {
      return null;
    }

    const safeScale = Number.isNaN(scale) ? 6 : Math.max(2, Math.min(scale, 12));
    return QRCode.toBuffer(this.latestQr.value, { type: "png", scale: safeScale });
  }

  private queueMessage(
    message:
      | { type: "text"; phone: string; message: string }
      | { type: "image"; phone: string; imageUrl: string; caption?: string },
  ): void {
    this.pendingMessages.push(message);
  }

  private async flushPending(): Promise<void> {
    if (!this.socket?.user?.id) {
      return;
    }

    const pending = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const message of pending) {
      if (message.type === "text") {
        await this.sendText(message.phone, message.message);
      } else {
        await this.sendImage(message.phone, message.imageUrl, message.caption);
      }
    }
  }

  private async logQrToTerminal(qr: string): Promise<void> {
    try {
      const terminalQr = await QRCode.toString(qr, { type: "terminal" });
      this.logger.log("QR gerado para login:\n" + terminalQr);
    } catch (error) {
      this.logger.warn("Falha ao gerar QR no terminal.");
    }
  }

  private async handleLoggedOut(): Promise<void> {
    this.logger.warn("Sessao do WhatsApp expirada. Limpando credenciais...");
    this.latestQr = null;
    try {
      await rm(this.authDir, { recursive: true, force: true });
      this.logger.log("Credenciais removidas. Gerando novo QR...");
    } catch (error) {
      this.logger.warn("Falha ao remover credenciais do WhatsApp.");
    }

    void this.connect();
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
