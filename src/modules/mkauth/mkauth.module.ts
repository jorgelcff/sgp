import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { MkauthService } from "./infrastructure/mkauth.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const baseURL =
          configService.get<string>("MKLINK_URL") ??
          "https://v2-api.mklink.com.br/api/v1";
        const timeoutMs = Number(
          configService.get<string>("MKLINK_TIMEOUT_MS") ?? 60000,
        );
        const secret = configService.get<string>("MKLINK_SECRET");

        return {
          baseURL,
          headers: secret ? { Authorization: `Bearer ${secret}` } : undefined,
          timeout: Number.isNaN(timeoutMs) ? 60000 : timeoutMs,
        };
      },
    }),
  ],
  providers: [MkauthService],
  exports: [MkauthService],
})
export class MkauthModule {}
