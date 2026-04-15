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
var WasenderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WasenderService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
let WasenderService = WasenderService_1 = class WasenderService {
    constructor(httpService, configService) {
        this.httpService = httpService;
        this.configService = configService;
        this.logger = new common_1.Logger(WasenderService_1.name);
    }
    async sendText(phone, message) {
        await this.post(this.getTextPath(), {
            to: formatPhone(phone),
            text: message,
        });
    }
    async sendImage(phone, imageUrl, caption) {
        // Wasender docs: image is sent via send-message with imageUrl and optional text.
        const payload = {
            to: formatPhone(phone),
            imageUrl,
        };
        if (caption && caption.trim().length > 0) {
            payload.text = caption;
        }
        await this.post(this.getTextPath(), payload);
    }
    async post(path, payload) {
        const url = buildUrl(this.getBaseUrl(), path);
        const token = this.configService.get("WASENDER_TOKEN");
        if (!token) {
            throw new Error("WASENDER_TOKEN nao configurado.");
        }
        const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        }));
        this.logger.log(`Wasender enviado. Status=${response.status}.`);
    }
    getBaseUrl() {
        return (this.configService.get("WASENDER_BASE_URL") ??
            "https://wasenderapi.com/api");
    }
    getTextPath() {
        return this.configService.get("WASENDER_SEND_TEXT_PATH") ?? "send-message";
    }
};
exports.WasenderService = WasenderService;
exports.WasenderService = WasenderService = WasenderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [axios_1.HttpService,
        config_1.ConfigService])
], WasenderService);
function formatPhone(phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("+")) {
        return digits;
    }
    return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}
function buildUrl(baseUrl, path) {
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${base}/${cleanPath}`;
}
//# sourceMappingURL=wasender.service.js.map