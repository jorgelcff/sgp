import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import {
  MkauthCliente,
  MkauthTitulo,
} from "../../mkauth/domain/mkauth.types";

const PAGE_SIZE = 100;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mkauthService: MkauthService,
  ) {}

  async syncAll(): Promise<void> {
    this.logger.log("Iniciando sincronizacao paginada do MKLink.");

    let pagina = 1;
    let totalPaginas = 1;
    let totalClientes = 0;
    const clientesProcessados = new Set<number>();

    do {
      const response = await this.mkauthService.listarCobrancas(
        pagina,
        PAGE_SIZE,
      );
      const clientIds = new Set(
        response.titulos
          .map((titulo) => Number(titulo.login))
          .filter((id) => Number.isInteger(id) && id > 0),
      );
      totalPaginas = response.total_paginas || 1;

      this.logger.log(
        JSON.stringify({
          event: "mklink_billings_page_fetched",
          pagina,
          totalPaginas,
          received: response.titulos.length,
        }),
      );

      for (const clientId of clientIds) {
        if (clientesProcessados.has(clientId)) {
          continue;
        }
        try {
          const cliente = await this.mkauthService.showCliente(String(clientId));
          await this.syncCliente(cliente);
          clientesProcessados.add(clientId);
          totalClientes += 1;
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: "mklink_cliente_sync_failed",
              clientId,
              error: getErrorMessage(error),
            }),
          );
        }
      }

      pagina += 1;
    } while (pagina <= totalPaginas);

    this.logger.log(
      `Sincronizacao concluida. Clientes processados: ${totalClientes}.`,
    );
  }

  private async syncCliente(cliente: MkauthCliente): Promise<void> {
    const id = Number(cliente.id);
    if (!Number.isFinite(id)) {
      this.logger.warn(
        `Cliente MK-Auth sem id numerico valido (login=${cliente.login}). Ignorado.`,
      );
      return;
    }

    const status = computeStatus(cliente);
    const telefone = normalizePhone(cliente.celular) ?? normalizePhone(cliente.fone);

    await this.prisma.$transaction(async (tx) => {
      await tx.cliente.upsert({
        where: { id },
        update: {
          nome: cliente.nome ?? "",
          tipo: cliente.pessoa ?? null,
          cpfCnpj: cliente.cpf_cnpj || null,
          dataNascimento: parseIsoDate(cliente.nascimento),
          dataCadastro: parseBrDate(cliente.cadastro),
          status,
          telefone,
        },
        create: {
          id,
          nome: cliente.nome ?? "",
          tipo: cliente.pessoa ?? null,
          cpfCnpj: cliente.cpf_cnpj || null,
          dataNascimento: parseIsoDate(cliente.nascimento),
          dataCadastro: parseBrDate(cliente.cadastro),
          status,
          telefone,
        },
      });

      await upsertEndereco(tx, { clienteId: id, cliente });

      // Contrato/Servico sao sinteticos: o MK-Auth modela 1 login = 1 plano,
      // sem a hierarquia cliente->contrato->servico que o SGP tinha.
      await tx.contrato.upsert({
        where: { id },
        update: {
          clienteId: id,
          status,
          contratoCentralLogin: cliente.login || null,
          contratoCentralSenha: cliente.senha || null,
        },
        create: {
          id,
          clienteId: id,
          status,
          contratoCentralLogin: cliente.login || null,
          contratoCentralSenha: cliente.senha || null,
        },
      });

      await upsertEndereco(tx, { contratoId: id, cliente });

      await tx.servico.upsert({
        where: { id },
        update: {
          contratoId: id,
          tipo: cliente.tipo || null,
          planoDescricao: cliente.plano || null,
          status,
          login: cliente.login || null,
          senha: cliente.senha || null,
          mac: cliente.mac || null,
          ip: cliente.ip || null,
        },
        create: {
          id,
          contratoId: id,
          tipo: cliente.tipo || null,
          planoDescricao: cliente.plano || null,
          status,
          login: cliente.login || null,
          senha: cliente.senha || null,
          mac: cliente.mac || null,
          ip: cliente.ip || null,
        },
      });

      await upsertEndereco(tx, { servicoId: id, cliente });

      await upsertContatos(tx, id, cliente);
    });

    await this.syncTitulos(id);
  }

  private async syncTitulos(clienteId: number): Promise<void> {
    const cobrancas = await this.mkauthService.listarTitulos(clienteId).catch(() => ({
      Total: 0,
      titulos: [] as MkauthTitulo[],
    }));

    const porUuid = new Map<string, MkauthTitulo>();
    for (const titulo of cobrancas.titulos ?? []) {
      if (titulo.uuid) {
        porUuid.set(titulo.uuid, titulo);
      }
    }

    for (const titulo of porUuid.values()) {
      await this.upsertTitulo(clienteId, titulo);
    }
  }

  private async upsertTitulo(
    clienteId: number,
    titulo: MkauthTitulo,
  ): Promise<void> {
    const status = titulo.status === "vencido" ? "aberto" : titulo.status;
    const numeroDocumento = titulo.titulo ? Number(titulo.titulo) : undefined;

    const data = {
      clienteId,
      contratoId: clienteId,
      status,
      valor: titulo.valor ? Number(titulo.valor) : undefined,
      numeroDocumento: Number.isFinite(numeroDocumento)
        ? numeroDocumento
        : undefined,
      linhaDigitavel: titulo.linhadig || undefined,
      codigoBarras: titulo.codigoBarras || undefined,
      codigoPix: titulo.pix || undefined,
      link: titulo.link || undefined,
      dataVencimento: parseSqlDate(titulo.datavenc),
    };

    await this.prisma.titulo.upsert({
      where: { id: titulo.uuid },
      update: data,
      create: { id: titulo.uuid, ...data },
    });
  }
}

