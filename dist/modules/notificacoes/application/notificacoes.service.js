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
exports.NotificacoesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let NotificacoesService = class NotificacoesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async existsForSchedule(params) {
        const notificacao = await this.prisma.notificacao.findUnique({
            where: {
                tituloId_categoria_referenciaData: {
                    tituloId: params.tituloId,
                    categoria: params.categoria,
                    referenciaData: params.referenciaData,
                },
            },
            select: { id: true },
        });
        return Boolean(notificacao);
    }
    async registerSent(params) {
        await this.prisma.notificacao.create({
            data: {
                tituloId: params.tituloId,
                clienteId: params.clienteId,
                categoria: params.categoria,
                referenciaData: params.referenciaData,
                canal: "whatsapp",
                mensagem: params.mensagem,
                status: "enviado",
                tentativas: 1,
                enviadoEm: new Date(),
            },
        });
    }
    async registerFailure(params) {
        await this.prisma.notificacao.upsert({
            where: {
                tituloId_categoria_referenciaData: {
                    tituloId: params.tituloId,
                    categoria: params.categoria,
                    referenciaData: params.referenciaData,
                },
            },
            update: {
                tentativas: { increment: 1 },
                status: "erro",
                ultimoErro: params.error,
                mensagem: params.mensagem,
            },
            create: {
                tituloId: params.tituloId,
                clienteId: params.clienteId,
                categoria: params.categoria,
                referenciaData: params.referenciaData,
                canal: "whatsapp",
                mensagem: params.mensagem,
                status: "erro",
                tentativas: 1,
                ultimoErro: params.error,
            },
        });
    }
};
exports.NotificacoesService = NotificacoesService;
exports.NotificacoesService = NotificacoesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificacoesService);
//# sourceMappingURL=notificacoes.service.js.map