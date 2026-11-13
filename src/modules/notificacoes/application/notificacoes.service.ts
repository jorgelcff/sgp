import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Diz se o aviso do dia ja esta resolvido para este titulo/categoria:
   * enviado, falha definitiva (ex.: numero sem WhatsApp) ou falha temporaria
   * que ja esgotou as tentativas. Falha temporaria abaixo do limite libera
   * nova tentativa na proxima execucao.
   *
   * Tambem considera registros criados desde o inicio do dia, para nao
   * reenviar caso a referencia tenha sido gravada com outro fuso.
   */
  async existsForSchedule(params: {
    tituloId: string;
    categoria: string;
    referenciaData: Date;
    maxTentativas: number;
  }): Promise<boolean> {
    const notificacoes = await this.prisma.notificacao.findMany({
      where: {
        tituloId: params.tituloId,
        categoria: params.categoria,
        OR: [
          { referenciaData: params.referenciaData },
          { createdAt: { gte: params.referenciaData } },
        ],
      },
      select: { status: true, tentativas: true },
    });

    return notificacoes.some(
      (notificacao) =>
        notificacao.status !== STATUS_ERRO ||
        notificacao.tentativas >= params.maxTentativas,
    );
  }

  async registerSent(params: {
    tituloId: string;
    clienteId: number;
    categoria: string;
    referenciaData: Date;
    mensagem: string;
  }): Promise<void> {
    // Upsert: pode existir um registro de erro do mesmo dia (nova tentativa).
    await this.prisma.notificacao.upsert({
      where: {
        tituloId_categoria_referenciaData: {
          tituloId: params.tituloId,
          categoria: params.categoria,
          referenciaData: params.referenciaData,
        },
      },
      update: {
        tentativas: { increment: 1 },
        status: STATUS_ENVIADO,
        mensagem: params.mensagem,
        enviadoEm: new Date(),
        ultimoErro: null,
      },
      create: {
        tituloId: params.tituloId,
        clienteId: params.clienteId,
        categoria: params.categoria,
        referenciaData: params.referenciaData,
        canal: "whatsapp",
        mensagem: params.mensagem,
        status: STATUS_ENVIADO,
        tentativas: 1,
        enviadoEm: new Date(),
      },
    });
  }

  async registerFailure(params: {
    tituloId: string;
    clienteId: number;
    categoria: string;
    referenciaData: Date;
    mensagem: string;
    error: string;
    // Falha definitiva (ex.: numero sem WhatsApp): nao tenta de novo no dia.
    permanente?: boolean;
  }): Promise<void> {
    const status = params.permanente ? STATUS_INVALIDO : STATUS_ERRO;
    await this.prisma.notificacao.upsert({
      where: {
        tituloId_categoria_referenciaData: {
          tituloId: params.tituloId,
          categoria: params.categoria,
          referenciaData: params.referenciaData,
        },
      },
      update: {
        tentativas: { increment: 1 },
        status,
        ultimoErro: params.error,
        mensagem: params.mensagem,
      },
      create: {
        tituloId: params.tituloId,
        clienteId: params.clienteId,
        categoria: params.categoria,
        referenciaData: params.referenciaData,
        canal: "whatsapp",
        mensagem: params.mensagem,
        status,
        tentativas: 1,
        ultimoErro: params.error,
      },
    });
  }
}

const STATUS_ENVIADO = "enviado";
const STATUS_ERRO = "erro";
const STATUS_INVALIDO = "invalido";
