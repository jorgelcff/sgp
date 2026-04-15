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
exports.StateMachineService = void 0;
const common_1 = require("@nestjs/common");
const state_machine_types_1 = require("./state-machine.types");
const support_flow_1 = require("../flows/support.flow");
const finance_flow_1 = require("../flows/finance.flow");
const contract_flow_1 = require("../flows/contract.flow");
const payment_flow_1 = require("../flows/payment.flow");
let StateMachineService = class StateMachineService {
    constructor(supportFlow, financeFlow, contractFlow, paymentFlow) {
        this.supportFlow = supportFlow;
        this.financeFlow = financeFlow;
        this.contractFlow = contractFlow;
        this.paymentFlow = paymentFlow;
    }
    async handleInput(params) {
        const message = (params.payload.mensagem ?? "").trim();
        if (isExitMessage(message)) {
            return {
                nextState: state_machine_types_1.ChatState.ENCERRADO,
                context: params.context,
                responses: [
                    {
                        type: "text",
                        text: "Sessao encerrada. Envie qualquer mensagem para reabrir o menu.",
                    },
                ],
            };
        }
        if (params.state === state_machine_types_1.ChatState.ENCERRADO) {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                context: {},
                responses: this.mainMenu(),
            };
        }
        if (message === "0") {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                context: {},
                responses: this.mainMenu(),
            };
        }
        if ((params.payload.tipo === "image" || params.payload.tipo === "document") &&
            params.state !== state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE) {
            return {
                nextState: params.state,
                context: params.context,
                responses: [
                    {
                        type: "text",
                        text: "Imagem nao esperada. Digite 0️⃣ para voltar ao menu principal.",
                    },
                ],
            };
        }
        switch (params.state) {
            case state_machine_types_1.ChatState.MENU_PRINCIPAL:
                return this.handleMainMenu(message);
            case state_machine_types_1.ChatState.SUPORTE_MENU:
                return this.handleSupportMenu(message);
            case state_machine_types_1.ChatState.SUPORTE_LENTO_REINICIAR:
                return this.handleSupportLento(message);
            case state_machine_types_1.ChatState.SUPORTE_PEDIR_CPF:
                return this.handleSupportCpf(message);
            case state_machine_types_1.ChatState.FINANCEIRO_MENU:
                return this.handleFinanceMenu(message);
            case state_machine_types_1.ChatState.FINANCEIRO_PEDIR_CPF:
                return this.handleFinanceCpf(message);
            case state_machine_types_1.ChatState.FINANCEIRO_PROMESSA:
                return this.handleFinancePromessa(message);
            case state_machine_types_1.ChatState.CONTRATAR_MENU:
                return this.handleContractMenu(message);
            case state_machine_types_1.ChatState.CONTRATAR_PEDIR_DADOS:
                return this.handleContractForm(message);
            case state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE:
                return this.paymentFlow.handlePayment(params.payload, params.context);
            default:
                return {
                    nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                    context: {},
                    responses: this.mainMenu(),
                };
        }
    }
    handleMainMenu(message) {
        switch (message) {
            case "1":
                return {
                    nextState: state_machine_types_1.ChatState.SUPORTE_MENU,
                    responses: this.supportFlow.getSupportMenu(),
                };
            case "2":
                return {
                    nextState: state_machine_types_1.ChatState.FINANCEIRO_MENU,
                    responses: this.financeFlow.getFinanceMenu(),
                };
            case "3":
                return {
                    nextState: state_machine_types_1.ChatState.CONTRATAR_MENU,
                    responses: this.contractFlow.getContractMenu(),
                };
            case "4":
                return {
                    nextState: state_machine_types_1.ChatState.AGUARDANDO_COMPROVANTE,
                    context: {},
                    responses: [
                        {
                            type: "text",
                            text: "Para informar pagamento, envie seu CPF e depois o comprovante (imagem ou documento).",
                        },
                    ],
                };
            default:
                return {
                    nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                    responses: this.mainMenu(),
                };
        }
    }
    handleSupportMenu(message) {
        if (message === "1") {
            return {
                nextState: state_machine_types_1.ChatState.SUPORTE_LENTO_REINICIAR,
                responses: this.supportFlow.getReiniciarInstrucao(),
            };
        }
        return {
            nextState: state_machine_types_1.ChatState.SUPORTE_MENU,
            responses: this.supportFlow.getSupportMenu(),
        };
    }
    handleSupportLento(message) {
        if (message === "1") {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                responses: [
                    {
                        type: "text",
                        text: "Perfeito! Se precisar, estamos aqui.\n",
                    },
                    ...this.mainMenu(),
                ],
            };
        }
        if (message === "2") {
            return {
                nextState: state_machine_types_1.ChatState.SUPORTE_PEDIR_CPF,
                responses: [
                    {
                        type: "text",
                        text: "Informe o CPF do titular para abrir o protocolo.",
                    },
                ],
            };
        }
        return {
            nextState: state_machine_types_1.ChatState.SUPORTE_LENTO_REINICIAR,
            responses: this.supportFlow.getReiniciarInstrucao(),
        };
    }
    async handleSupportCpf(message) {
        const result = await this.supportFlow.handleSupportCpf(message);
        return {
            nextState: result.nextState,
            responses: [
                ...result.responses,
                ...(result.nextState === state_machine_types_1.ChatState.MENU_PRINCIPAL
                    ? this.mainMenu()
                    : []),
            ],
        };
    }
    handleFinanceMenu(message) {
        if (message === "1") {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                responses: [
                    {
                        type: "text",
                        text: "Registramos sua solicitacao. Nossa equipe financeira entrara em contato.",
                    },
                    ...this.mainMenu(),
                ],
            };
        }
        if (message === "2") {
            return {
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PEDIR_CPF,
                responses: this.financeFlow.getCpfRequest(),
            };
        }
        if (message === "3") {
            return {
                nextState: state_machine_types_1.ChatState.FINANCEIRO_PROMESSA,
                responses: this.financeFlow.getPromessaPrompt(),
            };
        }
        return {
            nextState: state_machine_types_1.ChatState.FINANCEIRO_MENU,
            responses: this.financeFlow.getFinanceMenu(),
        };
    }
    async handleFinanceCpf(message) {
        const result = await this.financeFlow.handleSecondCopyByCpf(message);
        return {
            nextState: result.nextState,
            responses: [
                ...result.responses,
                ...(result.nextState === state_machine_types_1.ChatState.MENU_PRINCIPAL
                    ? this.mainMenu()
                    : []),
            ],
        };
    }
    handleContract() {
        return {
            nextState: state_machine_types_1.ChatState.CONTRATAR_MENU,
            responses: this.contractFlow.getContractMenu(),
        };
    }
    async handleFinancePromessa(message) {
        const result = await this.financeFlow.handlePromessa(message);
        return {
            nextState: result.nextState,
            responses: [
                ...result.responses,
                ...(result.nextState === state_machine_types_1.ChatState.MENU_PRINCIPAL
                    ? this.mainMenu()
                    : []),
            ],
        };
    }
    handleContractMenu(message) {
        if (message === "1") {
            return {
                nextState: state_machine_types_1.ChatState.CONTRATAR_PEDIR_DADOS,
                responses: this.contractFlow.getPreCadastroPrompt(),
            };
        }
        if (message === "2") {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                responses: [
                    {
                        type: "text",
                        text: "Sem problemas. Envie suas duvidas aqui e nossa equipe retorna. Digite 0️⃣ para voltar ao menu principal.",
                    },
                    ...this.mainMenu(),
                ],
            };
        }
        if (message === "0") {
            return {
                nextState: state_machine_types_1.ChatState.MENU_PRINCIPAL,
                responses: this.mainMenu(),
            };
        }
        return {
            nextState: state_machine_types_1.ChatState.CONTRATAR_MENU,
            responses: this.contractFlow.getContractMenu(),
        };
    }
    async handleContractForm(message) {
        const result = await this.contractFlow.handlePreCadastroSubmission(message);
        return {
            nextState: result.nextState,
            responses: [
                ...result.responses,
                ...(result.nextState === state_machine_types_1.ChatState.MENU_PRINCIPAL
                    ? this.mainMenu()
                    : []),
            ],
        };
    }
    mainMenu() {
        return [
            {
                type: "text",
                text: "Ola, eu sou o assistente virtual da RL LINK TELECOM 🤖\n" +
                    "Escolha a opcao desejada:\n" +
                    "1️⃣- Suporte 🪛\n" +
                    "2️⃣- Financeiro 💲\n" +
                    "3️⃣- Contratar 📝\n" +
                    "4️⃣- Informar pagamento 🧾\n" +
                    "Digite 0️⃣ para voltar ou 'sair' para encerrar.",
            },
        ];
    }
};
exports.StateMachineService = StateMachineService;
exports.StateMachineService = StateMachineService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [support_flow_1.SupportFlowService,
        finance_flow_1.FinanceFlowService,
        contract_flow_1.ContractFlowService,
        payment_flow_1.PaymentFlowService])
], StateMachineService);
function isExitMessage(value) {
    const normalized = value.trim().toLowerCase();
    return normalized === "sair" || normalized === "exit";
}
//# sourceMappingURL=state-machine.service.js.map