import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { ChatbotService } from "./application/chatbot.service";
import { WebhookController } from "./webhook.controller";
import { SessionService } from "./session/session.service";
import { SessionController } from "./session/session.controller";
import { StateMachineService } from "./state-machine/state-machine.service";
import { SupportFlowService } from "./flows/support.flow";
import { FinanceFlowService } from "./flows/finance.flow";
import { ContractFlowService } from "./flows/contract.flow";
import { PaymentFlowService } from "./flows/payment.flow";
import { WhatsappAdapterService } from "./whatsapp-adapter/whatsapp-adapter.service";
import { SessionCron } from "./session/session.cron";
import { PlanosController } from "./planos/planos.controller";

@Module({
  imports: [WhatsappModule, HttpModule],
  controllers: [WebhookController, SessionController, PlanosController],
  providers: [
    ChatbotService,
    SessionService,
    StateMachineService,
    SupportFlowService,
    FinanceFlowService,
    ContractFlowService,
    PaymentFlowService,
    WhatsappAdapterService,
    SessionCron,
  ],
})
export class ChatbotModule {}
