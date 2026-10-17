import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MkauthService } from "../../mkauth/infrastructure/mkauth.service";
import { ChatResponse, ChatState } from "../state-machine/state-machine.types";

@Injectable()
export class ContractFlowService {
  private readonly logger = new Logger(ContractFlowService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mkauthService: MkauthService,
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

    const login = buildLogin(parsed.nome!, parsed.telefone!);
    const senha = buildSenhaProvisoria();

    const payload = {
      nome: parsed.nome!,
      login,
      senha,
      cpf: parsed.cpf!,
      email: parsed.email!,
      data_nasc: parsed.datanasc!,
      endereco: parsed.endereco!,
      celular: parsed.telefone!,
    };

    try {
      const resposta = await this.mkauthService.inserirCliente(payload);
      this.logger.log(
        `Pre-cadastro criado no MK-Auth. login=${login} status=${resposta?.status}`,
      );

      return {
        responses: [
          {
            type: "text",
            text:
              "Cadastro enviado com sucesso!\n" +
              `Seu login provisorio: ${login}\n` +
              `Senha provisoria: ${senha}\n\n` +
              "Nossa equipe vai concluir a ativacao e entrar em contato.",
          },
        ],
        nextState: ChatState.MENU_PRINCIPAL,
      };
    } catch (error) {
      const detail = extractError(error);
      this.logger.warn(
        `Falha ao criar pre-cadastro no MK-Auth (login=${login}): ${detail || getErrorMessage(error)}`,
      );
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

function buildLogin(nome: string, telefone: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 10);
  const suffix = telefone.replace(/\D/g, "").slice(-4) || "0000";
  return `${slug || "cliente"}${suffix}`;
}

function buildSenhaProvisoria(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
