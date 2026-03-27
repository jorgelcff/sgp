import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { SgpService } from "../../sgp/infrastructure/sgp.service";
import {
  SgpCliente,
  SgpContatos,
  SgpContrato,
  SgpEndereco,
  SgpServico,
  SgpTitulo,
} from "../../sgp/domain/sgp.types";

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly limit = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sgpService: SgpService,
  ) {}

  async syncAll(): Promise<void> {
    this.logger.log("Iniciando sincronizacao paginada do SGP.");

    let offset = 0;
    let total = 0;

    do {
      const response = await this.sgpService.fetchClientsPage(
        offset,
        this.limit,
      );
      total = response.paginacao.total ?? 0;
      const clientes = response.clientes ?? [];

      this.logger.log(
        JSON.stringify({
          event: "sgp_page_fetched",
          offset,
          limit: this.limit,
          received: clientes.length,
          total,
        }),
      );

      for (const cliente of clientes) {
        try {
          await this.upsertCliente(cliente);
        } catch (error) {
          this.logger.error(
            JSON.stringify({
              event: "sgp_cliente_sync_failed",
              clienteId: cliente.id,
              error: getErrorMessage(error),
            }),
          );
        }
      }

      offset += this.limit;
    } while (offset < total);

    this.logger.log("Sincronizacao concluida.");
  }

  private async upsertCliente(cliente: SgpCliente): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const telefone = pickPrimaryPhone(cliente.contatos);

      await tx.cliente.upsert({
        where: { id: cliente.id },
        update: {
          nome: cliente.nome,
          tipo: cliente.tipo,
          cpfCnpj: cliente.cpfcnpj,
          sexo: cliente.sexo,
          dataNascimento: parseDate(cliente.dataNascimento),
          dataCadastro: parseDate(cliente.dataCadastro),
          status: cliente.status,
          telefone,
        },
        create: {
          id: cliente.id,
          nome: cliente.nome,
          tipo: cliente.tipo,
          cpfCnpj: cliente.cpfcnpj,
          sexo: cliente.sexo,
          dataNascimento: parseDate(cliente.dataNascimento),
          dataCadastro: parseDate(cliente.dataCadastro),
          status: cliente.status,
          telefone,
        },
      });

      if (cliente.endereco) {
        await upsertEndereco(tx, {
          clienteId: cliente.id,
          endereco: cliente.endereco,
        });
      }

      await upsertContatos(tx, cliente.id, cliente.contatos);

      for (const contrato of cliente.contratos ?? []) {
        await upsertContrato(tx, cliente.id, contrato);
      }

      for (const titulo of cliente.titulos ?? []) {
        await upsertTitulo(tx, cliente.id, titulo);
      }
    });
  }
}

