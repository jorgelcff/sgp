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
var SupportFlowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportFlowService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../database/prisma.service");
const whatsapp_queue_service_1 = require("../../whatsapp/infrastructure/whatsapp-queue.service");
const state_machine_types_1 = require("../state-machine/state-machine.types");
let SupportFlowService = SupportFlowService_1 = class SupportFlowService {
    constructor(prisma, whatsappQueue, configService) {
        this.prisma = prisma;
        this.whatsappQueue = whatsappQueue;
        this.configService = configService;
        this.logger = new common_1.Logger(SupportFlowService_1.name);
    }
    getSupportMenu() {
        return [
            {
                type: "text",
                text: "Suporte:\n" +
                    "1️⃣ - Internet lenta\n" +
                    "0️⃣ - Voltar ao menu principal\n" +
                    "Digite 'sair' para encerrar.",
            },
        ];
    }
    getReiniciarInstrucao() {
        return [
            {
                type: "text",
                text: "Vamos tentar reiniciar o roteador:\n" +
                    "1️⃣ Desligue da tomada por 10 segundos\n" +
                    "2️⃣ Ligue novamente e aguarde 2 minutos\n" +
                    "Normalizou?\n1️⃣ - Sim\n2️⃣ - Nao\n" +
                    "0️⃣ - Voltar ao menu\n" +
                    "Digite 'sair' para encerrar.",
            },
        ];
    }
    async handleSupportCpf(cpfInput) {
        const cpf = normalizeCpf(cpfInput);
        if (!cpf) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "CPF invalido. Digite apenas numeros.",
                    },
                    {
                        type: "text",
                        text: "Informe o CPF do titular para abrir o protocolo.\n" +
                            "0️⃣ - Voltar ao menu\n" +
                            "Digite 'sair' para encerrar.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.SUPORTE_PEDIR_CPF,
            };
        }
        const cliente = await this.prisma.cliente.findFirst({
            where: { cpfCnpj: { contains: cpf } },
        });
        if (!cliente) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Nao encontrei seu cadastro. Verifique o CPF e tente novamente.",
                    },
                    {
                        type: "text",
                        text: "Informe o CPF do titular para abrir o protocolo.\n" +
                            "0️⃣ - Voltar ao menu\n" +
                            "Digite 'sair' para encerrar.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.SUPORTE_PEDIR_CPF,
            };
        }
        const protocolo = `OS-${Date.now()}`;
        this.logger.log(`Ordem de servico registrada para cliente ${cliente.id} CPF ${cpf}. Protocolo ${protocolo}.`);
        const notifyPhone = this.configService.get("SUPPORT_NOTIFY_PHONE");
        if (notifyPhone) {
            const notifyMsg = `Novo chamado aberto!\n` +
                `Protocolo: ${protocolo}\n` +
                `Cliente: ${cliente.nome ?? "nao informado"}\n` +
                `CPF: ${cpf}`;
            this.whatsappQueue.sendText(notifyPhone, notifyMsg).catch((err) => {
                this.logger.warn(`Falha ao notificar SUPPORT_NOTIFY_PHONE: ${err?.message ?? err}`);
            });
        }
        return {
            responses: [
                {
                    type: "text",
                    text: `Protocolo gerado: ${protocolo}. ` +
                        "Nossa equipe vai analisar e entrar em contato.",
                },
            ],
            nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
        };
    }
};
exports.SupportFlowService = SupportFlowService;
exports.SupportFlowService = SupportFlowService = SupportFlowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_queue_service_1.WhatsappQueueService,
        config_1.ConfigService])
], SupportFlowService);
function normalizeCpf(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 11) {
        return null;
    }
    return digits;
}
//# sourceMappingURL=support.flow.js.map