"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const sgp_service_1 = require("../../sgp/infrastructure/sgp.service");
let SyncService = SyncService_1 = class SyncService {
    constructor(prisma, sgpService) {
        this.prisma = prisma;
        this.sgpService = sgpService;
        this.logger = new common_1.Logger(SyncService_1.name);
        this.limit = 100;
    }
    async syncAll() {
        this.logger.log("Iniciando sincronizacao paginada do SGP.");
        let offset = 0;
        let total = 0;
        do {
            const response = await this.sgpService.fetchClientsPage(offset, this.limit);
            total = response.paginacao.total ?? 0;
            const clientes = response.clientes ?? [];
            this.logger.log(JSON.stringify({
                event: "sgp_page_fetched",
                offset,
                limit: this.limit,
                received: clientes.length,
                total,
            }));
            for (const cliente of clientes) {
                try {
                    await this.upsertCliente(cliente);
                }
                catch (error) {
                    this.logger.error(JSON.stringify({
                        event: "sgp_cliente_sync_failed",
                        clienteId: cliente.id,
                        error: getErrorMessage(error),
                    }));
                }
            }
            offset += this.limit;
        } while (offset < total);
        this.logger.log("Sincronizacao concluida.");
    }
    async upsertCliente(cliente) {
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
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        sgp_service_1.SgpService])
], SyncService);
async function upsertEndereco(tx, params) {
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
async function upsertContrato(tx, clienteId, contrato) {
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
async function upsertServico(tx, contratoId, servico) {
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
async function upsertTitulo(tx, clienteId, titulo) {
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
async function upsertContatos(tx, clienteId, contatos) {
    if (!contatos) {
        return;
    }
    const data = normalizeContacts(contatos).map((value) => ({
        clienteId,
        tipo: value.tipo,
        valor: value.valor,
    }));
    const unique = new Map();
    for (const item of data) {
        unique.set(`${item.tipo}:${item.valor}`, item);
    }
    const incoming = Array.from(unique.values());
    // Remove contacts that no longer exist in SGP so the bot never
    // reaches phone numbers that were deleted from the customer record.
    if (incoming.length > 0) {
        await tx.contato.deleteMany({
            where: {
                clienteId,
                NOT: {
                    OR: incoming.map((i) => ({ tipo: i.tipo, valor: i.valor })),
                },
            },
        });
    }
    else {
        await tx.contato.deleteMany({ where: { clienteId } });
    }
    for (const item of incoming) {
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
function normalizeContacts(contatos) {
    const entries = [];
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
function pickPrimaryPhone(contatos) {
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
function normalizePhone(phone) {
    return phone.replace(/\D/g, "");
}
function parseDate(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=sync.service.js.map