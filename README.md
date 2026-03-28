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
- `APP_BASE_URL` (ex.: `http://seu-host:3000`)
- `WHATSAPP_PROVIDER=wasender`
- `WASENDER_BASE_URL`, `WASENDER_TOKEN`, `WASENDER_SEND_TEXT_PATH`, `WASENDER_SEND_MEDIA_PATH`
- `WASENDER_WEBHOOK_SECRET` (para validar /webhook/whatsapp via header `x-webhook-secret` ou `?secret=`)
- Throttle: `THROTTLE_TTL`, `THROTTLE_LIMIT`
- Billing: `BILLING_MAX_PER_RUN`, `BILLING_DELAY_MS`, `BILLING_OVERDUE_DAYS`

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
