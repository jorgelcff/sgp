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
exports.WhatsappController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const whatsapp_service_1 = require("./infrastructure/whatsapp.service");
let WhatsappController = class WhatsappController {
    constructor(whatsappService, configService) {
        this.whatsappService = whatsappService;
        this.configService = configService;
    }
    async getQr() {
        this.ensureBaileysEnabled();
        const latest = this.whatsappService.getLatestQr();
        if (!latest) {
            return { status: "empty" };
        }
        const dataUrl = await this.whatsappService.getLatestQrDataUrl();
        return {
            status: "ok",
            qr: latest.value,
            dataUrl,
            generatedAt: latest.generatedAt,
        };
    }
    async getQrPng(scale) {
        this.ensureBaileysEnabled();
        const size = scale ? Number(scale) : 6;
        const buffer = await this.whatsappService.getLatestQrPng(size);
        if (!buffer) {
            return { status: "empty" };
        }
        return new common_1.StreamableFile(buffer);
    }
    ensureBaileysEnabled() {
        const provider = this.configService.get("WHATSAPP_PROVIDER");
        if (provider?.toLowerCase() === "wasender") {
            throw new common_1.NotFoundException();
        }
    }
};
exports.WhatsappController = WhatsappController;
__decorate([
    (0, common_1.Get)("qr"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "getQr", null);
__decorate([
    (0, common_1.Get)("qr.png"),
    (0, common_1.Header)("Content-Type", "image/png"),
    __param(0, (0, common_1.Query)("scale")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], WhatsappController.prototype, "getQrPng", null);
exports.WhatsappController = WhatsappController = __decorate([
    (0, common_1.Controller)("whatsapp"),
    __metadata("design:paramtypes", [whatsapp_service_1.WhatsappService,
        config_1.ConfigService])
], WhatsappController);
//# sourceMappingURL=whatsapp.controller.js.map