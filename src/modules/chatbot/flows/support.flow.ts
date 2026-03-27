import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class SupportFlowService {
  private readonly logger = new Logger(SupportFlowService.name);

  constructor(private readonly prisma: PrismaService) {}

  getSupportMenu(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Suporte:\n" +
          "1️⃣ - Internet lenta\n" +
          "0️⃣ - Voltar ao menu principal\n" +
          "Digite 'sair' para encerrar.",
      },
    ];
  }

  getReiniciarInstrucao(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Vamos tentar reiniciar o roteador:\n" +
          "1️⃣ Desligue da tomada por 10 segundos\n" +
          "2️⃣ Ligue novamente e aguarde 2 minutos\n" +
          "Normalizou?\n1️⃣ - Sim\n2️⃣ - Nao\n" +
          "0️⃣ - Voltar ao menu\n" +
          "Digite 'sair' para encerrar.",
      },
    ];
  }

  async handleSupportCpf(
    cpfInput: string,
  ): Promise<{ responses: ChatResponse[]; nextState: ChatState }> {
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
            text:
              "Informe o CPF do titular para abrir o protocolo.\n" +
              "0️⃣ - Voltar ao menu\n" +
              "Digite 'sair' para encerrar.",
          },
        ],
        nextState: ChatState.SUPORTE_PEDIR_CPF,
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
            text:
              "Informe o CPF do titular para abrir o protocolo.\n" +
              "0️⃣ - Voltar ao menu\n" +
              "Digite 'sair' para encerrar.",
          },
        ],
        nextState: ChatState.SUPORTE_PEDIR_CPF,
      };
    }

    const protocolo = `OS-${Date.now()}`;
    this.logger.log(
      `Ordem de servico registrada para cliente ${cliente.id} CPF ${cpf}. Protocolo ${protocolo}.`,
    );

    return {
      responses: [
        {
          type: "text",
          text:
            `Protocolo gerado: ${protocolo}. ` +
            "Nossa equipe vai analisar e entrar em contato.",
        },
      ],
      nextState: ChatState.MENU_PRINCIPAL,
    };
  }
}

function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) {
    return null;
  }

  return digits;
}
