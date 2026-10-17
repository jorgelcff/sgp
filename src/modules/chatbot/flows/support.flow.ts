import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Contrato, Servico } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { WhatsappQueueService } from "../../whatsapp/infrastructure/whatsapp-queue.service";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class SupportFlowService {
  private readonly logger = new Logger(SupportFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappQueue: WhatsappQueueService,
    private readonly configService: ConfigService,
    private readonly mkauthService: MkauthService,
  ) {}

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
    telefone: string,
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

    const formatted = formatCpf(cpf);
    const searchFilters = [
      { cpfCnpj: { contains: cpf } },
      ...(formatted ? [{ cpfCnpj: { contains: formatted } }] : []),
    ];

    const cliente = await this.prisma.cliente.findFirst({
      where: { OR: searchFilters },
      include: {
        contratos: { include: { servicos: true } },
        contatos: true,
      },
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

    const email = cliente.contatos.find((c) => c.tipo === "email")?.valor;
    const protocolo = await this.abrirChamado({
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      contratos: cliente.contratos,
      email,
      telefone,
    });
    this.logger.log(
      `Ordem de servico registrada para cliente ${cliente.id} CPF ${cpf}. Protocolo ${protocolo}.`,
    );

    const notifyPhone = this.configService.get<string>("SUPPORT_NOTIFY_PHONE");
    if (notifyPhone) {
      const notifyMsg =
        `Novo chamado aberto!\n` +
        `Protocolo: ${protocolo}\n` +
        `Cliente: ${cliente.nome ?? "nao informado"}\n` +
        `CPF: ${cpf}`;
      this.whatsappQueue.sendText(notifyPhone, notifyMsg).catch((err) => {
        this.logger.warn(
          `Falha ao notificar SUPPORT_NOTIFY_PHONE: ${err?.message ?? err}`,
        );
      });
    }

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

  private async abrirChamado(params: {
    clienteId: number;
    clienteNome: string;
    contratos: (Contrato & { servicos: Servico[] })[];
    email?: string;
    telefone: string;
  }): Promise<string> {
    const fallbackProtocolo = `OS-${Date.now()}`;

    const contrato = pickContratoAtivo(params.contratos);
    try {
      const resposta = await this.mkauthService.criarChamado({
        title: "Internet lenta",
        description: `Cliente ${params.clienteNome} solicitou suporte pelo WhatsApp.`,
        client_id: String(params.clienteId),
        client_phone: params.telefone,
        priority: "medium",
        ticket_type: "connection",
      });

      if (resposta?.chamado) {
        return resposta.chamado;
      }

      this.logger.warn(
        `MKLink nao retornou numero de chamado para cliente ${params.clienteId}. Resposta: ${JSON.stringify(resposta)}.`,
      );
      return fallbackProtocolo;
    } catch (error) {
      this.logger.warn(
        `Falha ao abrir chamado no MKLink para cliente ${params.clienteId}: ${getErrorMessage(error)}`,
      );
      return fallbackProtocolo;
    }
  }
}

function pickContratoAtivo<T extends Contrato>(contratos: T[]): T | null {
  const ativo = contratos.find((contrato) => isContratoAtivo(contrato.status));
  return ativo ?? contratos[0] ?? null;
}

function isContratoAtivo(status?: string | null): boolean {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return false;
  }

  const blockedPatterns = ["cancel", "inativ", "bloque", "suspens", "desabil"];
  if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  const allowedPatterns = ["ativo", "habilit", "liber"];
  return allowedPatterns.some((pattern) => normalized.includes(pattern));
}

function normalizeStatus(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeCpf(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) {
    return null;
  }

  return digits;
}

function formatCpf(digits: string): string | null {
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return null;
}
