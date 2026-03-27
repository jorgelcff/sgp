import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async existsForSchedule(params: {
    tituloId: number;
    categoria: string;
    referenciaData: Date;
  }): Promise<boolean> {
    const notificacao = await this.prisma.notificacao.findUnique({
      where: {
        tituloId_categoria_referenciaData: {
          tituloId: params.tituloId,
          categoria: params.categoria,
          referenciaData: params.referenciaData,
        },
      },
      select: { id: true },
    });

    return Boolean(notificacao);
  }

  async registerSent(params: {
    tituloId: number;
    clienteId: number;
    categoria: string;
    referenciaData: Date;
    mensagem: string;
  }): Promise<void> {
    await this.prisma.notificacao.create({
      data: {
        tituloId: params.tituloId,
        clienteId: params.clienteId,
        categoria: params.categoria,
        referenciaData: params.referenciaData,
        canal: "whatsapp",
        mensagem: params.mensagem,
        status: "enviado",
        tentativas: 1,
        enviadoEm: new Date(),
      },
    });
  }

  async registerFailure(params: {
    tituloId: number;
    clienteId: number;
    categoria: string;
    referenciaData: Date;
    mensagem: string;
    error: string;
  }): Promise<void> {
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
        status: "erro",
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
        status: "erro",
        tentativas: 1,
        ultimoErro: params.error,
      },
    });
  }
}
