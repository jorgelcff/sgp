import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { WhatsappService } from "./infrastructure/whatsapp.service";
import { WasenderService } from "./infrastructure/wasender.service";
import { WHATSAPP_GATEWAY } from "./domain/whatsapp.tokens";
import { WhatsappController } from "./whatsapp.controller";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const baseURL =
          configService.get<string>("WASENDER_BASE_URL") ??
          "https://wasenderapi.com/api";
        const token = configService.get<string>("WASENDER_TOKEN");
        const headers: Record<string, string> = {};

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
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WasenderService,
    {
      provide: WHATSAPP_GATEWAY,
      useFactory: (
        configService: ConfigService,
        wasenderService: WasenderService,
        whatsappService: WhatsappService,
      ) => {
        const provider = configService.get<string>("WHATSAPP_PROVIDER");
        if (provider?.toLowerCase() === "wasender") {
          return wasenderService;
        }

        return whatsappService;
      },
      inject: [ConfigService, WasenderService, WhatsappService],
    },
  ],
  exports: [WHATSAPP_GATEWAY],
})
export class WhatsappModule {}
