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
  MkauthTituloListResponse,
  MkauthTituloReceberPayload,
  MkauthTituloReceberResponse,
} from "../domain/mkauth.types";

const TOKEN_REFRESH_MARGIN_MS = 30_000;
const TOKEN_FALLBACK_TTL_MS = 5 * 60_000;

@Injectable()
export class MkauthService {
  private readonly logger = new Logger(MkauthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;

  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly httpService: HttpService,
    configService: ConfigService,
  ) {
    this.clientId = configService.get<string>("MKAUTH_CLIENT_ID") ?? "";
    this.clientSecret =
      configService.get<string>("MKAUTH_CLIENT_SECRET") ?? "";
  }

  async showCliente(login: string): Promise<MkauthCliente> {
    return this.request<MkauthCliente>({
      method: "GET",
      url: `/api/cliente/show/${login}`,
    });
  }

  async listClientes(
    pagina = 1,
    limite?: number,
  ): Promise<MkauthClienteListResponse> {
    const suffix = limite ? `&limite=${limite}` : "";
    return this.request<MkauthClienteListResponse>({
      method: "GET",
      url: `/api/cliente/listar/pagina=${pagina}${suffix}`,
    });
  }

  async inserirCliente(
    payload: MkauthClienteInsertPayload,
  ): Promise<MkauthClienteInsertResponse> {
    return this.request<MkauthClienteInsertResponse>({
      method: "POST",
      url: "/api/cliente/inserir",
      data: payload,
    });
  }

  async titulosAbertos(cpfCnpj: string): Promise<MkauthTituloListResponse> {
    return this.request<MkauthTituloListResponse>({
      method: "GET",
      url: `/api/titulo/aberto/${cpfCnpj}`,
    });
  }

  async titulosVencidos(cpfCnpj: string): Promise<MkauthTituloListResponse> {
    return this.request<MkauthTituloListResponse>({
      method: "GET",
      url: `/api/titulo/vencido/${cpfCnpj}`,
    });
  }

  async titulosPagos(loginOuNome: string): Promise<MkauthTituloListResponse> {
    return this.request<MkauthTituloListResponse>({
      method: "GET",
      url: `/api/titulo/pago/${loginOuNome}`,
    });
  }

  async receberTitulo(
    payload: MkauthTituloReceberPayload,
  ): Promise<MkauthTituloReceberResponse> {
    return this.request<MkauthTituloReceberResponse>({
      method: "PUT",
      url: "/api/titulo/receber",
      data: payload,
    });
  }

  async criarChamado(
    payload: MkauthChamadoInsertPayload,
  ): Promise<MkauthChamadoInsertResponse> {
    const response = await this.request<MkauthChamadoInsertResponse>({
      method: "POST",
      url: "/api/chamado/inserir",
      data: payload,
    });

    this.logger.log(
      `Chamado MK-Auth criado para login ${payload.login}. Protocolo=${response.chamado}.`,
    );

    return response;
  }

  async fecharChamado(
    payload: MkauthChamadoFecharPayload,
  ): Promise<MkauthChamadoStatusResponse> {
    return this.request<MkauthChamadoStatusResponse>({
      method: "PUT",
      url: "/api/chamado/fechar",
      data: payload,
    });
  }

  async listarChamados(pagina = 1): Promise<MkauthChamadoListResponse> {
    return this.request<MkauthChamadoListResponse>({
      method: "GET",
      url: `/api/chamado/listar/pagina=${pagina}`,
    });
  }

  async showChamado(chamado: string): Promise<MkauthChamado> {
    return this.request<MkauthChamado>({
      method: "GET",
      url: `/api/chamado/show/${chamado}`,
    });
  }

  async reabrirChamado(
    chamado: string,
  ): Promise<MkauthChamadoStatusResponse> {
    return this.request<MkauthChamadoStatusResponse>({
      method: "GET",
      url: `/api/chamado/reabrir/${chamado}`,
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.getToken();
      return true;
    } catch (error) {
      this.logger.warn(`Falha ao pingar MK-Auth: ${getErrorMessage(error)}`);
      return false;
    }
  }

  private async request<T>(
    config: AxiosRequestConfig,
    retryOn401 = true,
  ): Promise<T> {
    const token = await this.getToken();

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          ...config,
          headers: {
            ...config.headers,
            Authorization: `Bearer ${token}`,
          },
        }),
      );

      return response.data;
    } catch (error) {
      if (retryOn401 && isUnauthorized(error)) {
        this.token = null;
        return this.request<T>(config, false);
      }

      throw error;
    }
  }

  private async getToken(): Promise<string> {
    if (
      this.token &&
      Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS
    ) {
      return this.token;
    }

    const response = await firstValueFrom(
      this.httpService.get<unknown>("/api/", {
        auth: {
          username: this.clientId,
          password: this.clientSecret,
        },
      }),
    );

    const token = extractToken(response.data);
    if (!token) {
      throw new Error("MK-Auth nao retornou um token valido.");
    }

    this.token = token;
    this.tokenExpiresAt =
      decodeJwtExpiry(token) ?? Date.now() + TOKEN_FALLBACK_TTL_MS;

    return token;
  }
}

function extractToken(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const candidate = record.token ?? record.jwt ?? record.access_token;
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return null;
}

function decodeJwtExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { exp?: number };

    return typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 401
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
