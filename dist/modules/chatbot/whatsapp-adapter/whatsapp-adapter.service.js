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
var WhatsappAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappAdapterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const whatsapp_queue_service_1 = require("../../whatsapp/infrastructure/whatsapp-queue.service");
let WhatsappAdapterService = WhatsappAdapterService_1 = class WhatsappAdapterService {
    constructor(whatsappQueue, configService) {
        this.whatsappQueue = whatsappQueue;
        this.configService = configService;
        this.logger = new common_1.Logger(WhatsappAdapterService_1.name);
    }
    async sendResponses(telefone, responses) {
        const target = this.resolveTargetPhone(telefone);
        for (const response of responses) {
            if (response.type === "text") {
                await this.whatsappQueue.sendText(target, response.text);
            }
            if (response.type === "image") {
                await this.whatsappQueue.sendImage(target, response.imageUrl, response.caption);
            }
        }
        this.logger.log(`Respostas enviadas para ${target}. Total: ${responses.length}.`);
    }
    resolveTargetPhone(original) {
        const testNumber = this.configService.get("WHATSAPP_TEST_NUMBER");
        if (testNumber) {
            return testNumber.replace(/\D/g, "");
        }
        return original;
    }
};
exports.WhatsappAdapterService = WhatsappAdapterService;
exports.WhatsappAdapterService = WhatsappAdapterService = WhatsappAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [whatsapp_queue_service_1.WhatsappQueueService,
        config_1.ConfigService])
], WhatsappAdapterService);
//# sourceMappingURL=whatsapp-adapter.service.js.map