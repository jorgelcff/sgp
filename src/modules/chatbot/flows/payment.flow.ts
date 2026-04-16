import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import {
  ChatResponse,
  ChatState,
  WebhookPayload,
} from "../state-machine/state-machine.types";

@Injectable()
export class PaymentFlowService {
  private readonly logger = new Logger(PaymentFlowService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handlePayment(
    payload: WebhookPayload,
    context: Record<string, unknown>,
  ): Promise<{
    responses: ChatResponse[];
    nextState: ChatState;
    context: Record<string, unknown>;
  }> {
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
                text:
                  "Informe um CPF valido para enviar o comprovante.\n" +
                  "0️⃣ - Voltar ao menu\n" +
                  "Digite 'sair' para encerrar.",
              },
            ],
            nextState: ChatState.AGUARDANDO_COMPROVANTE,
            context: nextContext,
          };
        }

        nextContext.cpf = normalized;
        return {
          responses: [
            {
              type: "text",
              text:
                "CPF registrado. Agora envie a imagem ou documento do comprovante.\n" +
                "0️⃣ - Voltar ao menu\n" +
                "Digite 'sair' para encerrar.",
            },
          ],
          nextState: ChatState.AGUARDANDO_COMPROVANTE,
          context: nextContext,
        };
      }

      return {
        responses: [
          {
            type: "text",
            text:
              "Envie a imagem ou documento do comprovante para finalizar.\n" +
              "0️⃣ - Voltar ao menu\n" +
              "Digite 'sair' para encerrar.",
          },
        ],
        nextState: ChatState.AGUARDANDO_COMPROVANTE,
        context: nextContext,
      };
    }

    if (payload.tipo === "image" || payload.tipo === "document") {
      if (!cpf) {
        return {
          responses: [
            {
              type: "text",
              text:
                "Antes, informe o CPF do titular.\n" +
                "0️⃣ - Voltar ao menu\n" +
                "Digite 'sair' para encerrar.",
            },
          ],
          nextState: ChatState.AGUARDANDO_COMPROVANTE,
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

      const formatted = formatCpf(cpf);
      const searchFilters = [
        { cpfCnpj: { contains: cpf } },
        ...(formatted ? [{ cpfCnpj: { contains: formatted } }] : []),
      ];

      const cliente = await this.prisma.cliente.findFirst({
        where: { OR: searchFilters },
      });

      if (cliente) {
        this.logger.log(
          `Comprovante recebido para cliente ${cliente.id} CPF ${cpf}.`,
        );
      } else {
        this.logger.warn(`Comprovante recebido sem cliente para CPF ${cpf}.`);
      }

      return {
        responses: [
          {
            type: "text",
            text: "Comprovante recebido. Vamos analisar e retornar em breve.",
          },
        ],
        nextState: ChatState.MENU_PRINCIPAL,
        context: {},
      };
    }

    return {
      responses: [{ type: "text", text: "Tipo de mensagem nao suportado." }],
      nextState: ChatState.AGUARDANDO_COMPROVANTE,
      context: nextContext,
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

function formatCpf(digits: string): string | null {
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return null;
}
