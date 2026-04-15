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
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const state_machine_types_1 = require("../state-machine/state-machine.types");
const SESSION_TTL_MS = 30 * 60 * 1000;
let SessionService = class SessionService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findOrCreate(telefone) {
        const existing = await this.prisma.session.findUnique({
            where: { telefone },
        });
        if (existing) {
            return existing;
        }
        return this.prisma.session.create({
            data: {
                telefone,
                estado: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                contexto: serializeContext({}),
            },
        });
    }
    async ensureActive(session) {
        const now = Date.now();
        const updatedAt = session.atualizadoEm.getTime();
        if (now - updatedAt <= SESSION_TTL_MS) {
            return session;
        }
        return this.prisma.session.update({
            where: { id: session.id },
            data: {
                estado: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                contexto: serializeContext({}),
            },
        });
    }
    async updateSession(params) {
        return this.prisma.session.update({
            where: { id: params.sessionId },
            data: {
                estado: params.estado,
                contexto: serializeContext(params.contexto ?? {}),
            },
        });
    }
    async listActive() {
        const cutoff = new Date(Date.now() - SESSION_TTL_MS);
        return this.prisma.session.findMany({
            where: {
                atualizadoEm: { gte: cutoff },
            },
            orderBy: { atualizadoEm: "desc" },
        });
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionService);
function serializeContext(context) {
    return JSON.stringify(context ?? {});
}
//# sourceMappingURL=session.service.js.map