async function upsertEndereco(
  tx: Prisma.TransactionClient,
  params: {
    clienteId?: number;
    contratoId?: number;
    servicoId?: number;
    endereco: SgpEndereco;
  },
): Promise<void> {
  const { endereco } = params;
  const data = {
    logradouro: endereco.logradouro,
    numero: endereco.numero !== undefined ? String(endereco.numero) : undefined,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf,
    cep: endereco.cep,
    complemento: endereco.complemento,
    latitude: endereco.latitude,
    longitude: endereco.longitude,
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

async function upsertContrato(
  tx: Prisma.TransactionClient,
  clienteId: number,
  contrato: SgpContrato,
): Promise<void> {
  await tx.contrato.upsert({
    where: { id: contrato.id },
    update: {
      clienteId,
      popId: contrato.pop_id,
      dataCadastro: parseDate(contrato.dataCadastro),
      status: contrato.status,
      motivoStatus: contrato.motivo_status,
      vencimento: contrato.vencimento,
      contratoCentralLogin: contrato.contratoCentralLogin,
      contratoCentralSenha: contrato.contratoCentralSenha,
    },
    create: {
      id: contrato.id,
      clienteId,
      popId: contrato.pop_id,
      dataCadastro: parseDate(contrato.dataCadastro),
      status: contrato.status,
      motivoStatus: contrato.motivo_status,
      vencimento: contrato.vencimento,
      contratoCentralLogin: contrato.contratoCentralLogin,
      contratoCentralSenha: contrato.contratoCentralSenha,
    },
  });

  if (contrato.endereco) {
    await upsertEndereco(tx, {
      contratoId: contrato.id,
      endereco: contrato.endereco,
    });
  }

  for (const servico of contrato.servicos ?? []) {
    await upsertServico(tx, contrato.id, servico);
  }
}

async function upsertServico(
  tx: Prisma.TransactionClient,
  contratoId: number,
  servico: SgpServico,
): Promise<void> {
  await tx.servico.upsert({
    where: { id: servico.id },
    update: {
      contratoId,
      tipo: servico.tipo,
      planoId: servico.plano?.id,
      planoDescricao: servico.plano?.descricao,
      status: servico.status,
      login: servico.login,
      senha: servico.senha,
      mac: servico.mac,
      ip: servico.ip,
      grupo: servico.grupo,
      wifiSsid: servico.wifi_ssid,
      wifiPassword: servico.wifi_password,
      wifiChannel: servico.wifi_channel,
      wifiSsid5: servico.wifi_ssid_5,
      wifiPassword5: servico.wifi_password_5,
      wifiChannel5: servico.wifi_channel_5,
    },
    create: {
      id: servico.id,
      contratoId,
      tipo: servico.tipo,
      planoId: servico.plano?.id,
      planoDescricao: servico.plano?.descricao,
      status: servico.status,
      login: servico.login,
      senha: servico.senha,
      mac: servico.mac,
      ip: servico.ip,
      grupo: servico.grupo,
      wifiSsid: servico.wifi_ssid,
      wifiPassword: servico.wifi_password,
      wifiChannel: servico.wifi_channel,
      wifiSsid5: servico.wifi_ssid_5,
      wifiPassword5: servico.wifi_password_5,
      wifiChannel5: servico.wifi_channel_5,
    },
  });

  if (servico.endereco) {
    await upsertEndereco(tx, {
      servicoId: servico.id,
      endereco: servico.endereco,
    });
  }
}

async function upsertTitulo(
  tx: Prisma.TransactionClient,
  clienteId: number,
  titulo: SgpTitulo,
): Promise<void> {
  await tx.titulo.upsert({
    where: { id: titulo.id },
    update: {
      clienteId,
      contratoId: titulo.clientecontrato_id ?? undefined,
      portador: titulo.portador,
      numeroDocumento: titulo.numeroDocumento,
      nossoNumero: titulo.nossoNumero,
      link: titulo.link,
      status: titulo.status ?? "aberto",
      valor: titulo.valor,
      valorJuros: titulo.valorJuros,
      valorMulta: titulo.valorMulta,
      valorDesconto: titulo.valorDesconto,
      valorCorrigido: titulo.valorCorrigido,
      valorPago: titulo.valorPago,
      jurosDia: titulo.jurosDia,
      multaDia: titulo.multaDia,
      diasAtraso: titulo.diasAtraso,
      codigoBarras: titulo.codigoBarras,
      linhaDigitavel: titulo.linhaDigitavel,
      codigoPix: titulo.codigoPix,
      dataEmissao: parseDate(titulo.dataEmissao),
      dataVencimento: parseDate(titulo.dataVencimento),
      dataPagamento: parseDate(titulo.dataPagamento),
      dataCancelamento: parseDate(titulo.dataCancelamento),
      demonstrativo: titulo.demonstrativo,
    },
    create: {
      id: titulo.id,
      clienteId,
      contratoId: titulo.clientecontrato_id ?? undefined,
      portador: titulo.portador,
      numeroDocumento: titulo.numeroDocumento,
      nossoNumero: titulo.nossoNumero,
      link: titulo.link,
      status: titulo.status ?? "aberto",
      valor: titulo.valor,
      valorJuros: titulo.valorJuros,
      valorMulta: titulo.valorMulta,
      valorDesconto: titulo.valorDesconto,
      valorCorrigido: titulo.valorCorrigido,
      valorPago: titulo.valorPago,
      jurosDia: titulo.jurosDia,
      multaDia: titulo.multaDia,
      diasAtraso: titulo.diasAtraso,
      codigoBarras: titulo.codigoBarras,
      linhaDigitavel: titulo.linhaDigitavel,
      codigoPix: titulo.codigoPix,
      dataEmissao: parseDate(titulo.dataEmissao),
      dataVencimento: parseDate(titulo.dataVencimento),
      dataPagamento: parseDate(titulo.dataPagamento),
      dataCancelamento: parseDate(titulo.dataCancelamento),
      demonstrativo: titulo.demonstrativo,
    },
  });
}

async function upsertContatos(
  tx: Prisma.TransactionClient,
  clienteId: number,
  contatos?: SgpContatos,
): Promise<void> {
  if (!contatos) {
    return;
  }

  const data = normalizeContacts(contatos).map((value) => ({
    clienteId,
    tipo: value.tipo,
    valor: value.valor,
  }));

  if (data.length === 0) {
    return;
  }

  const unique = new Map<
    string,
    { clienteId: number; tipo: string; valor: string }
  >();
  for (const item of data) {
    unique.set(`${item.tipo}:${item.valor}`, item);
  }

  for (const item of unique.values()) {
    await tx.contato.upsert({
      where: {
        clienteId_tipo_valor: {
          clienteId: item.clienteId,
          tipo: item.tipo,
          valor: item.valor,
        },
      },
      update: {},
      create: item,
    });
  }
}

function normalizeContacts(
  contatos: SgpContatos,
): Array<{ tipo: string; valor: string }> {
  const entries: Array<{ tipo: string; valor: string }> = [];

  for (const telefone of contatos.telefones ?? []) {
    const normalized = normalizePhone(telefone);
    if (normalized) {
      entries.push({ tipo: "telefone", valor: normalized });
    }
  }

  for (const celular of contatos.celulares ?? []) {
    const normalized = normalizePhone(celular);
    if (normalized) {
      entries.push({ tipo: "celular", valor: normalized });
    }
  }

  for (const email of contatos.emails ?? []) {
    if (email) {
      entries.push({ tipo: "email", valor: email.trim().toLowerCase() });
    }
  }

  for (const outro of contatos.outros ?? []) {
    if (outro) {
      entries.push({ tipo: "outro", valor: outro.trim() });
    }
  }

  return entries;
}

function pickPrimaryPhone(contatos?: SgpContatos): string | null {
  if (!contatos) {
    return null;
  }

  const celular = contatos.celulares?.[0];
  if (celular) {
    return normalizePhone(celular);
  }

  const telefone = contatos.telefones?.[0];
  if (telefone) {
    return normalizePhone(telefone);
  }

  return null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
