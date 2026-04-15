"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotModule = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("@nestjs/axios");
const whatsapp_module_1 = require("../whatsapp/whatsapp.module");
const chatbot_service_1 = require("./application/chatbot.service");
const webhook_controller_1 = require("./webhook.controller");
const session_service_1 = require("./session/session.service");
const session_controller_1 = require("./session/session.controller");
const state_machine_service_1 = require("./state-machine/state-machine.service");
const support_flow_1 = require("./flows/support.flow");
const finance_flow_1 = require("./flows/finance.flow");
const contract_flow_1 = require("./flows/contract.flow");
const payment_flow_1 = require("./flows/payment.flow");
const whatsapp_adapter_service_1 = require("./whatsapp-adapter/whatsapp-adapter.service");
const session_cron_1 = require("./session/session.cron");
const planos_controller_1 = require("./planos/planos.controller");
let ChatbotModule = class ChatbotModule {
};
exports.ChatbotModule = ChatbotModule;
exports.ChatbotModule = ChatbotModule = __decorate([
    (0, common_1.Module)({
        imports: [whatsapp_module_1.WhatsappModule, axios_1.HttpModule],
        controllers: [webhook_controller_1.WebhookController, session_controller_1.SessionController, planos_controller_1.PlanosController],
        providers: [
            chatbot_service_1.ChatbotService,
            session_service_1.SessionService,
            state_machine_service_1.StateMachineService,
            support_flow_1.SupportFlowService,
            finance_flow_1.FinanceFlowService,
            contract_flow_1.ContractFlowService,
            payment_flow_1.PaymentFlowService,
            whatsapp_adapter_service_1.WhatsappAdapterService,
            session_cron_1.SessionCron,
        ],
    })
], ChatbotModule);
//# sourceMappingURL=chatbot.module.js.map