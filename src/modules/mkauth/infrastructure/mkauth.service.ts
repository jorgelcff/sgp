import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AxiosRequestConfig } from "axios";
import {
  MkauthChamado,
  MkauthChamadoFecharPayload,
  MkauthChamadoInsertPayload,
  MkauthChamadoInsertResponse,
  MkauthChamadoListResponse,
  MkauthChamadoStatusResponse,
  MkauthCliente,
  MkauthClienteInsertPayload,
  MkauthClienteInsertResponse,
  MkauthClienteListResponse,
  MkauthTitulo,
  MkauthTituloListResponse,
  MkauthTituloReceberPayload,
  MkauthTituloReceberResponse,
} from "../domain/mkauth.types";

@Injectable()
export class MkauthService {
  private readonly logger = new Logger(MkauthService.name);
  private readonly maxRateLimitRetries = 5;

  constructor(
    private readonly httpService: HttpService,
    _configService: ConfigService,
  ) {}

  async showCliente(id: string): Promise<MkauthCliente> {
    const response = await this.request<MklinkEnvelope<MklinkClient>>({
      method: "GET",
      url: `/clients/${encodeURIComponent(id)}`,
    });
    return normalizeClient(response.client ?? response, id);
  }

  async listClientes(
    pagina = 1,
    limite = 100,
  ): Promise<MkauthClienteListResponse> {
    const response = await this.request<MklinkClientListResponse>({
      method: "GET",
      url: "/clients",
      params: { page: pagina, per_page: limite },
    });
    const clients = response.clients ?? [];
    const perPage = response.per_page ?? limite;
    const total = response.total ?? clients.length;
    return {
      total_registros: total,
      consulta_atual: clients.length,
      pagina_atual: response.page ?? pagina,
      total_paginas: Math.max(1, Math.ceil(total / perPage)),
      clientes: clients.map((client) => normalizeClient(client)),
    };
  }

  async inserirCliente(
    payload: MkauthClienteInsertPayload,
  ): Promise<MkauthClienteInsertResponse> {
    const response = await this.request<MklinkEnvelope<MklinkClient>>({
      method: "POST",
      url: "/clients",
      data: {
        full_name: payload.nome,
        document: payload.cpf,
        email: payload.email,
        phone: payload.celular ?? payload.telefone,
        birth_date: payload.data_nasc,
        address: payload.endereco,
      },
    });
    return {
      status: "ok",
      mensagem: "Cliente criado no MKLink.",
      dados: payload,
    };
  }

  async listarTitulos(
    clienteId: number | string,
  ): Promise<MkauthTituloListResponse> {
    const response = await this.request<MklinkBillingListResponse>({
      method: "GET",
      url: "/billings",
      params: { client_id: clienteId, per_page: 100 },
    });
    return {
      Total: response.meta?.total ?? response.data?.length ?? 0,
      titulos: (response.data ?? []).map(normalizeInvoice),
    };
  }

  async listarCobrancas(
    pagina = 1,
    limite = 100,
  ): Promise<MkauthTituloListResponse & { total_paginas: number }> {
    const response = await this.request<MklinkBillingListResponse>({
      method: "GET",
      url: "/billings",
      params: { page: pagina, per_page: limite },
    });
    const total = response.meta?.total ?? response.data?.length ?? 0;
    return {
      Total: total,
      total_paginas: Math.max(1, Math.ceil(total / (response.meta?.per_page ?? limite))),
      titulos: (response.data ?? []).map(normalizeInvoice),
    };
  }

  async titulosAbertos(
    clienteId: number | string,
  ): Promise<MkauthTituloListResponse> {
    const response = await this.listarTitulos(clienteId);
    return { ...response, titulos: response.titulos.filter(isOpenTitle) };
  }

  async titulosVencidos(
    clienteId: number | string,
  ): Promise<MkauthTituloListResponse> {
    const response = await this.listarTitulos(clienteId);
    return {
      ...response,
      titulos: response.titulos.filter((titulo) =>
        ["overdue", "vencido"].includes(titulo.status.toLowerCase()),
      ),
    };
  }

