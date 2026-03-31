import { Injectable } from "@nestjs/common";
import {
  ChatResponse,
  ChatState,
  StateMachineResult,
  WebhookPayload,
} from "./state-machine.types";
import { SupportFlowService } from "../flows/support.flow";
import { FinanceFlowService } from "../flows/finance.flow";
import { ContractFlowService } from "../flows/contract.flow";
import { PaymentFlowService } from "../flows/payment.flow";

@Injectable()
export class StateMachineService {
  constructor(
    private readonly supportFlow: SupportFlowService,
    private readonly financeFlow: FinanceFlowService,
    private readonly contractFlow: ContractFlowService,
    private readonly paymentFlow: PaymentFlowService,
  ) {}

  async handleInput(params: {
    state: ChatState;
    context: Record<string, unknown>;
    payload: WebhookPayload;
  }): Promise<StateMachineResult> {
    const message = (params.payload.mensagem ?? "").trim();

    if (isExitMessage(message)) {
      return {
        nextState: ChatState.ENCERRADO,
        context: params.context,
        responses: [
          {
            type: "text",
            text: "Sessao encerrada. Envie qualquer mensagem para reabrir o menu.",
          },
        ],
      };
    }

    if (params.state === ChatState.ENCERRADO) {
      return {
        nextState: ChatState.MENU_PRINCIPAL,
        context: {},
        responses: this.mainMenu(),
      };
    }

    if (message === "0") {
      return {
        nextState: ChatState.MENU_PRINCIPAL,
        context: {},
        responses: this.mainMenu(),
      };
    }

    if (
      (params.payload.tipo === "image" || params.payload.tipo === "document") &&
      params.state !== ChatState.AGUARDANDO_COMPROVANTE
    ) {
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
      case ChatState.MENU_PRINCIPAL:
        return this.handleMainMenu(message);
      case ChatState.SUPORTE_MENU:
        return this.handleSupportMenu(message);
      case ChatState.SUPORTE_LENTO_REINICIAR:
        return this.handleSupportLento(message);
      case ChatState.SUPORTE_PEDIR_CPF:
        return this.handleSupportCpf(message);
      case ChatState.FINANCEIRO_MENU:
        return this.handleFinanceMenu(message);
      case ChatState.FINANCEIRO_PEDIR_CPF:
        return this.handleFinanceCpf(message);
      case ChatState.FINANCEIRO_PROMESSA:
        return this.handleFinancePromessa(message);
      case ChatState.CONTRATAR_MENU:
        return this.handleContractMenu(message);
      case ChatState.CONTRATAR_PEDIR_DADOS:
        return this.handleContractForm(message);
      case ChatState.AGUARDANDO_COMPROVANTE:
        return this.paymentFlow.handlePayment(params.payload, params.context);
      default:
        return {
          nextState: ChatState.MENU_PRINCIPAL,
          context: {},
          responses: this.mainMenu(),
        };
    }
  }

  private handleMainMenu(message: string): StateMachineResult {
    switch (message) {
      case "1":
        return {
          nextState: ChatState.SUPORTE_MENU,
          responses: this.supportFlow.getSupportMenu(),
        };
      case "2":
        return {
          nextState: ChatState.FINANCEIRO_MENU,
          responses: this.financeFlow.getFinanceMenu(),
        };
      case "3":
        return {
          nextState: ChatState.CONTRATAR_MENU,
          responses: this.contractFlow.getContractMenu(),
        };
      case "4":
        return {
          nextState: ChatState.AGUARDANDO_COMPROVANTE,
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
          nextState: ChatState.MENU_PRINCIPAL,
          responses: this.mainMenu(),
        };
    }
  }

  private handleSupportMenu(message: string): StateMachineResult {
    if (message === "1") {
      return {
        nextState: ChatState.SUPORTE_LENTO_REINICIAR,
        responses: this.supportFlow.getReiniciarInstrucao(),
      };
    }

    return {
      nextState: ChatState.SUPORTE_MENU,
      responses: this.supportFlow.getSupportMenu(),
    };
  }

