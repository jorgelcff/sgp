import { Injectable } from "@nestjs/common";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class FinanceFlowService {
  constructor(
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

    const cliente = await this.mkauthService.buscarClientePorDocumento(digits);

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

    // O MKLink devolve o id do cliente como UUID em /clients e aceita tanto o
    // UUID quanto o id numerico em /billings?client_id=. Nao converter para numero.
    const clienteId = String(cliente.id ?? "").trim();
    if (!clienteId) {
      return {
        responses: [
          {
            type: "text",
            text: "Encontrei seu cadastro, mas nao consegui localizar o identificador financeiro. Nossa equipe vai verificar.",
          },
        ],
        nextState: ChatState.MENU_PRINCIPAL,
      };
    }

    const titulos = await this.mkauthService.titulosAbertos(clienteId);
    const titulo = [...titulos.titulos].sort((a, b) =>
      (a.datavenc ?? "").localeCompare(b.datavenc ?? ""),
    )[0];

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

    const pagamento = await this.mkauthService
      .obterPagamento(titulo.uuid)
      .catch(() => null);
    const valor = formatCurrency(Number(titulo.valor ?? 0));
    const vencimento = formatDueDate(titulo.datavenc) ?? "data nao informada";

    const responses: ChatResponse[] = [
      {
        type: "text",
        text:
          `Segunda via encontrada. Vencimento: ${vencimento}\n` +
          `Valor: ${valor}`,
      },
    ];

    const codigoPix = pagamento?.pix_code ?? titulo.pix;
    const codigoBarras = pagamento?.barcode ?? titulo.codigoBarras;
    const link = pagamento?.payment_url ?? titulo.link;

    if (codigoPix) {
      responses.push(
        { type: "text", text: `Pix copia e cola:` },
        { type: "text", text: codigoPix },
      );
    }

    if (titulo.linhadig) {
      responses.push(
        { type: "text", text: `Linha digitavel:` },
        { type: "text", text: titulo.linhadig },
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// A API manda o vencimento como "YYYY-MM-DD". Formatar direto da string evita
// que o fuso do servidor desloque a data em um dia.
function formatDueDate(value?: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
