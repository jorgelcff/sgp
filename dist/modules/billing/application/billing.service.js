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
var BillingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../database/prisma.service");
const clientes_service_1 = require("../../clientes/application/clientes.service");
const notificacoes_service_1 = require("../../notificacoes/application/notificacoes.service");
const whatsapp_queue_service_1 = require("../../whatsapp/infrastructure/whatsapp-queue.service");
let BillingService = BillingService_1 = class BillingService {
    constructor(prisma, clientesService, notificacoesService, whatsappQueue, configService) {
        this.prisma = prisma;
        this.clientesService = clientesService;
        this.notificacoesService = notificacoesService;
        this.whatsappQueue = whatsappQueue;
        this.configService = configService;
        this.logger = new common_1.Logger(BillingService_1.name);
    }
    async runBilling() {
        const startedAt = Date.now();
        this.logger.log(`Iniciando rotina de cobranca. ${new Date().toISOString()}`);
        const today = startOfDay(new Date());
        const windowEnd = addDays(today, 5);
        const overdueDays = Math.max(1, getNumberEnv(this.configService, "BILLING_OVERDUE_DAYS", 30));
        const overdueStart = addDays(today, -overdueDays);
        const titulos = await this.prisma.titulo.findMany({
            where: {
                status: "aberto",
                dataVencimento: {
                    gte: overdueStart,
                    lte: windowEnd,
                },
            },
            include: {
                cliente: {
                    select: { nome: true },
                },
            },
        });
        this.logger.log(`Titulos em aberto encontrados: ${titulos.length}.`);
        const maxPerRun = getNumberEnv(this.configService, "BILLING_MAX_PER_RUN", 50);
        const delayMs = getNumberEnv(this.configService, "BILLING_DELAY_MS", 1500);
        let sentCount = 0;
        for (const titulo of titulos) {
            if (sentCount >= maxPerRun) {
                this.logger.warn(`Limite de envios por execucao atingido (${maxPerRun}).`);
                break;
            }
            const vencimento = titulo.dataVencimento
                ? startOfDay(titulo.dataVencimento)
                : null;
            if (!vencimento) {
                continue;
            }
            const daysDiff = diffInDays(vencimento, today);
            const schedule = buildSchedule(daysDiff, overdueDays);
            if (!schedule) {
                continue;
            }
            const referenceDate = today;
            const alreadyNotified = await this.notificacoesService.existsForSchedule({
                tituloId: titulo.id,
                categoria: schedule.category,
                referenciaData: referenceDate,
            });
            if (alreadyNotified) {
                continue;
            }
            const celular = await this.clientesService.getPrimaryMobile(titulo.clienteId);
            if (!celular) {
                this.logger.warn(`Cliente ${titulo.clienteId} sem celular para titulo ${titulo.id}.`);
                continue;
            }
            const messages = buildMessageParts({
                nome: titulo.cliente?.nome ?? "cliente",
                dataVencimento: titulo.dataVencimento,
                valorCorrigido: titulo.valorCorrigido ?? titulo.valor ?? 0,
                diasAtraso: Math.max(0, -daysDiff),
                diasParaVencer: Math.max(0, daysDiff),
                codigoPix: titulo.codigoPix ?? "",
                linhaDigitavel: titulo.linhaDigitavel ?? "",
                codigoBarras: titulo.codigoBarras ?? "",
                link: titulo.link ?? "",
            });
            try {
                await this.whatsappQueue.sendTexts(celular, [
                    messages.main,
                    messages.pixLabel ?? "",
                    messages.pixCodigo ?? "",
                    messages.linhaDigitavelLabel ?? "",
                    messages.linhaDigitavelCodigo ?? "",
                    messages.codigoBarrasLabel ?? "",
                    messages.codigoBarrasCodigo ?? "",
                    messages.linkBoleto ?? "",
                ]);
                await this.notificacoesService.registerSent({
                    tituloId: titulo.id,
                    clienteId: titulo.clienteId,
                    categoria: schedule.category,
                    referenciaData: referenceDate,
                    mensagem: [
                        messages.main,
                        messages.pixLabel,
                        messages.pixCodigo,
                        messages.linhaDigitavelLabel,
                        messages.linhaDigitavelCodigo,
                        messages.codigoBarrasLabel,
                        messages.codigoBarrasCodigo,
                        messages.linkBoleto,
                    ]
                        .filter(Boolean)
                        .join("\n\n"),
                });
                sentCount += 1;
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            }
            catch (error) {
                const errorMessage = getErrorMessage(error);
                this.logger.error(`Falha ao enviar WhatsApp para titulo ${titulo.id}: ${errorMessage}`);
                await this.notificacoesService.registerFailure({
                    tituloId: titulo.id,
                    clienteId: titulo.clienteId,
                    categoria: schedule.category,
                    referenciaData: referenceDate,
                    mensagem: [
                        messages.main,
                        messages.pixLabel,
                        messages.pixCodigo,
                        messages.linhaDigitavelLabel,
                        messages.linhaDigitavelCodigo,
                        messages.codigoBarrasLabel,
                        messages.codigoBarrasCodigo,
                        messages.linkBoleto,
                    ]
                        .filter(Boolean)
                        .join("\n\n"),
                    error: errorMessage,
                });
                if (isRateLimit(errorMessage)) {
                    this.logger.warn("Rate limit detectado. Encerrando cobranca para evitar bloqueio.");
                    break;
                }
            }
        }
        const durationMs = Date.now() - startedAt;
        this.logger.log(`Rotina de cobranca finalizada. Duracao=${durationMs}ms.`);
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = BillingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        clientes_service_1.ClientesService,
        notificacoes_service_1.NotificacoesService,
        whatsapp_queue_service_1.WhatsappQueueService,
        config_1.ConfigService])
], BillingService);
function buildMessageParts(params) {
    const dataVencimento = params.dataVencimento
        ? formatDate(params.dataVencimento)
        : "data nao informada";
    const valor = formatCurrency(params.valorCorrigido);
    const nome = toTitleCase(params.nome);
    const statusInfo = params.diasAtraso > 0
        ? `esta em atraso ha ${pluralizeDay(params.diasAtraso)}`
        : `vence em ${pluralizeDay(params.diasParaVencer)}`;
    const linhaDigitavel = params.linhaDigitavel.trim();
    const codigoBarras = params.codigoBarras.trim();
    const codigoPix = params.codigoPix.trim();
    const link = params.link.trim();
    const main = `Ola ${nome}, seu boleto com vencimento em ${dataVencimento} ${statusInfo}.\n` +
        `Valor atualizado: ${valor}`;
    return {
        main,
        pixLabel: codigoPix ? `Pix copia e cola:` : null,
        pixCodigo: codigoPix ? codigoPix : null,
        linhaDigitavelLabel: linhaDigitavel ? `Linha digitavel:` : null,
        linhaDigitavelCodigo: linhaDigitavel ? linhaDigitavel : null,
        codigoBarrasLabel: codigoBarras ? `Codigo de barras:` : null,
        codigoBarrasCodigo: codigoBarras ? codigoBarras : null,
        linkBoleto: link ? `Link do boleto:\n${link}` : null,
    };
}
function buildSchedule(daysDiff, overdueDays) {
    if (daysDiff >= 0 && daysDiff <= 5) {
        return { category: "pre-vencimento" };
    }
    if (daysDiff < 0 && Math.abs(daysDiff) <= overdueDays) {
        return { category: "pos-vencimento" };
    }
    return null;
}
function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function endOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function getNumberEnv(configService, key, fallback) {
    const value = Number(configService.get(key));
    return Number.isNaN(value) ? fallback : value;
}
function isRateLimit(message) {
    return message.includes("429") || message.toLowerCase().includes("rate");
}
function diffInDays(target, base) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((target.getTime() - base.getTime()) / msPerDay);
}
function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
function formatDate(date) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
    }).format(date);
}
function pluralizeDay(value) {
    if (value === 1)
        return "1 dia";
    return `${value} dias`;
}
function toTitleCase(text) {
    return text
        .toLowerCase()
        .split(/\s+/)
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
        .join(" ")
        .trim();
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=billing.service.js.map