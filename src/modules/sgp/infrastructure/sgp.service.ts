import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { SgpClientesResponse } from "../domain/sgp.types";

@Injectable()
export class SgpService {
  private readonly logger = new Logger(SgpService.name);

  constructor(private readonly httpService: HttpService) {}

  async fetchClientsPage(
    offset: number,
    limit: number,
  ): Promise<SgpClientesResponse> {
    const response = await firstValueFrom(
      this.httpService.post<SgpClientesResponse>("/clientes", {
        offset,
        limit,
      }),
    );
    this.logger.log(
      `Requisicao SGP: offset=${offset}, limit=${limit}, status=${response.status}`,
    );

    return response.data;
  }

  async fetchPortador(): Promise<boolean> {
    const response = await firstValueFrom(
      this.httpService.get<object>("/portador", {}),
    );
    if (response.status === 200) {
      return true;
    }
    return false;
  }

  async ping(): Promise<boolean> {
    try {
      return await this.fetchPortador();
    } catch (error) {
      this.logger.warn(`Falha ao pingar SGP: ${getErrorMessage(error)}`);
      return false;
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
