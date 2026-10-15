import { Controller, Get, Param } from "@nestjs/common";
import { PagamentosService } from "./application/pagamentos.service";

@Controller("payments")
export class PagamentosController {
  constructor(private readonly pagamentosService: PagamentosService) {}

  @Get(":id/aprovar")
  async aprovar(@Param("id") id: string): Promise<{ status: string; mensagem: string }> {
    const mensagem = await this.pagamentosService.aprovar(id);
    return { status: "ok", mensagem };
  }

  @Get(":id/rejeitar")
  async rejeitar(@Param("id") id: string): Promise<{ status: string; mensagem: string }> {
    const mensagem = await this.pagamentosService.rejeitar(id);
    return { status: "ok", mensagem };
  }
}
