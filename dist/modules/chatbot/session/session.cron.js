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
var SessionCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../database/prisma.service");
const whatsapp_adapter_service_1 = require("../whatsapp-adapter/whatsapp-adapter.service");
const SESSION_TTL_MS = 30 * 60 * 1000;
const WARNING_AFTER_MS = 30 * 60 * 1000;
const FINAL_NOTICE_AFTER_MS = 35 * 60 * 1000;
let SessionCron = SessionCron_1 = class SessionCron {
    constructor(prisma, whatsappAdapter) {
        this.prisma = prisma;
        this.whatsappAdapter = whatsappAdapter;
        this.logger = new common_1.Logger(SessionCron_1.name);
    }
    async handleNotifications() {
        const now = Date.now();
        await this.notifyWindow(now, WARNING_AFTER_MS, "warningSentAt", () => "Sua sessao vai expirar. Envie uma mensagem para continuar.");
        await this.notifyWindow(now, FINAL_NOTICE_AFTER_MS, "finalSentAt", () => "Sessao expirada. Envie uma mensagem para iniciar novamente.");
    }
    async notifyWindow(now, thresholdMs, flag, buildMessage) {
        const start = new Date(now - thresholdMs - 60 * 1000);
        const end = new Date(now - thresholdMs);
        const sessions = await this.prisma.session.findMany({
            where: {
                atualizadoEm: {
                    gte: start,
                    lte: end,
                },
            },
        });
        for (const session of sessions) {
            const context = parseContext(session.contexto);
            if (context[flag]) {
                continue;
            }
            try {
                await this.whatsappAdapter.sendResponses(session.telefone, [
                    { type: "text", text: buildMessage() },
                ]);
                context[flag] = new Date().toISOString();
                await this.prisma.session.update({
                    where: { id: session.id },
                    data: { contexto: JSON.stringify(context) },
                });
            }
            catch (error) {
                this.logger.warn(`Falha ao notificar sessao ${session.id}: ${getErrorMessage(error)}`);
            }
        }
    }
};
exports.SessionCron = SessionCron;
__decorate([
    (0, schedule_1.Cron)("*/1 * * * *"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionCron.prototype, "handleNotifications", null);
exports.SessionCron = SessionCron = SessionCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_adapter_service_1.WhatsappAdapterService])
], SessionCron);
function parseContext(value) {
    if (!value) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        return parsed ?? {};
    }
    catch {
        return {};
    }
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=session.cron.js.map