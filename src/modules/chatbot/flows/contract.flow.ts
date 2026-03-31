import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class ContractFlowService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  getContractMenu(): ChatResponse[] {
    const imageUrl =
      this.configService.get<string>("CHATBOT_PLAN_IMAGE_URL") ??
      this.buildLocalPlanImageUrl();

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
        "Escolha uma opcao:\n" +
        "1️⃣ - Quero me cadastrar\n" +
        "2️⃣ - Tenho duvidas\n" +
        "0️⃣ - Voltar ao menu principal",
    });

    return responses;
  }

  getPreCadastroPrompt(): ChatResponse[] {
    return [
      {
        type: "text",
        text:
          "Copie e preencha, depois envie aqui:\n" +
          "Nome completo: \n" +
          "CPF: \n" +
          "Data de nascimento (AAAA-MM-DD): \n" +
          "Endereco: \n" +
          "Email: \n" +
          "Telefone: \n" +
          "\nDigite 0️⃣ para voltar ao menu principal.",
      },
    ];
  }

  async handlePreCadastroSubmission(
    message: string,
  ): Promise<{ responses: ChatResponse[]; nextState: ChatState }> {
    const parsed = parsePreCadastro(message);
    const missing = requiredFields.filter((field) => !parsed[field]);

    if (missing.length > 0) {
      return {
        responses: [
          {
            type: "text",
            text:
              "Faltaram campos obrigatorios: " +
              missing.join(", ") +
              ". Preencha todos os campos no formato indicado.",
          },
          ...this.getPreCadastroPrompt(),
        ],
        nextState: ChatState.CONTRATAR_PEDIR_DADOS,
      };
    }

    const normalizedDate = normalizeDate(parsed.datanasc!);
    if (!normalizedDate) {
      return {
        responses: [
          {
            type: "text",
            text: "Data de nascimento invalida. Use o formato AAAA-MM-DD ou DD/MM/AAAA.",
          },
          ...this.getPreCadastroPrompt(),
        ],
        nextState: ChatState.CONTRATAR_PEDIR_DADOS,
      };
    }

    parsed.datanasc = normalizedDate;

    const url = this.configService.get<string>("CHATBOT_PRECADASTRO_URL");
    const app = this.configService.get<string>("CHATBOT_PRECADASTRO_APP");
    const token = this.configService.get<string>("CHATBOT_PRECADASTRO_TOKEN");

    if (!url || !app || !token) {
      return {
        responses: [
          {
            type: "text",
            text: "Pre-cadastro indisponivel. Fale com um atendente.",
          },
        ],
        nextState: ChatState.MENU_PRINCIPAL,
      };
    }

    const payload = {
      app,
      token,
      nome: parsed.nome!,
      cpfcnpj: parsed.cpf!,
      email: parsed.email!,
      celular: parsed.telefone!,
      datanasc: parsed.datanasc!,
      logradouro: parsed.endereco!,
      numero: 0,
      complemento: "",
      bairro: "",
      cidade: "",
      cep: "",
      uf: "",
      pais: "BR",
      pontoreferencia: "",
    };

    try {
      await firstValueFrom(this.httpService.post(url, payload));
      return {
        responses: [
          {
            type: "text",
            text: "Pre-cadastro enviado com sucesso! Em breve entraremos em contato.",
          },
        ],
        nextState: ChatState.MENU_PRINCIPAL,
      };
    } catch (error) {
      const detail = extractError(error);
      return {
        responses: [
          {
            type: "text",
            text:
              "Nao consegui enviar o pre-cadastro agora. " +
              (detail ? `Detalhe: ${detail}` : "Tente novamente mais tarde."),
          },
          ...this.getPreCadastroPrompt(),
        ],
        nextState: ChatState.CONTRATAR_PEDIR_DADOS,
      };
    }
  }

  private buildLocalPlanImageUrl(): string | null {
    const baseUrl = this.configService.get<string>("APP_BASE_URL");
    if (!baseUrl) {
      return null;
    }

    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanBase}/assets/planos.jfif`;
  }
}

type PreCadastroFields = {
  nome?: string;
  cpf?: string;
  datanasc?: string;
  endereco?: string;
  email?: string;
  telefone?: string;
};

const requiredFields: Array<keyof PreCadastroFields> = [
  "nome",
  "cpf",
  "datanasc",
  "endereco",
  "email",
  "telefone",
];

function parsePreCadastro(input: string): PreCadastroFields {
  const lines = input.split(/\r?\n/);
  const data: PreCadastroFields = {};

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key.startsWith("nome")) data.nome = value;
    if (key === "cpf") data.cpf = value.replace(/\D/g, "");
    if (key.includes("nascimento") || key === "data") data.datanasc = value;
    if (key.startsWith("endereco")) data.endereco = value;
    if (key === "email") data.email = value;
    if (key === "telefone" || key === "celular") {
      data.telefone = value.replace(/\D/g, "");
    }
  }

  return data;
}

function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const br = /^\d{2}\/\d{2}\/\d{4}$/;

  if (iso.test(trimmed)) {
    return trimmed;
  }

  if (br.test(trimmed)) {
    const [d, m, y] = trimmed.split("/");
    return `${y}-${m}-${d}`;
  }

  return null;
}

function extractError(error: any): string {
  const data = error?.response?.data;
  if (typeof data === "string") return data;
  return data?.message || data?.error || "";
}
