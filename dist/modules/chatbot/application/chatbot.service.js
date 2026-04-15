"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ChatbotService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotService = void 0;
const common_1 = require("@nestjs/common");
const session_service_1 = require("../session/session.service");
const state_machine_service_1 = require("../state-machine/state-machine.service");
const state_machine_types_1 = require("../state-machine/state-machine.types");
const whatsapp_adapter_service_1 = require("../whatsapp-adapter/whatsapp-adapter.service");
let ChatbotService = ChatbotService_1 = class ChatbotService {
    constructor(sessionService, stateMachine, whatsappAdapter) {
        this.sessionService = sessionService;
        this.stateMachine = stateMachine;
        this.whatsappAdapter = whatsappAdapter;
        this.logger = new common_1.Logger(ChatbotService_1.name);
        this.locks = new Map();
    }
    async handleWebhook(payload) {
        const telefone = normalizePhone(payload.telefone);
        await this.runLocked(telefone, async () => {
            const session = await this.sessionService.findOrCreate(telefone);
            const activeSession = await this.sessionService.ensureActive(session);
            const state = isChatState(activeSession.estado)
                ? activeSession.estado
                : state_machine_types_1.ChatState.MENU_PRINCIPAL;
            const context = parseContext(activeSession.contexto);
            const result = await this.stateMachine.handleInput({
                state,
                context,
                payload: { ...payload, telefone },
            });
            const nextContext = result.context ?? context;
            try {
                await this.whatsappAdapter.sendResponses(telefone, result.responses);
            }
            catch (error) {
                this.logger.warn(`Falha ao enviar respostas para ${telefone}: ${getErrorMessage(error)}. Mantendo estado ${state}.`);
                return;
            }
            await this.sessionService.updateSession({
                sessionId: activeSession.id,
                estado: result.nextState,
                contexto: nextContext,
            });
            this.logger.log(`Webhook processado para ${telefone}. Estado: ${result.nextState}.`);
        });
    }
    async runLocked(telefone, task) {
        const previous = this.locks.get(telefone) ?? Promise.resolve();
        const current = previous
            .catch(() => undefined)
            .then(task)
            .finally(() => {
            if (this.locks.get(telefone) === current) {
                this.locks.delete(telefone);
            }
        });
        this.locks.set(telefone, current);
        await current;
    }
};
exports.ChatbotService = ChatbotService;
exports.ChatbotService = ChatbotService = ChatbotService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [session_service_1.SessionService,
        state_machine_service_1.StateMachineService,
        whatsapp_adapter_service_1.WhatsappAdapterService])
], ChatbotService);
function normalizePhone(phone) {
    return phone.replace(/\D/g, "");
}
function isChatState(value) {
    return Object.values(state_machine_types_1.ChatState).includes(value);
}
function parseContext(value) {
    if (!value) {
        return {};
    }
    try {
        const parsed = JSON.parse(value);
        return parsed ?? {};
    }
    catch {
        return {};
    }
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
//# sourceMappingURL=chatbot.service.js.map