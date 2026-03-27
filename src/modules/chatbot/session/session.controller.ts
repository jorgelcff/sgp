import { Controller, Get } from "@nestjs/common";
import { SessionService } from "./session.service";

@Controller("sessions")
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get("active")
  async listActive(): Promise<
    Array<{ telefone: string; estado: string; atualizadoEm: Date }>
  > {
    const sessions = await this.sessionService.listActive();

    return sessions.map((session) => ({
      telefone: session.telefone,
      estado: session.estado,
      atualizadoEm: session.atualizadoEm,
    }));
  }
}
