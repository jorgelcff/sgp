import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { DatabaseModule } from "./database/database.module";
import { SgpModule } from "./modules/sgp/sgp.module";
import { SyncModule } from "./modules/sync/sync.module";
import { BillingModule } from "./modules/billing/billing.module";
import { WhatsappModule } from "./modules/whatsapp/whatsapp.module";
import { ClientesModule } from "./modules/clientes/clientes.module";
import { NotificacoesModule } from "./modules/notificacoes/notificacoes.module";
import { HealthModule } from "./modules/health/health.module";
import { ChatbotModule } from "./modules/chatbot/chatbot.module";
import { BasicAuthGuard } from "./common/guards/basic-auth.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => [
        {
          ttl: Number(configService.get<string>("THROTTLE_TTL")) || 60,
          limit: Number(configService.get<string>("THROTTLE_LIMIT")) || 60,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SgpModule,
    SyncModule,
    BillingModule,
    WhatsappModule,
    ClientesModule,
    NotificacoesModule,
    HealthModule,
    ChatbotModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: BasicAuthGuard,
    },
  ],
})
export class AppModule {}
