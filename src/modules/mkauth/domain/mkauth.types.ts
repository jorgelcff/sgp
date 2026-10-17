export type MkauthPagination = {
  total_registros: number;
  consulta_atual: number;
  pagina_atual: number;
  total_paginas: number;
};

export type MkauthCliente = {
  id?: string;
  uuid?: string;
  uuid_cliente?: string;
  nome?: string;
  nome_res?: string;
  login?: string;
  senha?: string;
  cpf_cnpj?: string;
  pessoa?: string;
  tipo?: string;
  email?: string;
  celular?: string;
  fone?: string | null;
  plano?: string;
  contrato?: string;
  bloqueado?: string;
  cli_ativado?: string;
  status_corte?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  complemento?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  coordenadas?: string | null;
  ip?: string | null;
  mac?: string | null;
  ramal?: string;
  nascimento?: string | null;
  cadastro?: string | null;
  tit_abertos?: string;
  tit_vencidos?: string;
  [key: string]: unknown;
};

// Na pratica o endpoint de listagem retorna o mesmo shape do show.
export type MkauthClienteListItem = MkauthCliente;

export type MkauthClienteListResponse = MkauthPagination & {
  clientes: MkauthClienteListItem[];
};

export type MkauthClienteInsertPayload = {
  nome: string;
  login: string;
  senha: string;
  cpf: string;
  email?: string;
  rg?: string;
  data_nasc?: string;
  endereco?: string;
  bairro?: string;
  numero?: string | number;
  complemento?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  celular?: string;
};

export type MkauthClienteInsertResponse = {
  status: string;
  mensagem?: string;
  dados?: MkauthClienteInsertPayload;
};

export type MkauthTitulo = {
  uuid: string;
  login: string;
  status: string;
  tipo?: string;
  titulo?: string;
  valor?: string;
  linhadig?: string | null;
  datavenc?: string;
  cpf_cnpj?: string;
  pix?: string;
  pix_link?: string;
  pix_qr?: string;
  codigoBarras?: string;
  link?: string;
};

export type MkauthTituloListResponse = {
  Total: number;
  titulos: MkauthTitulo[];
};

export type MkauthTituloReceberPayload = {
  uuid: string;
  coletor: string;
  valor: string;
  forma: "dinheiro" | "cheque" | "cartao" | "vale" | "pix" | "outros";
};

export type MkauthTituloReceberResponse = {
  status: string;
  mensagem?: string;
  dados?: Record<string, unknown>;
};

export type MkauthChamadoAssunto =
  | "Financeiro"
  | "Dúvidas"
  | "Conexão"
  | "Cadastro"
  | "Crítica"
  | "Sugestão"
  | "Transferencia"
  | "Cancelamento"
  | "Outros";

export type MkauthChamadoInsertPayload = {
  title: string;
  description?: string;
  client_id?: string;
  client_phone?: string;
  priority?: string;
  ticket_type?: string;
};

export type MkauthChamadoInsertResponse = {
  status: string;
  mensagem: string;
  chamado: string;
  dados: MkauthChamadoInsertPayload;
};

export type MkauthChamadoListItem = {
  uuid: string;
  id: string;
  abertura: string;
  login: string;
  prioridade: string;
  chamado: string;
  status: string;
  assunto: string;
};

export type MkauthChamadoListResponse = MkauthPagination & {
  chamados: MkauthChamadoListItem[];
};

export type MkauthChamado = {
  id: string;
  uuid_suporte?: string;
  assunto?: string;
  abertura?: string;
  fechamento?: string | null;
  email?: string;
  status: string;
  chamado: string;
  nome?: string;
  login: string;
  atendente?: string | null;
  visita?: string | null;
  prioridade?: string;
  ramal?: string;
  reply?: string;
  tecnico?: string | null;
  login_atend?: string;
  motivo_fechar?: string | null;
};

export type MkauthChamadoFecharPayload = {
  chamado: string;
  motivo: string;
};

export type MkauthChamadoStatusResponse = {
  status: string;
  mensagem: string;
  dados?: Record<string, unknown>;
};
