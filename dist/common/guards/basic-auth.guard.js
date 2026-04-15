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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let BasicAuthGuard = class BasicAuthGuard {
    constructor(configService) {
        this.configService = configService;
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        if (this.isValidWebhookSecret(request)) {
            return true;
        }
        const header = request.headers.authorization;
        if (!header || !header.toLowerCase().startsWith("basic ")) {
            throw new common_1.UnauthorizedException("Autenticacao necessaria.");
        }
        const encoded = header.slice(6).trim();
        const decoded = Buffer.from(encoded, "base64").toString("utf-8");
        const separatorIndex = decoded.indexOf(":");
        if (separatorIndex === -1) {
            throw new common_1.UnauthorizedException("Autenticacao invalida.");
        }
        const user = decoded.slice(0, separatorIndex);
        const pass = decoded.slice(separatorIndex + 1);
        const expectedUser = this.configService.get("SGP_USER");
        const expectedPass = this.configService.get("SGP_PASS");
        if (!expectedUser || !expectedPass) {
            throw new common_1.UnauthorizedException("Autenticacao nao configurada.");
        }
        if (user !== expectedUser || pass !== expectedPass) {
            throw new common_1.UnauthorizedException("Credenciais invalidas.");
        }
        return true;
    }
    isValidWebhookSecret(request) {
        const expected = this.configService.get("WASENDER_WEBHOOK_SECRET");
        if (!expected) {
            return false;
        }
        const isWhatsappWebhook = request.path?.startsWith("/webhook/whatsapp");
        if (!isWhatsappWebhook) {
            return false;
        }
        const headerSecret = request.headers["x-webhook-secret"];
        const querySecret = request.query?.secret;
        const received = Array.isArray(headerSecret)
            ? headerSecret[0]
            : headerSecret ??
                (Array.isArray(querySecret)
                    ? querySecret[0]
                    : querySecret);
        return Boolean(received && expected && received === expected);
    }
};
exports.BasicAuthGuard = BasicAuthGuard;
exports.BasicAuthGuard = BasicAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BasicAuthGuard);
//# sourceMappingURL=basic-auth.guard.js.map