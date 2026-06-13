# sgp-whatsapp-bot-simple

Bot NestJS com Prisma/SQLite para sincronizar clientes/títulos do SGP e operar atendimento/financeiro via WhatsApp.

## Arquitetura

- NestJS backend
- Prisma ORM + SQLite (file:./prisma/sqlite.db)
- Cron de sync/cobrança
- Webhook WhatsApp (Wasender com webhook secret)
- Static assets para planos (/assets/planos.jfif)

## Requisitos

- Node.js 18+ (desenvolvimento)
- Docker + Docker Compose (deploy)

## Variáveis de ambiente essenciais

- `DATABASE_URL="file:./prisma/sqlite.db"`
- `SGP_URL`, `SGP_USER`, `SGP_PASS`
- `SGP_APP`, `SGP_TOKEN`: credenciais da "Aplicação" no SGP (`Sistema -> Ferramentas -> Painel Admin -> Tokens`), usadas para abrir chamado via `/api/ura/chamado/`. Sem elas, o fluxo de suporte registra apenas um protocolo local (não cria chamado no SGP).
- `SGP_CHAMADO_OCORRENCIA_TIPO`, `SGP_CHAMADO_SETOR`, `SGP_CHAMADO_MOTIVOOS` (opcionais): IDs para classificar o chamado de "Internet lenta" no SGP.
- `APP_BASE_URL` (ex.: `http://seu-host:3000`)
- `WHATSAPP_PROVIDER=wasender`
- `WASENDER_BASE_URL`, `WASENDER_TOKEN`, `WASENDER_SEND_TEXT_PATH`, `WASENDER_SEND_MEDIA_PATH`
- `WASENDER_WEBHOOK_SECRET` (para validar /webhook/whatsapp via header `x-webhook-secret` ou `?secret=`)
- Throttle: `THROTTLE_TTL`, `THROTTLE_LIMIT`
- Billing: `BILLING_MAX_PER_RUN`, `BILLING_DELAY_MS`, `BILLING_OVERDUE_DAYS`. O envio de cobranca nao e mais diario: cada titulo aberto recebe no maximo uma mensagem em D-5, D-1 e D0 (antes do vencimento) e em D+1, D+3, D+7, D+15, D+30 (apos o vencimento, limitado por `BILLING_OVERDUE_DAYS`). A consulta tambem ordena por `dataVencimento` (mais antigos primeiro), priorizando os titulos mais urgentes dentro do limite de `BILLING_MAX_PER_RUN`. Titulos elegiveis do mesmo cliente sao agrupados em um unico envio (com cabecalho consolidado quando ha mais de um boleto pendente).
- `BILLING_HOUR_START` / `BILLING_HOUR_END` (padrao 8 / 20): janela de horario em que a cobranca automatica roda (fora dela, a execucao do cron e pulada). O endpoint manual `GET /billing/run` ignora essa janela. A rotina tambem loga um alerta quando existem titulos "aberto" com vencimento fora da janela de cobranca, indicando possivel necessidade de revisao no SGP.
- `HUMAN_HANDOFF_HOURS` (padrao 4): tempo que o bot fica em silencio para um numero apos um atendente humano responder manualmente pelo mesmo WhatsApp.

## Desenvolvimento local

1. `cp .env.example .env` e ajuste as variáveis.
2. `npm install`
3. `npm run prisma:generate` e `npm run prisma:dbpush`
4. `npm run start:dev`

Rotas úteis:
- Health: `GET /health` (Basic Auth com `SGP_USER`/`SGP_PASS`)
- Sync manual: `GET /sync/manual`
- Webhook WhatsApp: `POST /webhook/whatsapp` (auth via `WASENDER_WEBHOOK_SECRET` ou Basic Auth)
- Planos: `GET /planos/imagem` e `POST /planos/imagem` (multipart `file`) para servir/atualizar `assets/planos.jfif`

## Deploy via Docker

Imagem multi-stage (Debian) com Prisma Client incluso. Para subir:

```bash
docker compose build --no-cache
docker compose up -d
docker compose logs -f app
```

O compose expõe a porta 3000 e monta `./prisma`, `./assets`, `./auth` no container. O banco SQLite persiste em `./prisma/sqlite.db` no host.

## Observações

- WhatsApp lê apenas o SQLite; mantenha o sync ativo.
- Webhook pode usar Basic Auth (SGP_USER/SGP_PASS) ou o segredo dedicado (`WASENDER_WEBHOOK_SECRET`).
- Health e demais rotas seguem com Basic Auth.
- **Handoff humano**: se um atendente responder manualmente pelo mesmo número de WhatsApp (fora do bot), o bot pausa automaticamente as respostas para aquele contato por `HUMAN_HANDOFF_HOURS` (padrão 4h) e não envia os avisos de sessão expirando/expirada nesse período. Após esse tempo sem novas mensagens do atendente, o bot volta a responder normalmente.
- **Fila do WhatsApp com prioridade**: o `WhatsappQueueService` mantém duas filas (normal e baixa prioridade). Respostas do chatbot usam prioridade normal e sempre furam a fila de envios em lote da cobrança (prioridade baixa), evitando que clientes ativos fiquem presos atrás de uma rodada de cobrança.

## SQL de exemplo (títulos vencidos)

```sql
SELECT
   t.id,
   c.nome,
   c.telefone,
   t.valor,
   t."dataVencimento",
   t.status
FROM "Titulo" t
JOIN "Cliente" c ON c.id = t."clienteId"
WHERE t.status = 'aberto'
ORDER BY t."dataVencimento" ASC;
```
