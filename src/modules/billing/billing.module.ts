import { Module } from "@nestjs/common";
import { BillingService } from "./application/billing.service";
import { BillingController } from "./billing.controller";
import { ClientesModule } from "../clientes/clientes.module";
import { NotificacoesModule } from "../notificacoes/notificacoes.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { MkauthModule } from "../mkauth/mkauth.module";

@Module({
  imports: [ClientesModule, NotificacoesModule, WhatsappModule, MkauthModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
