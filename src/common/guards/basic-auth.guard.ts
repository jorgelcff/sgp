import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

@Injectable()
export class BasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.isValidWebhookSecret(request)) {
      return true;
    }

    const header = request.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("basic ")) {
      throw new UnauthorizedException("Autenticacao necessaria.");
    }

    const encoded = header.slice(6).trim();
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) {
      throw new UnauthorizedException("Autenticacao invalida.");
    }

    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    const expectedUser = this.configService.get<string>("SGP_USER");
    const expectedPass = this.configService.get<string>("SGP_PASS");

    if (!expectedUser || !expectedPass) {
      throw new UnauthorizedException("Autenticacao nao configurada.");
    }

    if (user !== expectedUser || pass !== expectedPass) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    return true;
  }

  private isValidWebhookSecret(request: Request): boolean {
    const expected = this.configService.get<string>("WASENDER_WEBHOOK_SECRET");
    if (!expected) {
      return false;
    }

    const isWhatsappWebhook = request.path?.startsWith("/webhook/whatsapp");
    if (!isWhatsappWebhook) {
      return false;
    }

    const headerSecret = request.headers["x-webhook-secret"];
    const querySecret = request.query?.secret;
    const received = Array.isArray(headerSecret)
      ? headerSecret[0]
      : (headerSecret as string | undefined) ??
        (Array.isArray(querySecret)
          ? querySecret[0]
          : (querySecret as string | undefined));

    return Boolean(received && expected && received === expected);
  }
}
