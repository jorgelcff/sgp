import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class ContractFlowService {
  constructor(private readonly configService: ConfigService) {}

  handleContract(): { responses: ChatResponse[]; nextState: ChatState } {
    const imageUrl =
      this.configService.get<string>("CHATBOT_PLAN_IMAGE_URL") ??
      this.buildLocalPlanImageUrl();
    const preCadastro = this.configService.get<string>(
      "CHATBOT_PRECADASTRO_URL",
    );

    const responses: ChatResponse[] = [];

    if (imageUrl) {
      responses.push({
        type: "image",
        imageUrl,
        caption: "Confira nossos planos.",
      });
    }

    responses.push({
      type: "text",
      text:
        "Para contratar, acesse o link de pre-cadastro:\n" +
        `${preCadastro ?? "link nao configurado"}\n` +
        "Digite 0️⃣ para voltar ao menu principal.",
    });

    return { responses, nextState: ChatState.MENU_PRINCIPAL };
  }

  private buildLocalPlanImageUrl(): string | null {
    const baseUrl = this.configService.get<string>("APP_BASE_URL");
    if (!baseUrl) {
      return null;
    }

    const cleanBase = baseUrl.endsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;
    return `${cleanBase}/assets/planos.jfif`;
  }
}
