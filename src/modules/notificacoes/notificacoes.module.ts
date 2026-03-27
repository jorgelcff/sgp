import { Module } from "@nestjs/common";
import { NotificacoesService } from "./application/notificacoes.service";

@Module({
  providers: [NotificacoesService],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
