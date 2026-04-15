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
exports.FinanceFlowService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const prisma_service_1 = require("../../../database/prisma.service");
const state_machine_types_1 = require("../state-machine/state-machine.types");
let FinanceFlowService = class FinanceFlowService {
    constructor(prisma, httpService, configService) {
        this.prisma = prisma;
        this.httpService = httpService;
        this.configService = configService;
    }
    getFinanceMenu() {
        return [
            {
                type: "text",
                text: "Financeiro:\n" +
                    "1️⃣ - Fatura errada\n" +
                    "2️⃣ - Segunda via\n" +
                    "3️⃣ - Desbloqueio 3 dias\n" +
                    "0️⃣ - Voltar ao menu principal\n" +
                    "Digite 'sair' para encerrar.",
            },
        ];
    }
    getCpfRequest() {
        return [
            {
                type: "text",
                text: "Informe o CPF ou CNPJ do titular para localizar a fatura.\n" +
                    "0️⃣ - Voltar ao menu\n" +
                    "Digite 'sair' para encerrar.",
            },
        ];
    }
    getPromessaPrompt() {
        return [
            {
                type: "text",
                text: "Para liberacao por promessa de pagamento, envie os dados neste formato:\n" +
                    "CPF/CNPJ: \n" +
                    "Senha da central: \n" +
                    "ID do contrato: \n" +
                    "\nDigite 0️⃣ para voltar ao menu principal.",
            },
        ];
    }
    async handleSecondCopyByCpf(cpfInput) {
        const digits = normalizeCpfCnpj(cpfInput);
        if (!digits) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "CPF ou CNPJ invalido. Digite apenas numeros.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PEDIR_CPF,
            };
        }
        const formatted = formatCpfCnpj(digits);
        const searchFilters = [
            { cpfCnpj: { contains: digits } },
            ...(formatted ? [{ cpfCnpj: { contains: formatted } }] : []),
        ];
        const cliente = await this.prisma.cliente.findFirst({
            where: { OR: searchFilters },
        });
        if (!cliente) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Nao encontrei seu cadastro. Verifique o CPF e tente novamente.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PEDIR_CPF,
            };
        }
        const titulo = await this.prisma.titulo.findFirst({
            where: {
                clienteId: cliente.id,
                status: "aberto",
            },
            orderBy: { dataVencimento: "desc" },
        });
        if (!titulo) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Nao encontrei titulos em aberto para este CPF.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
            };
        }
        const valor = formatCurrency(titulo.valorCorrigido ?? titulo.valor ?? 0);
        const vencimento = titulo.dataVencimento
            ? formatDate(titulo.dataVencimento)
            : "data nao informada";
        const responses = [
            {
                type: "text",
                text: `Segunda via encontrada. Vencimento: ${vencimento}\n` +
                    `Valor: ${valor}`,
            },
        ];
        if (titulo.codigoPix) {
            responses.push({ type: "text", text: `Pix copia e cola:` }, { type: "text", text: titulo.codigoPix });
        }
        if (titulo.linhaDigitavel) {
            responses.push({ type: "text", text: `Linha digitavel:` }, { type: "text", text: titulo.linhaDigitavel });
        }
        if (titulo.codigoBarras) {
            responses.push({ type: "text", text: `Codigo de barras:` }, { type: "text", text: titulo.codigoBarras });
        }
        if (titulo.link) {
            responses.push({
                type: "text",
                text: `Link do boleto:\n${titulo.link}`,
            });
        }
        return {
            responses,
            nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
        };
    }
    async handlePromessa(message) {
        const parsed = parsePromessa(message);
        const missing = requiredPromessa.filter((key) => !parsed[key]);
        if (missing.length > 0) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Faltaram campos: " + missing.join(", ") + ". Preencha todos.",
                    },
                    ...this.getPromessaPrompt(),
                ],
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PROMESSA,
            };
        }
        const url = this.getPromessaUrl();
        if (!url) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Servico indisponivel no momento. Tente mais tarde.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
            };
        }
        const payload = new URLSearchParams({
            cpfcnpj: parsed.cpf,
            senha: parsed.senha,
            contrato: String(parsed.contrato),
        });
        try {
            const response = await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, payload.toString(), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            }));
            const data = response.data;
            const liberado = data?.liberado === true;
            const protocolo = data?.protocolo ?? "-";
            const msg = data?.msg ?? "";
            return {
                responses: [
                    {
                        type: "text",
                        text: `Promessa registrada. Protocolo: ${protocolo}. ` +
                            (liberado
                                ? "Servico liberado."
                                : "Solicitacao recebida, aguarde confirmacao.") +
                            (msg ? `\n${msg}` : ""),
                    },
                ],
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
            };
        }
        catch (error) {
            const detail = extractError(error);
            return {
                responses: [
                    {
                        type: "text",
                        text: "Nao consegui processar agora. " +
                            (detail ? `Detalhe: ${detail}` : "Tente novamente mais tarde."),
                    },
                    ...this.getPromessaPrompt(),
                ],
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PROMESSA,
            };
        }
    }
    getPromessaUrl() {
        const direct = this.configService.get("SGP_PROMESSA_URL");
        if (direct)
            return direct;
        const base = this.configService.get("SGP_URL");
        if (!base)
            return null;
        // tentativa de derivar do SGP_URL
        const replaced = base.replace(/\/api\/ura\/?$/, "/api/central/promessapagamento/");
        return replaced || null;
    }
};
exports.FinanceFlowService = FinanceFlowService;
exports.FinanceFlowService = FinanceFlowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        axios_1.HttpService,
        config_1.ConfigService])
], FinanceFlowService);
const requiredPromessa = [
    "cpf",
    "senha",
    "contrato",
];
function parsePromessa(message) {
    const lines = message.split(/\r?\n/);
    const data = {};
    for (const line of lines) {
        const [rawKey, ...rest] = line.split(":");
        if (!rawKey || rest.length === 0)
            continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key.startsWith("cpf"))
            data.cpf = value.replace(/\D/g, "");
        if (key.startsWith("senha"))
            data.senha = value;
        if (key.includes("contrato")) {
            const num = Number(value.replace(/\D/g, ""));
            if (!Number.isNaN(num) && num > 0) {
                data.contrato = num;
            }
        }
    }
    return data;
}
function extractError(error) {
    const data = error?.response?.data;
    if (typeof data === "string")
        return data;
    return data?.message || data?.error || "";
}
function normalizeCpfCnpj(value) {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 11 || digits.length === 14) {
        return digits;
    }
    return null;
}
function formatCpfCnpj(digits) {
    if (digits.length === 11) {
        return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    }
    if (digits.length === 14) {
        return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return null;
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
//# sourceMappingURL=finance.flow.js.map