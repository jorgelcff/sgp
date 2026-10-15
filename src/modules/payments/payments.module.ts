import { Module } from "@nestjs/common";
import { MkauthModule } from "../mkauth/mkauth.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { PagamentosService } from "./application/pagamentos.service";
import { PagamentosController } from "./pagamentos.controller";

@Module({
  imports: [MkauthModule, WhatsappModule],
  controllers: [PagamentosController],
  providers: [PagamentosService],
  exports: [PagamentosService],
})
export class PaymentsModule {}
