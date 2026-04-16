import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../database/prisma.service";
import { ClientesService } from "../../clientes/application/clientes.service";
import { NotificacoesService } from "../../notificacoes/application/notificacoes.service";
import { WhatsappQueueService } from "../../whatsapp/infrastructure/whatsapp-queue.service";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientesService: ClientesService,
    private readonly notificacoesService: NotificacoesService,
    private readonly whatsappQueue: WhatsappQueueService,
    private readonly configService: ConfigService,
  ) {}

  async runBilling(): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      `Iniciando rotina de cobranca. ${new Date().toISOString()}`,
    );

    const today = startOfDay(new Date());
    const windowEnd = addDays(today, 5);
    const overdueDays = Math.max(
      1,
      getNumberEnv(this.configService, "BILLING_OVERDUE_DAYS", 30),
    );
    const overdueStart = addDays(today, -overdueDays);

    const titulos = await this.prisma.titulo.findMany({
      where: {
        status: "aberto",
        dataVencimento: {
          gte: overdueStart,
          lte: windowEnd,
        },
      },
      include: {
        cliente: {
          select: { nome: true },
        },
      },
    });

    this.logger.log(`Titulos em aberto encontrados: ${titulos.length}.`);

    const maxPerRun = getNumberEnv(
      this.configService,
      "BILLING_MAX_PER_RUN",
      50,
    );
    const delayMs = getNumberEnv(this.configService, "BILLING_DELAY_MS", 1500);
    let sentCount = 0;

    for (const titulo of titulos) {
      if (sentCount >= maxPerRun) {
        this.logger.warn(
          `Limite de envios por execucao atingido (${maxPerRun}).`,
        );
        break;
      }
      const vencimento = titulo.dataVencimento
        ? startOfDay(titulo.dataVencimento)
        : null;
      if (!vencimento) {
        continue;
      }

      const daysDiff = diffInDays(vencimento, today);
      const schedule = buildSchedule(daysDiff, overdueDays);
      if (!schedule) {
        continue;
      }

      const referenceDate = today;
      const alreadyNotified = await this.notificacoesService.existsForSchedule({
        tituloId: titulo.id,
        categoria: schedule.category,
        referenciaData: referenceDate,
      });
      if (alreadyNotified) {
        continue;
      }

      const celular = await this.clientesService.getPrimaryMobile(
        titulo.clienteId,
      );
      if (!celular) {
        this.logger.warn(
          `Cliente ${titulo.clienteId} sem celular para titulo ${titulo.id}.`,
        );
        continue;
      }

      const messages = buildMessageParts({
        nome: titulo.cliente?.nome ?? "cliente",
        dataVencimento: titulo.dataVencimento,
        valorCorrigido: titulo.valorCorrigido ?? titulo.valor ?? 0,
        diasAtraso: Math.max(0, -daysDiff),
        diasParaVencer: Math.max(0, daysDiff),
        codigoPix: titulo.codigoPix ?? "",
        linhaDigitavel: titulo.linhaDigitavel ?? "",
        codigoBarras: titulo.codigoBarras ?? "",
        link: titulo.link ?? "",
      });

      try {
        await this.whatsappQueue.sendTexts(celular, [
          messages.main,
          messages.pixLabel ?? "",
          messages.pixCodigo ?? "",
          messages.linhaDigitavelLabel ?? "",
          messages.linhaDigitavelCodigo ?? "",
          messages.codigoBarrasLabel ?? "",
          messages.codigoBarrasCodigo ?? "",
          messages.linkBoleto ?? "",
        ]);
        await this.notificacoesService.registerSent({
          tituloId: titulo.id,
          clienteId: titulo.clienteId,
          categoria: schedule.category,
          referenciaData: referenceDate,
          mensagem: [
            messages.main,
            messages.pixLabel,
            messages.pixCodigo,
            messages.linhaDigitavelLabel,
            messages.linhaDigitavelCodigo,
            messages.codigoBarrasLabel,
            messages.codigoBarrasCodigo,
            messages.linkBoleto,
          ]
            .filter(Boolean)
            .join("\n\n"),
        });
        sentCount += 1;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.error(
          `Falha ao enviar WhatsApp para titulo ${titulo.id}: ${errorMessage}`,
        );
        await this.notificacoesService.registerFailure({
          tituloId: titulo.id,
          clienteId: titulo.clienteId,
          categoria: schedule.category,
          referenciaData: referenceDate,
          mensagem: [
            messages.main,
            messages.pixLabel,
            messages.pixCodigo,
            messages.linhaDigitavelLabel,
            messages.linhaDigitavelCodigo,
            messages.codigoBarrasLabel,
            messages.codigoBarrasCodigo,
            messages.linkBoleto,
          ]
            .filter(Boolean)
            .join("\n\n"),
          error: errorMessage,
        });

        if (isRateLimit(errorMessage)) {
          this.logger.warn(
            "Rate limit detectado. Encerrando cobranca para evitar bloqueio.",
          );
          break;
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(`Rotina de cobranca finalizada. Duracao=${durationMs}ms.`);
  }
}

function buildMessageParts(params: {
  nome: string;
  dataVencimento: Date | null;
  diasAtraso: number;
  diasParaVencer: number;
  valorCorrigido: number;
  codigoPix: string;
  linhaDigitavel: string;
  codigoBarras: string;
  link: string;
}): {
  main: string;
  pixLabel: string | null;
  pixCodigo: string | null;
  linhaDigitavelLabel: string | null;
  linhaDigitavelCodigo: string | null;
  codigoBarrasLabel: string | null;
  codigoBarrasCodigo: string | null;
  linkBoleto: string | null;
} {
  const dataVencimento = params.dataVencimento
    ? formatDate(params.dataVencimento)
    : "data nao informada";

  const valor = formatCurrency(params.valorCorrigido);

  const nome = toTitleCase(params.nome);

  const statusInfo =
    params.diasAtraso > 0
      ? `esta em atraso ha ${pluralizeDay(params.diasAtraso)}`
      : `vence em ${pluralizeDay(params.diasParaVencer)}`;

  const linhaDigitavel = params.linhaDigitavel.trim();
  const codigoBarras = params.codigoBarras.trim();
  const codigoPix = params.codigoPix.trim();
  const link = params.link.trim();

  const main =
    `Ola ${nome}, seu boleto com vencimento em ${dataVencimento} ${statusInfo}.\n` +
    `Valor atualizado: ${valor}\n\n` +
    `Voce tambem pode acessar todas as suas faturas diretamente pela central do cliente informando seu CPF:\n` +
    `https://telecomfibra.sgp.net.br/accounts/central/login`;

  return {
    main,
    pixLabel: codigoPix ? `Pix copia e cola:` : null,
    pixCodigo: codigoPix ? codigoPix : null,
    linhaDigitavelLabel: linhaDigitavel ? `Linha digitavel:` : null,
    linhaDigitavelCodigo: linhaDigitavel ? linhaDigitavel : null,
    codigoBarrasLabel: codigoBarras ? `Codigo de barras:` : null,
    codigoBarrasCodigo: codigoBarras ? codigoBarras : null,
    linkBoleto: link ? `Link do boleto:\n${link}` : null,
  };
}

function buildSchedule(
  daysDiff: number,
  overdueDays: number,
): { category: string } | null {
  if (daysDiff >= 0 && daysDiff <= 5) {
    return { category: "pre-vencimento" };
  }

  if (daysDiff < 0 && Math.abs(daysDiff) <= overdueDays) {
    return { category: "pos-vencimento" };
  }

  return null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNumberEnv(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(configService.get<string>(key));
  return Number.isNaN(value) ? fallback : value;
}

function isRateLimit(message: string): boolean {
  return message.includes("429") || message.toLowerCase().includes("rate");
}

function diffInDays(target: Date, base: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - base.getTime()) / msPerDay);
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

function pluralizeDay(value: number): string {
  if (value === 1) return "1 dia";
  return `${value} dias`;
}

function toTitleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ")
    .trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
