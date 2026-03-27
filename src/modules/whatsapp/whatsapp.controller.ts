import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Query,
  StreamableFile,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappService } from "./infrastructure/whatsapp.service";

@Controller("whatsapp")
export class WhatsappController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly configService: ConfigService,
  ) {}

  @Get("qr")
  async getQr(): Promise<
    | { status: "ok"; qr: string; dataUrl: string | null; generatedAt: Date }
    | { status: "empty" }
  > {
    this.ensureBaileysEnabled();
    const latest = this.whatsappService.getLatestQr();
    if (!latest) {
      return { status: "empty" };
    }

    const dataUrl = await this.whatsappService.getLatestQrDataUrl();
    return {
      status: "ok",
      qr: latest.value,
      dataUrl,
      generatedAt: latest.generatedAt,
    };
  }

  @Get("qr.png")
  @Header("Content-Type", "image/png")
  async getQrPng(
    @Query("scale") scale?: string,
  ): Promise<StreamableFile | { status: "empty" }> {
    this.ensureBaileysEnabled();
    const size = scale ? Number(scale) : 6;
    const buffer = await this.whatsappService.getLatestQrPng(size);
    if (!buffer) {
      return { status: "empty" };
    }

    return new StreamableFile(buffer);
  }

  private ensureBaileysEnabled(): void {
    const provider = this.configService.get<string>("WHATSAPP_PROVIDER");
    if (provider?.toLowerCase() === "wasender") {
      throw new NotFoundException();
    }
  }
}