async function upsertEndereco(
  tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
  params: {
    clienteId?: number;
    contratoId?: number;
    servicoId?: number;
    cliente: MkauthCliente;
  },
): Promise<void> {
  const { cliente } = params;
  if (!cliente.endereco && !cliente.cep) {
    return;
  }

  const [latitude, longitude] = splitCoordenadas(cliente.coordenadas);
  const data = {
    logradouro: cliente.endereco || null,
    numero: cliente.numero || null,
    bairro: cliente.bairro || null,
    cidade: cliente.cidade || null,
    uf: cliente.estado || null,
    cep: cliente.cep || null,
    complemento: cliente.complemento || null,
    latitude,
    longitude,
    clienteId: params.clienteId,
    contratoId: params.contratoId,
    servicoId: params.servicoId,
  };

  if (params.clienteId) {
    await tx.endereco.upsert({
      where: { clienteId: params.clienteId },
      update: data,
      create: data,
    });
  }

  if (params.contratoId) {
    await tx.endereco.upsert({
      where: { contratoId: params.contratoId },
      update: data,
      create: data,
    });
  }

  if (params.servicoId) {
    await tx.endereco.upsert({
      where: { servicoId: params.servicoId },
      update: data,
      create: data,
    });
  }
}

async function upsertContatos(
  tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
  clienteId: number,
  cliente: MkauthCliente,
): Promise<void> {
  const incoming: Array<{ tipo: string; valor: string }> = [];

  const celular = normalizePhone(cliente.celular);
  if (celular) {
    incoming.push({ tipo: "celular", valor: celular });
  }

  const fone = normalizePhone(cliente.fone);
  if (fone && fone !== celular) {
    incoming.push({ tipo: "telefone", valor: fone });
  }

  if (cliente.email) {
    incoming.push({ tipo: "email", valor: cliente.email.trim().toLowerCase() });
  }

  if (incoming.length > 0) {
    await tx.contato.deleteMany({
      where: {
        clienteId,
        NOT: {
          OR: incoming.map((i) => ({ tipo: i.tipo, valor: i.valor })),
        },
      },
    });
  } else {
    await tx.contato.deleteMany({ where: { clienteId } });
  }

  for (const item of incoming) {
    await tx.contato.upsert({
      where: {
        clienteId_tipo_valor: {
          clienteId,
          tipo: item.tipo,
          valor: item.valor,
        },
      },
      update: {},
      create: { clienteId, ...item },
    });
  }
}

function computeStatus(cliente: MkauthCliente): string {
  if (cliente.bloqueado === "sim") {
    return "bloqueado";
  }
  if (cliente.cli_ativado && cliente.cli_ativado !== "s") {
    return "inativo";
  }
  return "ativo";
}

function splitCoordenadas(
  value?: string | null,
): [string | undefined, string | undefined] {
  if (!value) {
    return [undefined, undefined];
  }
  const [latitude, longitude] = value.split(",").map((v) => v.trim());
  return [latitude || undefined, longitude || undefined];
}

function normalizePhone(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseSqlDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBrDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
