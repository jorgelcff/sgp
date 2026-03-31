import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatResponse } from "../state-machine/state-machine.types";
import { WhatsappQueueService } from "../../whatsapp/infrastructure/whatsapp-queue.service";

@Injectable()
export class WhatsappAdapterService {
  private readonly logger = new Logger(WhatsappAdapterService.name);

  constructor(
    private readonly whatsappQueue: WhatsappQueueService,
    private readonly configService: ConfigService,
  ) {}

  async sendResponses(
    telefone: string,
    responses: ChatResponse[],
  ): Promise<void> {
    const target = this.resolveTargetPhone(telefone);
    for (const response of responses) {
      if (response.type === "text") {
        await this.whatsappQueue.sendText(target, response.text);
      }
      if (response.type === "image") {
        await this.whatsappQueue.sendImage(
          target,
          response.imageUrl,
          response.caption,
        );
      }
    }

    this.logger.log(
      `Respostas enviadas para ${target}. Total: ${responses.length}.`,
    );
  }

  private resolveTargetPhone(original: string): string {
    const testNumber = this.configService.get<string>("WHATSAPP_TEST_NUMBER");
    if (testNumber) {
      return testNumber.replace(/\D/g, "");
    }

    return original;
  }
}
