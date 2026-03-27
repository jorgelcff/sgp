import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrimaryMobile(clienteId: number): Promise<string | null> {
    const contato = await this.prisma.contato.findFirst({
      where: { clienteId, tipo: "celular" },
      orderBy: { id: "asc" },
    });

    if (contato) {
      return contato.valor;
    }

    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { telefone: true },
    });

    return cliente?.telefone ?? null;
  }
}
