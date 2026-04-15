"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookController = void 0;
const common_1 = require("@nestjs/common");
const chatbot_service_1 = require("./application/chatbot.service");
let WebhookController = class WebhookController {
    constructor(chatbotService) {
        this.chatbotService = chatbotService;
    }
    async handleWebhook(body) {
        const payload = this.parsePayload(body);
        await this.chatbotService.handleWebhook(payload);
        return { status: "ok" };
    }
    parsePayload(body) {
        const raw = body;
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
            throw new common_1.BadRequestException("Formato de webhook invalido.");
        }
        const telefone = message.cleanedSenderPn ??
            message.senderPn ??
            message.key?.cleanedSenderPn ??
            extractJid(message.key?.remoteJid);
        if (!telefone) {
            throw new common_1.BadRequestException("Telefone ausente no webhook.");
        }
        const { tipo, mediaUrl } = detectMedia(message.message ?? message);
        const mensagem = message.messageBody ??
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
};
exports.WebhookController = WebhookController;
__decorate([
    (0, common_1.Post)("whatsapp"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WebhookController.prototype, "handleWebhook", null);
exports.WebhookController = WebhookController = __decorate([
    (0, common_1.Controller)("webhook"),
    __metadata("design:paramtypes", [chatbot_service_1.ChatbotService])
], WebhookController);
function normalize(phone) {
    return phone.replace(/\D/g, "");
}
function extractJid(jid) {
    if (!jid)
        return null;
    const at = jid.indexOf("@");
    return at === -1 ? jid : jid.slice(0, at);
}
function detectMedia(message) {
    const imageUrl = message?.imageMessage?.url || message?.message?.imageMessage?.url;
    if (imageUrl) {
        return { tipo: "image", mediaUrl: imageUrl };
    }
    const docUrl = message?.documentMessage?.url || message?.message?.documentMessage?.url;
    if (docUrl) {
        return { tipo: "document", mediaUrl: docUrl };
    }
    return { tipo: "text", mediaUrl: null };
}
//# sourceMappingURL=webhook.controller.js.map