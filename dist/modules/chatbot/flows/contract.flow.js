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
exports.ContractFlowService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const state_machine_types_1 = require("../state-machine/state-machine.types");
let ContractFlowService = class ContractFlowService {
    constructor(configService, httpService) {
        this.configService = configService;
        this.httpService = httpService;
    }
    getContractMenu() {
        const imageUrl = this.configService.get("CHATBOT_PLAN_IMAGE_URL") ??
            this.buildLocalPlanImageUrl();
        const responses = [];
        if (imageUrl) {
            responses.push({
                type: "image",
                imageUrl,
                caption: "Confira nossos planos.",
            });
        }
        responses.push({
            type: "text",
            text: "Escolha uma opcao:\n" +
                "1️⃣ - Quero me cadastrar\n" +
                "2️⃣ - Tenho duvidas\n" +
                "0️⃣ - Voltar ao menu principal",
        });
        return responses;
    }
    getPreCadastroPrompt() {
        return [
            {
                type: "text",
                text: "Copie e preencha, depois envie aqui:\n" +
                    "Nome completo: \n" +
                    "CPF: \n" +
                    "Data de nascimento (AAAA-MM-DD): \n" +
                    "Endereco: \n" +
                    "Email: \n" +
                    "Telefone: \n" +
                    "\nDigite 0️⃣ para voltar ao menu principal.",
            },
        ];
    }
    async handlePreCadastroSubmission(message) {
        const parsed = parsePreCadastro(message);
        const missing = requiredFields.filter((field) => !parsed[field]);
        if (missing.length > 0) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Faltaram campos obrigatorios: " +
                            missing.join(", ") +
                            ". Preencha todos os campos no formato indicado.",
                    },
                    ...this.getPreCadastroPrompt(),
                ],
                nextState: state_machine_types_1.ChatState.CONTRATAR_PEDIR_DADOS,
            };
        }
        const normalizedDate = normalizeDate(parsed.datanasc);
        if (!normalizedDate) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Data de nascimento invalida. Use o formato AAAA-MM-DD ou DD/MM/AAAA.",
                    },
                    ...this.getPreCadastroPrompt(),
                ],
                nextState: state_machine_types_1.ChatState.CONTRATAR_PEDIR_DADOS,
            };
        }
        parsed.datanasc = normalizedDate;
        const url = this.configService.get("CHATBOT_PRECADASTRO_URL");
        const app = this.configService.get("CHATBOT_PRECADASTRO_APP");
        const token = this.configService.get("CHATBOT_PRECADASTRO_TOKEN");
        if (!url || !app || !token) {
            return {
                responses: [
                    {
                        type: "text",
                        text: "Pre-cadastro indisponivel. Fale com um atendente.",
                    },
                ],
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
            };
        }
        const payload = {
            app,
            token,
            nome: parsed.nome,
            cpfcnpj: parsed.cpf,
            email: parsed.email,
            celular: parsed.telefone,
            datanasc: parsed.datanasc,
            logradouro: parsed.endereco,
            numero: 0,
            complemento: "",
            bairro: "",
            cidade: "",
            cep: "",
            uf: "",
            pais: "BR",
            pontoreferencia: "",
        };
        try {
            await (0, rxjs_1.firstValueFrom)(this.httpService.post(url, payload));
            return {
                responses: [
                    {
                        type: "text",
                        text: "Pre-cadastro enviado com sucesso! Em breve entraremos em contato.",
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
                        text: "Nao consegui enviar o pre-cadastro agora. " +
                            (detail ? `Detalhe: ${detail}` : "Tente novamente mais tarde."),
                    },
                    ...this.getPreCadastroPrompt(),
                ],
                nextState: state_machine_types_1.ChatState.CONTRATAR_PEDIR_DADOS,
            };
        }
    }
    buildLocalPlanImageUrl() {
        const baseUrl = this.configService.get("APP_BASE_URL");
        if (!baseUrl) {
            return null;
        }
        const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBase}/assets/planos.jfif`;
    }
};
exports.ContractFlowService = ContractFlowService;
exports.ContractFlowService = ContractFlowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        axios_1.HttpService])
], ContractFlowService);
const requiredFields = [
    "nome",
    "cpf",
    "datanasc",
    "endereco",
    "email",
    "telefone",
];
function parsePreCadastro(input) {
    const lines = input.split(/\r?\n/);
    const data = {};
    for (const line of lines) {
        const [rawKey, ...rest] = line.split(":");
        if (!rawKey || rest.length === 0)
            continue;
        const key = rawKey.trim().toLowerCase();
        const value = rest.join(":").trim();
        if (key.startsWith("nome"))
            data.nome = value;
        if (key === "cpf")
            data.cpf = value.replace(/\D/g, "");
        if (key.includes("nascimento") || key === "data")
            data.datanasc = value;
        if (key.startsWith("endereco"))
            data.endereco = value;
        if (key === "email")
            data.email = value;
        if (key === "telefone" || key === "celular") {
            data.telefone = value.replace(/\D/g, "");
        }
    }
    return data;
}
function normalizeDate(value) {
    const trimmed = value.trim();
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const br = /^\d{2}\/\d{2}\/\d{4}$/;
    if (iso.test(trimmed)) {
        return trimmed;
    }
    if (br.test(trimmed)) {
        const [d, m, y] = trimmed.split("/");
        return `${y}-${m}-${d}`;
    }
    return null;
}
function extractError(error) {
    const data = error?.response?.data;
    if (typeof data === "string")
        return data;
    return data?.message || data?.error || "";
}
//# sourceMappingURL=contract.flow.js.map