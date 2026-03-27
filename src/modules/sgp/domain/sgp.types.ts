export type SgpPagination = {
  offset: number;
  limit: number;
  parcial: number;
  total: number;
};

export type SgpEndereco = {
  logradouro?: string;
  numero?: string | number;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  complemento?: string;
  latitude?: string;
  longitude?: string;
};

export type SgpPlano = {
  id?: number;
  descricao?: string;
};

export type SgpServico = {
  id: number;
  tipo?: string;
  plano?: SgpPlano;
  status?: string;
  login?: string;
  senha?: string;
  mac?: string;
  ip?: string;
  grupo?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  wifi_channel?: string;
  wifi_ssid_5?: string;
  wifi_password_5?: string;
  wifi_channel_5?: string;
  endereco?: SgpEndereco;
};

export type SgpContrato = {
  id: number;
  pop_id?: number;
  dataCadastro?: string;
  status?: string;
  motivo_status?: string;
  vencimento?: number;
  contratoCentralLogin?: string;
  contratoCentralSenha?: string;
  endereco?: SgpEndereco;
  servicos?: SgpServico[];
};

export type SgpTitulo = {
  id: number;
  cliente_id?: number;
  clientecontrato_id?: number;
  portador?: string;
  numeroDocumento?: number;
  nossoNumero?: string;
  link?: string;
  status?: string;
  valor?: number;
  valorJuros?: number;
  valorMulta?: number;
  valorDesconto?: number;
  valorCorrigido?: number;
  valorPago?: number;
  jurosDia?: number;
  multaDia?: number;
  diasAtraso?: number;
  codigoBarras?: string;
  linhaDigitavel?: string;
  codigoPix?: string;
  dataEmissao?: string;
  dataVencimento?: string;
  dataPagamento?: string;
  dataCancelamento?: string;
  demonstrativo?: string;
};

export type SgpContatos = {
  telefones?: string[];
  celulares?: string[];
  emails?: string[];
  outros?: string[];
};

export type SgpCliente = {
  id: number;
  nome: string;
  tipo?: string;
  cpfcnpj?: string;
  sexo?: string;
  dataNascimento?: string;
  dataCadastro?: string;
  endereco?: SgpEndereco;
  contratos?: SgpContrato[];
  titulos?: SgpTitulo[];
  contatos?: SgpContatos;
  status?: string;
};

export type SgpClientesResponse = {
  paginacao: SgpPagination;
  clientes: SgpCliente[];
};
