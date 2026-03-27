import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { SgpService } from "./infrastructure/sgp.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const baseURL = configService.get<string>("SGP_URL");
        const user = configService.get<string>("SGP_USER");
        const pass = configService.get<string>("SGP_PASS");
        const headers: Record<string, string> = {};

        if (user && pass) {
          const basic = Buffer.from(`${user}:${pass}`).toString("base64");
          headers.Authorization = `Basic ${basic}`;
        } else if (pass) {
          headers.Authorization = `Bearer ${pass}`;
        }

        const timeoutMs = Number(
          configService.get<string>("SGP_TIMEOUT_MS") ?? 60000,
        );

        return {
          baseURL,
          headers,
          timeout: Number.isNaN(timeoutMs) ? 60000 : timeoutMs,
        };
      },
    }),
  ],
  providers: [SgpService],
  exports: [SgpService],
})
export class SgpModule {}
