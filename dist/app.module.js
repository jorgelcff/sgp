"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const database_module_1 = require("./database/database.module");
const sgp_module_1 = require("./modules/sgp/sgp.module");
const sync_module_1 = require("./modules/sync/sync.module");
const billing_module_1 = require("./modules/billing/billing.module");
const whatsapp_module_1 = require("./modules/whatsapp/whatsapp.module");
const clientes_module_1 = require("./modules/clientes/clientes.module");
const notificacoes_module_1 = require("./modules/notificacoes/notificacoes.module");
const health_module_1 = require("./modules/health/health.module");
const chatbot_module_1 = require("./modules/chatbot/chatbot.module");
const basic_auth_guard_1 = require("./common/guards/basic-auth.guard");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: async (configService) => [
                    {
                        ttl: Number(configService.get("THROTTLE_TTL")) || 60,
                        limit: Number(configService.get("THROTTLE_LIMIT")) || 60,
                    },
                ],
            }),
            schedule_1.ScheduleModule.forRoot(),
            database_module_1.DatabaseModule,
            sgp_module_1.SgpModule,
            sync_module_1.SyncModule,
            billing_module_1.BillingModule,
            whatsapp_module_1.WhatsappModule,
            clientes_module_1.ClientesModule,
            notificacoes_module_1.NotificacoesModule,
            health_module_1.HealthModule,
            chatbot_module_1.ChatbotModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: basic_auth_guard_1.BasicAuthGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map