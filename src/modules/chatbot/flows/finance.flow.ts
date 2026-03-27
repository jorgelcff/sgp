import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class FinanceFlowService {
  constructor(private readonly prisma: PrismaService) {}

  getFinanceMenu(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Financeiro:\n" +
          "1️⃣ - Fatura errada\n" +
          "2️⃣ - Segunda via\n" +
          "3️⃣ - Desbloqueio 3 dias\n" +
          "0️⃣ - Voltar ao menu principal\n" +
          "Digite 'sair' para encerrar.",
      },
    ];
  }

  getCpfRequest(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Informe o CPF ou CNPJ do titular para localizar a fatura.\n" +
          "0️⃣ - Voltar ao menu\n" +
          "Digite 'sair' para encerrar.",
      },
    ];
  }

  async handleSecondCopyByCpf(
    cpfInput: string,
  ): Promise<{ responses: ChatResponse[]; nextState: ChatState }> {
    const digits = normalizeCpfCnpj(cpfInput);
    if (!digits) {
      return {
        responses: [
          {
            type: "text",
            text: "CPF ou CNPJ invalido. Digite apenas numeros.",
          },
        ],
        nextState: ChatState.FINANCEIRO_PEDIR_CPF,
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
        nextState: ChatState.FINANCEIRO_PEDIR_CPF,
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
        nextState: ChatState.MENU_PRINCIPAL,
      };
    }

    const valor = formatCurrency(titulo.valorCorrigido ?? titulo.valor ?? 0);
    const vencimento = titulo.dataVencimento
      ? formatDate(titulo.dataVencimento)
      : "data nao informada";

    const responses: ChatResponse[] = [
      {
        type: "text",
        text:
          `Segunda via encontrada. Vencimento: ${vencimento}\n` +
          `Valor: ${valor}`,
      },
      {
        type: "text",
        text: `Pix copia e cola:\n${titulo.codigoPix ?? "nao informado"}`,
      },
      {
        type: "text",
        text: `Codigo de barras:\n${titulo.codigoBarras ?? "nao informado"}`,
      },
    ];

    if (titulo.link) {
      responses.push({
        type: "text",
        text: `Link do boleto:\n${titulo.link}`,
      });
    }

    return {
      responses,
      nextState: ChatState.MENU_PRINCIPAL,
    };
  }
}

function normalizeCpfCnpj(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 || digits.length === 14) {
    return digits;
  }
  return null;
}

function formatCpfCnpj(digits: string): string | null {
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}
