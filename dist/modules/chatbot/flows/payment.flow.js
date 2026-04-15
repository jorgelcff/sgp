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
var PaymentFlowService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentFlowService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const state_machine_types_1 = require("../state-machine/state-machine.types");
let PaymentFlowService = PaymentFlowService_1 = class PaymentFlowService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PaymentFlowService_1.name);
    }
    async handlePayment(payload, context) {
        const nextContext = { ...context };
        const cpf = typeof nextContext.cpf === "string" ? nextContext.cpf : null;
        if (payload.tipo === "text") {
            if (!cpf) {
                const normalized = normalizeCpf(payload.mensagem ?? "");
                if (!normalized) {
                    return {
                        responses: [
                            {
                                type: "text",
                                text: "Informe um CPF valido para enviar o comprovante.\n" +
                                    "0️⃣ - Voltar ao menu\n" +
                                    "Digite 'sair' para encerrar.",
                            },
                        ],
                        nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
                        context: nextContext,
                    };
                }
                nextContext.cpf = normalized;
                return {
                    responses: [
                        {
                            type: "text",
                            text: "CPF registrado. Agora envie a imagem ou documento do comprovante.\n" +
                                "0️⃣ - Voltar ao menu\n" +
                                "Digite 'sair' para encerrar.",
                        },
                    ],
                    nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
                    context: nextContext,
                };
            }
            return {
                responses: [
                    {
                        type: "text",
                        text: "Envie a imagem ou documento do comprovante para finalizar.\n" +
                            "0️⃣ - Voltar ao menu\n" +
                            "Digite 'sair' para encerrar.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
                context: nextContext,
            };
        }
        if (payload.tipo === "image" || payload.tipo === "document") {
            if (!cpf) {
                return {
                    responses: [
                        {
                            type: "text",
                            text: "Antes, informe o CPF do titular.\n" +
                                "0️⃣ - Voltar ao menu\n" +
                                "Digite 'sair' para encerrar.",
                        },
                    ],
                    nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
                    context: nextContext,
                };
            }
            await this.prisma.mediaLog.create({
                data: {
                    telefone: payload.telefone,
                    tipo: payload.tipo,
                    mediaUrl: payload.mediaUrl ?? undefined,
                },
            });
            const cliente = await this.prisma.cliente.findFirst({
                where: { cpfCnpj: { contains: cpf } },
            });
            if (cliente) {
                this.logger.log(`Comprovante recebido para cliente ${cliente.id} CPF ${cpf}.`);
            }
            else {
                this.logger.warn(`Comprovante recebido sem cliente para CPF ${cpf}.`);
            }
            return {
                responses: [
                    {
                        type: "text",
                        text: "Comprovante recebido. Vamos analisar e retornar em breve.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                context: {},
            };
        }
        return {
            responses: [{ type: "text", text: "Tipo de mensagem nao suportado." }],
            nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
            context: nextContext,
        };
    }
};
exports.PaymentFlowService = PaymentFlowService;
exports.PaymentFlowService = PaymentFlowService = PaymentFlowService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PaymentFlowService);
function normalizeCpf(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 11) {
        return null;
    }
    return digits;
}
//# sourceMappingURL=payment.flow.js.map