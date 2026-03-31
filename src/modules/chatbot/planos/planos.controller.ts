import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";

@Controller("planos")
export class PlanosController {
  constructor(private readonly configService: ConfigService) {}

  @Get("imagem")
  async getPlanImage(@Res() res: Response): Promise<void> {
    const filePath = this.getPlanImagePath();
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException("Imagem de planos nao encontrada.");
    }

    res.sendFile(filePath);
  }

  @Post("imagem")
  @UseInterceptors(FileInterceptor("file"))
  async uploadPlanImage(
    @UploadedFile() file?: { buffer: Buffer; mimetype?: string },
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException("Arquivo nao enviado.");
    }

    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("Apenas arquivos de imagem sao permitidos.");
    }

    const filePath = this.getPlanImagePath();
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    return { url: this.buildPublicUrl() };
  }

  private getPlanImagePath(): string {
    return resolve(process.cwd(), "assets", "planos.jpeg");
  }

  private buildPublicUrl(): string {
    const baseUrl = this.configService.get<string>("APP_BASE_URL");
    if (!baseUrl) {
      return "/assets/planos.jpeg";
    }

    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBase}/assets/planos.jpeg`;
  }
}
