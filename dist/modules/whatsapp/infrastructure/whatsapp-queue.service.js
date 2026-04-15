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
var WhatsappQueueService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappQueueService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const whatsapp_tokens_1 = require("../domain/whatsapp.tokens");
let WhatsappQueueService = WhatsappQueueService_1 = class WhatsappQueueService {
    constructor(whatsappGateway, configService) {
        this.whatsappGateway = whatsappGateway;
        this.configService = configService;
        this.logger = new common_1.Logger(WhatsappQueueService_1.name);
        this.globalQueue = Promise.resolve();
    }
    async sendText(phone, message) {
        await this.enqueue(phone, { type: "text", text: message });
    }
    async sendTexts(phone, messages) {
        const filtered = messages.filter((m) => m && m.trim().length > 0);
        if (filtered.length === 0)
            return;
        await this.enqueueBatch(phone, filtered.map((m) => ({ type: "text", text: m })));
    }
    async sendImage(phone, imageUrl, caption) {
        await this.enqueue(phone, { type: "image", imageUrl, caption });
    }
    enqueue(phone, payload) {
        const task = async () => {
            const target = this.resolveTargetPhone(phone);
            await this.sendWithRetry(target, payload);
            await this.delayBetweenMessages();
        };
        const current = this.globalQueue.then(task);
        this.globalQueue = current.catch(() => undefined);
        return current;
    }
    enqueueBatch(phone, payloads) {
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
    resolveTargetPhone(original) {
        const testNumber = this.configService.get("WHATSAPP_TEST_NUMBER");
        if (testNumber) {
            return testNumber.replace(/\D/g, "");
        }
        return original;
    }
    async delayBetweenMessages() {
        const ms = this.configService.get("WHATSAPP_MESSAGE_DELAY_MS") ?? 5000;
        if (ms <= 0)
            return;
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    async sendWithRetry(target, payload) {
        const maxAttempts = this.configService.get("WHATSAPP_MESSAGE_RETRIES") ?? 3;
        const baseDelay = this.configService.get("WHATSAPP_RETRY_BASE_MS") ?? 1000;
        const multiplier = this.configService.get("WHATSAPP_RETRY_MULTIPLIER") ?? 2;
        const maxDelay = this.configService.get("WHATSAPP_RETRY_MAX_MS") ?? 8000;
        const minInterval = this.configService.get("WHATSAPP_MIN_INTERVAL_MS") ?? 5000;
        let attempt = 0;
        while (attempt < maxAttempts) {
            attempt += 1;
            try {
                if (payload.type === "text") {
                    await this.whatsappGateway.sendText(target, payload.text);
                }
                else {
                    await this.whatsappGateway.sendImage(target, payload.imageUrl, payload.caption);
                }
                return;
            }
            catch (error) {
                const status = error?.response?.status;
                const is429 = status === 429;
                const scaled = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);
                const delay = Math.max(minInterval, is429 ? scaled : Math.min(baseDelay / 2, scaled));
                const detail = this.buildErrorDetail(error);
                this.logger.warn(`Tentativa ${attempt}/${maxAttempts} falhou para ${target} (status=${status ?? "unknown"}${detail ? ", " + detail : ""}).`);
                if (attempt >= maxAttempts) {
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    buildErrorDetail(error) {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const message = (typeof data === "string" && data) ||
            data?.message ||
            data?.error ||
            data?.detail;
        if (!status && !message)
            return "";
        if (message)
            return `erro=${message}`;
        return "";
    }
};
exports.WhatsappQueueService = WhatsappQueueService;
exports.WhatsappQueueService = WhatsappQueueService = WhatsappQueueService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(whatsapp_tokens_1.WHATSAPP_GATEWAY)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService])
], WhatsappQueueService);
//# sourceMappingURL=whatsapp-queue.service.js.map