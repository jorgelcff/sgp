"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WhatsappService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
const baileys_1 = __importStar(require("baileys"));
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const qrcode_1 = __importDefault(require("qrcode"));
let WhatsappService = WhatsappService_1 = class WhatsappService {
    constructor() {
        this.logger = new common_1.Logger(WhatsappService_1.name);
        this.authDir = (0, node_path_1.resolve)("./auth");
        this.socket = null;
        this.connecting = null;
        this.latestQr = null;
        this.pendingMessages = [];
    }
    async sendText(phone, message) {
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
    async sendImage(phone, imageUrl, caption) {
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
    async connect() {
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
        }
        finally {
            this.connecting = null;
        }
    }
    async createConnection() {
        const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)("./auth");
        const { version } = await (0, baileys_1.fetchLatestBaileysVersion)();
        this.socket = (0, baileys_1.default)({
            version,
            auth: state,
            printQRInTerminal: false,
        });
        this.socket.ev.on("creds.update", saveCreds);
        this.socket.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (qr) {
                this.latestQr = { value: qr, generatedAt: new Date() };
                void this.logQrToTerminal(qr);
            }
            if (connection === "close") {
                const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
                this.logger.warn(`Conexao fechada. Reconnect: ${shouldReconnect}`);
                this.socket = null;
                if (statusCode === baileys_1.DisconnectReason.loggedOut) {
                    void this.handleLoggedOut();
                }
                else if (shouldReconnect) {
                    void this.connect();
                }
            }
            if (connection === "open") {
                this.logger.log("WhatsApp conectado.");
                void this.flushPending();
            }
        });
    }
    getLatestQr() {
        return this.latestQr;
    }
    async getLatestQrDataUrl() {
        if (!this.latestQr) {
            return null;
        }
        return qrcode_1.default.toDataURL(this.latestQr.value);
    }
    async getLatestQrPng(scale = 6) {
        if (!this.latestQr) {
            return null;
        }
        const safeScale = Number.isNaN(scale) ? 6 : Math.max(2, Math.min(scale, 12));
        return qrcode_1.default.toBuffer(this.latestQr.value, { type: "png", scale: safeScale });
    }
    queueMessage(message) {
        this.pendingMessages.push(message);
    }
    async flushPending() {
        if (!this.socket?.user?.id) {
            return;
        }
        const pending = [...this.pendingMessages];
        this.pendingMessages = [];
        for (const message of pending) {
            if (message.type === "text") {
                await this.sendText(message.phone, message.message);
            }
            else {
                await this.sendImage(message.phone, message.imageUrl, message.caption);
            }
        }
    }
    async logQrToTerminal(qr) {
        try {
            const terminalQr = await qrcode_1.default.toString(qr, { type: "terminal" });
            this.logger.log("QR gerado para login:\n" + terminalQr);
        }
        catch (error) {
            this.logger.warn("Falha ao gerar QR no terminal.");
        }
    }
    async handleLoggedOut() {
        this.logger.warn("Sessao do WhatsApp expirada. Limpando credenciais...");
        this.latestQr = null;
        try {
            await (0, promises_1.rm)(this.authDir, { recursive: true, force: true });
            this.logger.log("Credenciais removidas. Gerando novo QR...");
        }
        catch (error) {
            this.logger.warn("Falha ao remover credenciais do WhatsApp.");
        }
        void this.connect();
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = WhatsappService_1 = __decorate([
    (0, common_1.Injectable)()
], WhatsappService);
function normalizePhone(phone) {
    return phone.replace(/\D/g, "");
}
//# sourceMappingURL=whatsapp.service.js.map