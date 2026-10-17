import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma.service";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class FinanceFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mkauthService: MkauthService,
  ) {}

  getFinanceMenu(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Financeiro:\n" +
          "1️⃣ - Fatura errada\n" +
          "2️⃣ - Segunda via\n" +
          "0️⃣ - Voltar ao menu principal\n" +
          "Digite 'sair' para encerrar.",
      },
    ];
  }

  // Temporario enquanto a integracao com o MK Link nao esta pronta: em vez de
  // consultar titulo no banco local (fonte MK-Auth, sendo descontinuada),
  // libera so o link do portal com a senha inicial padrao.
  getPortalAccessInfo(): ChatResponse[] {
    const portalUrl = this.configService.get<string>("CUSTOMER_PORTAL_URL");

    return [
      {
        type: "text",
        text:
          "Acesse sua fatura e segunda via direto no portal do cliente:\n" +
          (portalUrl ?? "Portal indisponivel no momento.") +
          "\n\nSenha inicial de acesso: 12345678\n" +
          "Use seu CPF/CNPJ como login. Voce pode trocar a senha depois de entrar.",
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

    const pagamento = await this.mkauthService.obterPagamento(titulo.id).catch(() => null);
    const valor = formatCurrency(titulo.valorCorrigido ?? titulo.valor ?? 0);
    const vencimento = titulo.dataVencimento
      ? formatDate(titulo.dataVencimento)
      : "data nao informada";

    const portalUrl = this.configService.get<string>("CUSTOMER_PORTAL_URL");

    const responses: ChatResponse[] = [
      {
        type: "text",
        text:
          `Segunda via encontrada. Vencimento: ${vencimento}\n` +
          `Valor: ${valor}` +
          (portalUrl
            ? `\n\nVoce tambem pode acessar todas as suas faturas diretamente pela central do cliente informando seu CPF:\n${portalUrl}`
            : ""),
      },
    ];

    const codigoPix = pagamento?.pix_code ?? titulo.codigoPix;
    const codigoBarras = pagamento?.barcode ?? titulo.codigoBarras;
    const link = pagamento?.payment_url ?? titulo.link;

    if (codigoPix) {
      responses.push(
        { type: "text", text: `Pix copia e cola:` },
        { type: "text", text: codigoPix },
      );
    }

    if (titulo.linhaDigitavel) {
      responses.push(
        { type: "text", text: `Linha digitavel:` },
        { type: "text", text: titulo.linhaDigitavel },
      );
    }

    if (codigoBarras) {
      responses.push(
        { type: "text", text: `Codigo de barras:` },
        { type: "text", text: codigoBarras },
      );
    }

    if (link) {
      responses.push({
        type: "text",
        text: `Link do boleto:\n${link}`,
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
