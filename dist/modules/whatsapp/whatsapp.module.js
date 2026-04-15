"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("@nestjs/axios");
const whatsapp_service_1 = require("./infrastructure/whatsapp.service");
const wasender_service_1 = require("./infrastructure/wasender.service");
const whatsapp_tokens_1 = require("./domain/whatsapp.tokens");
const whatsapp_controller_1 = require("./whatsapp.controller");
const whatsapp_queue_service_1 = require("./infrastructure/whatsapp-queue.service");
let WhatsappModule = class WhatsappModule {
};
exports.WhatsappModule = WhatsappModule;
exports.WhatsappModule = WhatsappModule = __decorate([
    (0, common_1.Module)({
        imports: [
            axios_1.HttpModule.registerAsync({
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const baseURL = configService.get("WASENDER_BASE_URL") ??
                        "https://wasenderapi.com/api";
                    const token = configService.get("WASENDER_TOKEN");
                    const headers = {};
                    if (token) {
                        headers.Authorization = `Bearer ${token}`;
                    }
                    return {
                        baseURL,
                        headers,
                        timeout: 30000,
                    };
                },
            }),
        ],
        controllers: [whatsapp_controller_1.WhatsappController],
        providers: [
            whatsapp_service_1.WhatsappService,
            wasender_service_1.WasenderService,
            whatsapp_queue_service_1.WhatsappQueueService,
            {
                provide: whatsapp_tokens_1.WHATSAPP_GATEWAY,
                useFactory: (configService, wasenderService, whatsappService) => {
                    const provider = configService.get("WHATSAPP_PROVIDER");
                    if (provider?.toLowerCase() === "wasender") {
                        return wasenderService;
                    }
                    return whatsappService;
                },
                inject: [config_1.ConfigService, wasender_service_1.WasenderService, whatsapp_service_1.WhatsappService],
            },
        ],
        exports: [whatsapp_tokens_1.WHATSAPP_GATEWAY, whatsapp_queue_service_1.WhatsappQueueService],
    })
], WhatsappModule);
//# sourceMappingURL=whatsapp.module.js.map