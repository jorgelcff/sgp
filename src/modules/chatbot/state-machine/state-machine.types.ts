export enum ChatState {
  MENU_PRINCIPAL = "MENU_PRINCIPAL",
  SUPORTE_MENU = "SUPORTE_MENU",
  SUPORTE_LENTO_REINICIAR = "SUPORTE_LENTO_REINICIAR",
  SUPORTE_PEDIR_CPF = "SUPORTE_PEDIR_CPF",
  FINANCEIRO_MENU = "FINANCEIRO_MENU",
  FINANCEIRO_PEDIR_CPF = "FINANCEIRO_PEDIR_CPF",
  CONTRATAR_MENU = "CONTRATAR_MENU",
  AGUARDANDO_COMPROVANTE = "AGUARDANDO_COMPROVANTE",
  ENCERRADO = "ENCERRADO",
}

export type ChatResponse =
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string; caption?: string };

export type StateMachineResult = {
  nextState: ChatState;
  context?: Record<string, unknown>;
  responses: ChatResponse[];
};

export type WebhookPayload = {
  telefone: string;
  mensagem?: string;
  tipo: "text" | "image" | "document";
  mediaUrl?: string | null;
};
