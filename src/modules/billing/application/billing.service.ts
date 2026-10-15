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

  async runBilling(force = false): Promise<void> {
    const startedAt = Date.now();
    this.logger.log(
      `Iniciando rotina de cobranca. ${new Date().toISOString()}`,
    );

    if (!force && !isWithinBusinessHours(this.configService)) {
      this.logger.log(
        "Fora do horario configurado para cobranca. Execucao pulada.",
      );
      return;
    }

    const today = startOfDay(new Date());
    const windowEnd = addDays(today, 5);
    const overdueDays = Math.max(
      1,
      getNumberEnv(this.configService, "BILLING_OVERDUE_DAYS", 30),
    );
    const overdueStart = addDays(today, -overdueDays);

    await this.logStaleTitulos(overdueStart);

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
        contrato: {
          select: { id: true, status: true },
        },
      },
      orderBy: { dataVencimento: "asc" },
    });

    this.logger.log(`Titulos em aberto encontrados: ${titulos.length}.`);

    type Eligivel = {
      titulo: (typeof titulos)[number];
      schedule: { category: string };
      daysDiff: number;
    };

    const elegiveis: Eligivel[] = [];

    for (const titulo of titulos) {
      if (!isContractChargeable(titulo.contrato?.status)) {
        this.logger.log(
          `Titulo ${titulo.id} ignorado: contrato ${titulo.contratoId ?? "sem id"} com status nao elegivel (${titulo.contrato?.status ?? "nao informado"}).`,
        );
        continue;
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

      const alreadyNotified = await this.notificacoesService.existsForSchedule({
        tituloId: titulo.id,
        categoria: schedule.category,
        referenciaData: today,
      });
      if (alreadyNotified) {
        continue;
      }

      elegiveis.push({ titulo, schedule, daysDiff });
    }

    // Agrupa por cliente preservando a ordem de prioridade (vencimento mais antigo primeiro).
    const grupos = new Map<number, Eligivel[]>();
    const ordemClientes: number[] = [];
    for (const item of elegiveis) {
      const clienteId = item.titulo.clienteId;
      if (!grupos.has(clienteId)) {
        grupos.set(clienteId, []);
        ordemClientes.push(clienteId);
      }
      grupos.get(clienteId)!.push(item);
    }

    const maxPerRun = getNumberEnv(
      this.configService,
      "BILLING_MAX_PER_RUN",
      50,
    );
    const delayMs = getNumberEnv(this.configService, "BILLING_DELAY_MS", 1500);
    let sentCount = 0;
    const referenceDate = today;

    for (const clienteId of ordemClientes) {
      if (sentCount >= maxPerRun) {
        this.logger.warn(
          `Limite de envios por execucao atingido (${maxPerRun}).`,
        );
        break;
      }

      const itens = grupos.get(clienteId)!;
      const celular = await this.clientesService.getPrimaryMobile(clienteId);
      if (!celular) {
        for (const item of itens) {
          this.logger.warn(
            `Cliente ${clienteId} sem celular para titulo ${item.titulo.id}.`,
          );
        }
        continue;
      }

      const compact = itens.length > 1;
      const partes: string[] = [];
      const portalUrl = this.configService.get<string>("CUSTOMER_PORTAL_URL");

      if (compact) {
        const nome = toTitleCase(itens[0].titulo.cliente?.nome ?? "cliente");
        partes.push(
          `Ola ${nome}, voce tem ${itens.length} boletos pendentes:\n\n` +
            (portalUrl
              ? `Voce tambem pode acessar todas as suas faturas diretamente pela central do cliente informando seu CPF:\n${portalUrl}`
              : ""),
        );
      }

      const mensagensPorItem = itens.map((item) =>
        buildMessageParts({
          nome: item.titulo.cliente?.nome ?? "cliente",
          dataVencimento: item.titulo.dataVencimento,
          valorCorrigido: item.titulo.valorCorrigido ?? item.titulo.valor ?? 0,
          diasAtraso: Math.max(0, -item.daysDiff),
          diasParaVencer: Math.max(0, item.daysDiff),
          codigoPix: item.titulo.codigoPix ?? "",
          linhaDigitavel: item.titulo.linhaDigitavel ?? "",
          codigoBarras: item.titulo.codigoBarras ?? "",
          link: item.titulo.link ?? "",
          portalUrl: portalUrl ?? "",
          compact,
        }),
      );

      for (const messages of mensagensPorItem) {
        partes.push(
          messages.main,
          messages.pixLabel ?? "",
          messages.pixCodigo ?? "",
          messages.linhaDigitavelLabel ?? "",
          messages.linhaDigitavelCodigo ?? "",
          messages.codigoBarrasLabel ?? "",
          messages.codigoBarrasCodigo ?? "",
          messages.linkBoleto ?? "",
        );
      }

      try {
        await this.whatsappQueue.sendTexts(celular, partes, "low");
        for (let i = 0; i < itens.length; i += 1) {
          const item = itens[i];
          const messages = mensagensPorItem[i];
          await this.notificacoesService.registerSent({
            tituloId: item.titulo.id,
            clienteId: item.titulo.clienteId,
            categoria: item.schedule.category,
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
        }
        sentCount += 1;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        this.logger.error(
          `Falha ao enviar WhatsApp para cliente ${clienteId}: ${errorMessage}`,
        );
        for (let i = 0; i < itens.length; i += 1) {
          const item = itens[i];
          const messages = mensagensPorItem[i];
          await this.notificacoesService.registerFailure({
            tituloId: item.titulo.id,
            clienteId: item.titulo.clienteId,
            categoria: item.schedule.category,
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
        }

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

  private async logStaleTitulos(overdueStart: Date): Promise<void> {
    const staleCount = await this.prisma.titulo.count({
      where: {
        status: "aberto",
        dataVencimento: { lt: overdueStart },
      },
    });

    if (staleCount > 0) {
      this.logger.warn(
        `${staleCount} titulo(s) com status "aberto" e vencimento anterior a ${overdueStart.toISOString().slice(0, 10)} (fora da janela de cobranca). Verifique no MK-Auth se devem ser marcados como pagos/cancelados.`,
      );
    }
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
  portalUrl: string;
  compact?: boolean;
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

  const portalNote = params.portalUrl
    ? `\n\nVoce tambem pode acessar todas as suas faturas diretamente pela central do cliente informando seu CPF:\n${params.portalUrl}`
    : "";

  const main = params.compact
    ? `📄 Boleto com vencimento em ${dataVencimento}, ${statusInfo}.\n` +
      `Valor atualizado: ${valor}`
    : `Ola ${nome}, seu boleto com vencimento em ${dataVencimento} ${statusInfo}.\n` +
      `Valor atualizado: ${valor}${portalNote}`;

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

const PRE_VENCIMENTO_DIAS = [5, 1, 0];
const POS_VENCIMENTO_DIAS = [1, 3, 7, 15, 30];

function buildSchedule(
  daysDiff: number,
  overdueDays: number,
): { category: string } | null {
  if (daysDiff >= 0) {
    if (PRE_VENCIMENTO_DIAS.includes(daysDiff)) {
      return { category: "pre-vencimento" };
    }
    return null;
  }

  const diasAtraso = Math.abs(daysDiff);
  if (diasAtraso > overdueDays) {
    return null;
  }

  if (POS_VENCIMENTO_DIAS.includes(diasAtraso) || diasAtraso === overdueDays) {
    return { category: "pos-vencimento" };
  }

  return null;
}

function isWithinBusinessHours(configService: ConfigService): boolean {
  const startHour = getNumberEnv(configService, "BILLING_HOUR_START", 8);
  const endHour = getNumberEnv(configService, "BILLING_HOUR_END", 20);
  const hour = new Date().getHours();
  return hour >= startHour && hour < endHour;
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

function isContractChargeable(contractStatus?: string | null): boolean {
  const normalized = normalizeStatus(contractStatus);
  if (!normalized) {
    return false;
  }

  const blockedPatterns = [
    "cancel",
    "inativ",
    "bloque",
    "suspens",
    "desabil",
  ];
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
