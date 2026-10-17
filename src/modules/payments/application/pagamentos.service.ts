import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma.service";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import { WhatsappQueueService } from "../../whatsapp/infrastructure/whatsapp-queue.service";

@Injectable()
export class PagamentosService {
  private readonly logger = new Logger(PagamentosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mkauthService: MkauthService,
    private readonly whatsappQueue: WhatsappQueueService,
    private readonly configService: ConfigService,
  ) {}

  async criarPendente(params: {
    clienteId: number;
    telefone: string;
    mediaUrl?: string | null;
  }): Promise<{ tituloEncontrado: boolean }> {
    const titulo = await this.prisma.titulo.findFirst({
      where: { clienteId: params.clienteId, status: "aberto" },
      orderBy: { dataVencimento: "asc" },
      include: { cliente: true },
    });

    if (!titulo) {
      return { tituloEncontrado: false };
    }

    const pendente = await this.prisma.pagamentoPendente.create({
      data: {
        clienteId: params.clienteId,
        tituloId: titulo.id,
        telefone: params.telefone,
        mediaUrl: params.mediaUrl ?? undefined,
        valor: titulo.valorCorrigido ?? titulo.valor ?? undefined,
      },
    });

    await this.notificarFinanceiro(pendente.id, titulo);

    return { tituloEncontrado: true };
  }

  async aprovar(id: string): Promise<string> {
    const pendente = await this.prisma.pagamentoPendente.findUnique({
      where: { id },
      include: { titulo: true, cliente: true },
    });

    if (!pendente) {
      return "Pagamento pendente nao encontrado.";
    }

    if (pendente.status !== "pendente") {
      return `Este pagamento ja foi ${pendente.status} anteriormente.`;
    }

    const valor = pendente.valor ?? pendente.titulo.valor ?? 0;

    try {
      await this.mkauthService.receberTitulo({
        uuid: pendente.tituloId,
        coletor: "WhatsApp",
        valor: valor.toFixed(2),
        forma: "outros",
      });

      await this.prisma.$transaction([
        this.prisma.pagamentoPendente.update({
          where: { id },
          data: { status: "aprovado", decididoEm: new Date() },
        }),
        this.prisma.titulo.update({
          where: { id: pendente.tituloId },
          data: {
            status: "pago",
            valorPago: valor,
            dataPagamento: new Date(),
          },
        }),
      ]);

      await this.whatsappQueue.sendText(
        pendente.telefone,
        "Recebemos a confirmacao do seu pagamento. Obrigado!",
      );

      this.logger.log(
        `Pagamento ${id} aprovado. Cobranca ${pendente.tituloId} confirmada no MKLink.`,
      );

      return `Pagamento aprovado e cobranca ${pendente.tituloId} confirmada no MKLink.`;
    } catch (error) {
      const message = getErrorMessage(error);
      await this.prisma.pagamentoPendente.update({
        where: { id },
        data: { erro: message },
      });

      this.logger.error(
        `Falha ao dar baixa no titulo ${pendente.tituloId} (pagamento ${id}): ${message}`,
      );

      return `Falha ao confirmar no MKLink: ${message}. O pagamento continua pendente, tente novamente.`;
    }
  }

  async rejeitar(id: string): Promise<string> {
    const pendente = await this.prisma.pagamentoPendente.findUnique({
      where: { id },
    });

    if (!pendente) {
      return "Pagamento pendente nao encontrado.";
    }

    if (pendente.status !== "pendente") {
      return `Este pagamento ja foi ${pendente.status} anteriormente.`;
    }

    await this.prisma.pagamentoPendente.update({
      where: { id },
      data: { status: "rejeitado", decididoEm: new Date() },
    });

    await this.whatsappQueue.sendText(
      pendente.telefone,
      "Nao conseguimos confirmar seu comprovante. Por favor, envie novamente ou fale com um atendente.",
    );

    return "Pagamento rejeitado. Cliente notificado.";
  }

  private async notificarFinanceiro(
    pendenteId: string,
    titulo: { valor: number | null; valorCorrigido: number | null; dataVencimento: Date | null; cliente: { nome: string; cpfCnpj: string | null } },
  ): Promise<void> {
    const notifyPhone = this.configService.get<string>(
      "PAYMENT_NOTIFY_PHONE",
    ) ?? this.configService.get<string>("SUPPORT_NOTIFY_PHONE");
    const baseUrl = this.configService.get<string>("APP_BASE_URL");

    if (!notifyPhone || !baseUrl) {
      this.logger.warn(
        "PAYMENT_NOTIFY_PHONE/APP_BASE_URL nao configurados. Aprovacao do pagamento precisa ser feita direto no banco/MK-Auth.",
      );
      return;
    }

    const valor = titulo.valorCorrigido ?? titulo.valor ?? 0;
    const vencimento = titulo.dataVencimento
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
          titulo.dataVencimento,
        )
      : "nao informado";

    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const aprovarUrl = `${cleanBase}/payments/${pendenteId}/aprovar`;
    const rejeitarUrl = `${cleanBase}/payments/${pendenteId}/rejeitar`;

    const mensagem =
      `Novo comprovante recebido!\n` +
      `Cliente: ${titulo.cliente.nome}\n` +
      `CPF/CNPJ: ${titulo.cliente.cpfCnpj ?? "nao informado"}\n` +
      `Valor esperado: ${formatCurrency(valor)}\n` +
      `Vencimento: ${vencimento}\n\n` +
      `Aprovar (baixa no MK-Auth): ${aprovarUrl}\n` +
      `Rejeitar: ${rejeitarUrl}`;

    await this.whatsappQueue.sendText(notifyPhone, mensagem).catch((err) => {
      this.logger.warn(
        `Falha ao notificar PAYMENT_NOTIFY_PHONE: ${getErrorMessage(err)}`,
      );
    });
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