  async receberTitulo(
    payload: MkauthTituloReceberPayload,
  ): Promise<MkauthTituloReceberResponse> {
    return this.request<MkauthTituloReceberResponse>({
      method: "POST",
      url: `/billings/${encodeURIComponent(payload.uuid)}/confirm`,
      data: {
        paid_amount: Number(payload.valor),
        paid_at: new Date().toISOString().slice(0, 10),
      },
    });
  }

  async obterPagamento(billingId: string): Promise<MklinkPayment> {
    const response = await this.request<MklinkPaymentEnvelope>({
      method: "GET",
      url: `/billings/${encodeURIComponent(billingId)}/payment`,
    });
    return response.data ?? response;
  }

  async criarChamado(
    payload: MkauthChamadoInsertPayload,
  ): Promise<MkauthChamadoInsertResponse> {
    const response = await this.request<MklinkTicketEnvelope>({
      method: "POST",
      url: "/tickets",
      data: payload,
    });
    const ticket = response.ticket ?? response;
    const protocolo = String(
      ticket.protocol ?? ticket.id ?? ticket.ticket_id ?? "",
    );
    this.logger.log(
      `Chamado MKLink criado para cliente ${payload.client_id ?? "nao informado"}. Protocolo=${protocolo}.`,
    );
    return {
      status: "ok",
      mensagem: "Chamado criado no MKLink.",
      chamado: protocolo,
      dados: payload,
    };
  }

  async fecharChamado(
    payload: MkauthChamadoFecharPayload,
  ): Promise<MkauthChamadoStatusResponse> {
    return this.request<MkauthChamadoStatusResponse>({
      method: "PATCH",
      url: `/tickets/${encodeURIComponent(payload.chamado)}`,
      data: { description: payload.motivo },
    });
  }

  async listarChamados(pagina = 1): Promise<MkauthChamadoListResponse> {
    return this.request<MkauthChamadoListResponse>({
      method: "GET",
      url: "/tickets",
      params: { page: pagina, per_page: 100 },
    });
  }

  async showChamado(chamado: string): Promise<MkauthChamado> {
    return this.request<MkauthChamado>({
      method: "GET",
      url: `/tickets/${encodeURIComponent(chamado)}`,
    });
  }