  private handleSupportLento(message: string): StateMachineResult {
    if (message === "1") {
      return {
        nextState: ChatState.MENU_PRINCIPAL,
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
        nextState: ChatState.SUPORTE_PEDIR_CPF,
        responses: [
          {
            type: "text",
            text: "Informe o CPF do titular para abrir o protocolo.",
          },
        ],
      };
    }

    return {
      nextState: ChatState.SUPORTE_LENTO_REINICIAR,
      responses: this.supportFlow.getReiniciarInstrucao(),
    };
  }

  private async handleSupportCpf(message: string): Promise<StateMachineResult> {
    const result = await this.supportFlow.handleSupportCpf(message);
    return {
      nextState: result.nextState,
      responses: [
        ...result.responses,
        ...(result.nextState === ChatState.MENU_PRINCIPAL
          ? this.mainMenu()
          : []),
      ],
    };
  }

  private handleFinanceMenu(message: string): StateMachineResult {
    if (message === "1") {
      return {
        nextState: ChatState.MENU_PRINCIPAL,
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
        nextState: ChatState.FINANCEIRO_PEDIR_CPF,
        responses: this.financeFlow.getCpfRequest(),
      };
    }

    if (message === "3") {
      return {
        nextState: ChatState.FINANCEIRO_PROMESSA,
        responses: this.financeFlow.getPromessaPrompt(),
      };
    }

    return {
      nextState: ChatState.FINANCEIRO_MENU,
      responses: this.financeFlow.getFinanceMenu(),
    };
  }

  private async handleFinanceCpf(message: string): Promise<StateMachineResult> {
    const result = await this.financeFlow.handleSecondCopyByCpf(message);
    return {
      nextState: result.nextState,
      responses: [
        ...result.responses,
        ...(result.nextState === ChatState.MENU_PRINCIPAL
          ? this.mainMenu()
          : []),
      ],
    };
  }

  private handleContract(): StateMachineResult {
    return {
      nextState: ChatState.CONTRATAR_MENU,
      responses: this.contractFlow.getContractMenu(),
    };
  }

  private async handleFinancePromessa(
    message: string,
  ): Promise<StateMachineResult> {
    const result = await this.financeFlow.handlePromessa(message);
    return {
      nextState: result.nextState,
      responses: [
        ...result.responses,
        ...(result.nextState === ChatState.MENU_PRINCIPAL
          ? this.mainMenu()
          : []),
      ],
    };
  }

  private handleContractMenu(message: string): StateMachineResult {
    if (message === "1") {
      return {
        nextState: ChatState.CONTRATAR_PEDIR_DADOS,
        responses: this.contractFlow.getPreCadastroPrompt(),
      };
    }

    if (message === "2") {
      return {
        nextState: ChatState.MENU_PRINCIPAL,
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
        nextState: ChatState.MENU_PRINCIPAL,
        responses: this.mainMenu(),
      };
    }

    return {
      nextState: ChatState.CONTRATAR_MENU,
      responses: this.contractFlow.getContractMenu(),
    };
  }

  private async handleContractForm(message: string): Promise<StateMachineResult> {
    const result = await this.contractFlow.handlePreCadastroSubmission(message);
    return {
      nextState: result.nextState,
      responses: [
        ...result.responses,
        ...(result.nextState === ChatState.MENU_PRINCIPAL
          ? this.mainMenu()
          : []),
      ],
    };
  }

  private mainMenu(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Ola, eu sou o assistente virtual da RL LINK TELECOM 🤖\n" +
          "Escolha a opcao desejada:\n" +
          "1️⃣- Suporte 🪛\n" +
          "2️⃣- Financeiro 💲\n" +
          "3️⃣- Contratar 📝\n" +
          "4️⃣- Informar pagamento 🧾\n" +
          "Digite 0️⃣ para voltar ou 'sair' para encerrar.",
      },
    ];
  }
}

function isExitMessage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "sair" || normalized === "exit";
}
