import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { Agent } from "https";
import { MkauthService } from "./infrastructure/mkauth.service";

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>("MKAUTH_URL") ?? "";
        const baseURL = /^https?:\/\//.test(host) ? host : `https://${host}`;
        const timeoutMs = Number(
          configService.get<string>("MKAUTH_TIMEOUT_MS") ?? 60000,
        );

        return {
          baseURL,
          timeout: Number.isNaN(timeoutMs) ? 60000 : timeoutMs,
          // O certificado TLS do MK-Auth esta expirado; a validacao e
          // desabilitada so para este host, sem afetar outras integracoes.
          httpsAgent: new Agent({ rejectUnauthorized: false }),
        };
      },
    }),
  ],
  providers: [MkauthService],
  exports: [MkauthService],
})
export class MkauthModule {}
