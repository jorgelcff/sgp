# Relatorio do projeto SGP WhatsApp Bot

Data: 26/02/2026

## Visao geral

Este projeto e uma API em NestJS que:

- Sincroniza clientes, contratos, servicos e titulos do SGP (TSMX) para um banco local.
- Envia notificacoes de cobranca via WhatsApp com base nos titulos abertos.
- Exponhe um chatbot simples para atendimento (suporte, financeiro, contratar, informar pagamento).

A aplicacao usa Prisma ORM e um banco configurado pela variavel `DATABASE_URL`. No README aparece SQLite, mas o arquivo `.env.example` aponta para PostgreSQL. O comportamento real depende do valor de `DATABASE_URL`.

## Como a aplicacao inicia

- `src/main.ts` cria o servidor HTTP e escuta na porta `PORT` (padrao 3000).
- `src/app.module.ts` registra todos os modulos.

## Arquitetura (alto nivel)

- **SGP SaaS API**: origem dos dados de clientes/contratos/titulos.
- **NestJS backend**: rotas HTTP, cron e chatbot.
- **Prisma ORM**: acesso ao banco.
- **WhatsApp**: envio de mensagens via Baileys (padrao) ou Wasender (configuravel).

## Modulos e responsabilidades

### Database

- `DatabaseModule` registra o `PrismaService` (conexao com o banco).

### SGP

- `SgpModule` configura o `HttpModule` com `SGP_URL`, `SGP_USER`, `SGP_PASS` e `SGP_TIMEOUT_MS`.
- `SgpService` busca clientes via `POST /clientes` e faz ping em `GET /portador`.

### Sync

- `SyncService` faz sync paginado (`limit=100`) e salva tudo no banco.
- `SyncCron` roda a cada **20 minutos** (`*/20 * * * *`), executa `syncAll()` e em seguida roda cobranca.
- `sync.cli.ts` permite executar sync via CLI (`npm run sync`).

### Billing (cobranca)

- Seleciona titulos em aberto com vencimento entre hoje e +5 dias, dentro do mes atual.
- Monta mensagens com valor e dados de pagamento (pix, linha digitavel, codigo de barras, link).
- Envia por WhatsApp e registra notificacoes no banco.
- Limites configuraveis:
  - `BILLING_MAX_PER_RUN` (padrao 50)
  - `BILLING_DELAY_MS` (padrao 1500ms)

### Chatbot

- Entrada: `POST /webhook/whatsapp` com `telefone`, `mensagem`, `tipo` e `mediaUrl`.
- Sessao do chatbot expira em 30 minutos sem atividade.

#### Fluxos detalhados do chatbot

**1) Menu principal (estado MENU_PRINCIPAL)**
- Mensagem de boas-vindas com 4 opcoes:
  - `1` Suporte
  - `2` Financeiro
  - `3` Contratar
  - `4` Informar pagamento
- Qualquer outro texto retorna o menu novamente.

**2) Suporte**
- Ao escolher `1` no menu:
  - Envia instrucoes para reiniciar o roteador.
  - Pergunta se normalizou (`1` sim, `2` nao).
- Se responder `1`: encerra e volta ao menu principal.
- Se responder `2`: pede CPF para abrir protocolo.
- CPF valido:
  - Gera protocolo simbolico `OS-<timestamp>` e volta ao menu.
- CPF invalido ou nao encontrado:
  - Pede CPF novamente.

**3) Financeiro**
- Ao escolher `2` no menu:
  - Menu com opcoes:
    - `1` Fatura errada (registra solicitacao e volta ao menu)
    - `2` Segunda via (pede CPF)
    - `3` Desbloqueio 3 dias (registra solicitacao e volta ao menu)
- Segunda via por CPF:
  - Se CPF invalido: pede novamente.
  - Se cliente nao encontrado: pede novamente.
  - Se titulo em aberto encontrado: retorna dados do titulo (valor, vencimento, pix, codigo de barras, link) e volta ao menu.

**4) Contratar**
- Ao escolher `3` no menu:
  - Envia imagem dos planos **somente** se `CHATBOT_PLAN_IMAGE_URL` estiver configurada.
  - Envia link de pre-cadastro com `CHATBOT_PRECADASTRO_URL`.
  - Volta ao menu principal.

**5) Informar pagamento**
- Ao escolher `4` no menu:
  - Pede CPF e depois o comprovante (imagem ou documento).
- Se o usuario manda texto sem CPF valido:
  - Solicita CPF novamente.
- Se o CPF ja foi registrado:
  - Solicita envio do comprovante.
- Quando chega imagem/documento:
  - Salva o registro em `MediaLog`.
  - Responde confirmando recebimento e volta ao menu.