  async reabrirChamado(chamado: string): Promise<MkauthChamadoStatusResponse> {
    return this.request<MkauthChamadoStatusResponse>({
      method: "PATCH",
      url: `/tickets/${encodeURIComponent(chamado)}`,
      data: { status: "open" },
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.request({ method: "GET", url: "/me" });
      return true;
    } catch (error) {
      this.logger.warn(`Falha ao pingar MKLink: ${getErrorMessage(error)}`);
      return false;
    }
  }

  private async request<T>(
    config: AxiosRequestConfig,
    rateLimitRetry = 0,
  ): Promise<T> {
    try {
      const response = await firstValueFrom(
        this.httpService.request<T>(config),
      );
      return response.data;
    } catch (error) {
      if (
        getHttpStatus(error) === 429 &&
        rateLimitRetry < this.maxRateLimitRetries
      ) {
        const delayMs = getRetryDelayMs(error, rateLimitRetry);
        this.logger.warn(
          `Rate limit do MKLink em ${config.method ?? "GET"} ${config.url}. ` +
            `Nova tentativa em ${delayMs}ms (${rateLimitRetry + 1}/${this.maxRateLimitRetries}).`,
        );
        await sleep(delayMs);
        return this.request(config, rateLimitRetry + 1);
      }

      throw error;
    }
  }
}

type MklinkClient = Record<string, unknown>;
type MklinkEnvelope<T> = { client?: T } & T;
type MklinkClientListResponse = {
  total?: number;
  page?: number;
  per_page?: number;
  clients?: MklinkClient[];
};
type MklinkInvoiceListResponse = {
  total?: number;
  invoices?: Record<string, unknown>[];
};
type MklinkTicket = Record<string, unknown> & {
  id?: string | number;
  protocol?: string;
  ticket_id?: string | number;
};
type MklinkTicketEnvelope = MklinkTicket & { ticket?: MklinkTicket };

function normalizeClient(
  client: MklinkClient,
  requestedId?: string,
): MkauthCliente {
  const address =
    client.address && typeof client.address === "object"
      ? (client.address as Record<string, unknown>)
      : {};

  return {
    ...client,
    id: requestedId && /^\d+$/.test(requestedId)
      ? requestedId
      : String(client.id ?? client.client_id ?? ""),
    nome: String(client.full_name ?? client.name ?? ""),
    cpf_cnpj: String(client.document ?? ""),
    email: typeof client.email === "string" ? client.email : undefined,
    celular: String(client.phone ?? ""),
    nascimento: String(client.birth_date ?? ""),
    endereco: stringValue(address.address ?? client.address),
    numero: stringValue(address.numero ?? client.numero),
    complemento: stringValue(address.complemento ?? client.complemento),
    bairro: stringValue(address.bairro ?? client.bairro),
    cidade: stringValue(address.city ?? client.city),
    estado: stringValue(address.uf ?? client.uf),
    cep: stringValue(address.cep ?? client.cep),
    bloqueado: String(client.status ?? ""),
    cli_ativado: String(client.status ?? ""),
    login: String(client.pppoe_login ?? ""),
    senha: String(client.pppoe_password ?? ""),
    plano: String(client.plan_id ?? ""),
  };
}

function normalizeInvoice(invoice: Record<string, unknown>): MkauthTitulo {
  return {
    uuid: String(invoice.id ?? invoice.billing_id ?? invoice.invoice_id ?? ""),
    login: String(invoice.client_id ?? ""),
    status: normalizeInvoiceStatus(invoice.status),
    titulo: String(invoice.document_number ?? invoice.number ?? ""),
    valor: String(invoice.amount ?? invoice.value ?? ""),
    datavenc: String(invoice.due_date ?? ""),
    linhadig: stringValue(
      invoice.digitable_line ?? invoice.line ?? invoice.linha_digitavel,
    ),
    codigoBarras: stringValue(invoice.barcode ?? invoice.bar_code),
    pix: stringValue(invoice.pix_copy_paste ?? invoice.pix ?? invoice.pix_code),
    pix_link: stringValue(
      invoice.payment_url ?? invoice.gateway_url ?? invoice.link,
    ),
    link: stringValue(
      invoice.payment_url ??
        invoice.gateway_url ??
        invoice.pdf_url ??
        invoice.link,
    ),
  };
}

type MklinkBilling = Record<string, unknown> & {
  id?: string | number;
  client_id?: string | number;
};

type MklinkBillingListResponse = {
  data?: MklinkBilling[];
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
};
type MklinkPayment = {
  id?: string;
  payment_url?: string;
  barcode?: string;
  pix_code?: string;
};
type MklinkPaymentEnvelope = MklinkPayment & { data?: MklinkPayment };

function normalizeInvoiceStatus(value: unknown): string {
  const status = String(value ?? "").toLowerCase();
  if (["open", "pending", "overdue", "aberto", "vencido"].includes(status)) {
    return "aberto";
  }
  if (["paid", "confirmed", "pago"].includes(status)) {
    return "pago";
  }
  if (["canceled", "cancelled", "cancelado"].includes(status)) {
    return "cancelado";
  }
  return status;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string"
    ? value
    : value == null
      ? undefined
      : String(value);
}

function isOpenTitle(titulo: MkauthTitulo): boolean {
  return ["open", "pending", "overdue", "aberto", "vencido"].includes(
    titulo.status.toLowerCase(),
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getHttpStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

function getRetryDelayMs(error: unknown, retry: number): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const headers = (
      error as { response?: { headers?: Record<string, unknown> } }
    ).response?.headers;
    const retryAfter = headers?.["retry-after"];
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 120_000);
    }
  }

  return Math.min(5_000 * 2 ** retry, 120_000);
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