**6) Comando global**
- Mensagem `0` em qualquer fluxo retorna ao menu principal.

#### Status de funcionamento

- Os fluxos estao implementados e coerentes com o banco e o estado do chatbot.
- O funcionamento real depende de:
  - Webhook recebendo mensagens corretamente em `POST /webhook/whatsapp`.
  - Banco com dados sincronizados (clientes e titulos).
  - Gateway de WhatsApp configurado e autorizado.

#### Sobre a imagem dos planos (assets)

- Existe o arquivo `assets/planos.jfif`.
- O chatbot **nao** envia arquivos locais. Ele envia apenas **URL** definida em `CHATBOT_PLAN_IMAGE_URL`.
- Portanto, a imagem **nao sera enviada** enquanto essa URL nao apontar para um local publico (ex: CDN, servidor estatico). Atualmente nao ha codigo servindo a pasta `assets` via HTTP.

### WhatsApp

- Existe um gateway selecionado por `WHATSAPP_PROVIDER`:
  - **Baileys** (padrao): conecta via QR e envia mensagens diretamente.
  - **Wasender**: usa API externa com `WASENDER_TOKEN`.
- Endpoints para QR:
  - `GET /whatsapp/qr` retorna QR em texto ou data URL.
  - `GET /whatsapp/qr.png` retorna imagem do QR.

### Clientes e Notificacoes

- `ClientesService`: encontra o celular do cliente via tabela `Contato` ou campo `Cliente.telefone`.
- `NotificacoesService`: registra envios e falhas para evitar duplicidade.

### Health

- `GET /health` verifica conexao com SQLite/Postgres e com o SGP.

## Endpoints HTTP

- `GET /health` -> status do banco e do SGP.
- `GET /sync/manual` -> executa sincronizacao manual.
- `GET /billing/run` -> executa cobranca manual.
- `POST /webhook/whatsapp` -> entrada do chatbot (mensagens recebidas).
- `GET /sessions/active` -> lista sessoes ativas do chatbot.
- `GET /whatsapp/qr` -> retorna QR atual do Baileys.
- `GET /whatsapp/qr.png` -> retorna QR em PNG.

## Banco de dados (resumo)

Tabelas principais:

- `Cliente`, `Endereco`, `Contrato`, `Servico`, `Titulo`, `Contato`.
- `Notificacao` registra envios de cobranca.
- `Session` guarda estado do chatbot.
- `MediaLog` guarda comprovantes recebidos.

## Fluxo principal de dados

1. Cron chama `SyncService` -> baixa clientes do SGP e salva no banco.
2. Cron chama `BillingService` -> busca titulos abertos -> envia WhatsApp.
3. Mensagens recebidas entram em `POST /webhook/whatsapp` -> chatbot responde.

## Sobre "mandar mensagem no numero do token"

- O **token** (ex: `WASENDER_TOKEN`) e **apenas credencial** para enviar mensagens via API.
- Para o bot **responder**, e necessario **receber** mensagens em `POST /webhook/whatsapp`.
- Se o provedor de WhatsApp nao estiver configurado para encaminhar mensagens para esse webhook, **nao havera resposta**.
- No modo **Baileys**, o projeto **nao** registra ouvintes de mensagens recebidas. Ele apenas envia. Portanto, o auto-responder depende de um webhook externo.

## Variaveis de ambiente usadas

- `DATABASE_URL`
- `PORT`
- `SGP_URL`, `SGP_USER`, `SGP_PASS`, `SGP_TIMEOUT_MS`
- `WHATSAPP_PROVIDER` ("baileys" ou "wasender")
- `WHATSAPP_TEST_NUMBER` (forca envio para numero de teste)
- `WASENDER_BASE_URL`, `WASENDER_TOKEN`, `WASENDER_SEND_TEXT_PATH`, `WASENDER_SEND_MEDIA_PATH`
- `CHATBOT_PLAN_IMAGE_URL`, `CHATBOT_PRECADASTRO_URL`
- `BILLING_MAX_PER_RUN`, `BILLING_DELAY_MS`

## Pontos de atencao

- README fala em cron a cada 6 horas, mas o codigo usa **a cada 20 minutos**.
- O README sugere SQLite, mas `.env.example` aponta para Postgres.
- O chatbot so responde se mensagens entrarem via webhook configurado no provedor.

## Como testar rapidamente

1. Suba o app e acesse `GET /health`.
2. Execute `GET /sync/manual` e verifique o banco.
3. Dispare `GET /billing/run` para enviar cobrancas.
4. Envie um POST para `POST /webhook/whatsapp` simulando entrada:

```json
{
  "telefone": "5511999999999",
  "mensagem": "1",
  "tipo": "text"
}
```
