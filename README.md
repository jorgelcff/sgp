# sgp-whatsapp-bot-simple

Projeto NestJS para sincronizar clientes do SGP via paginacao offset/limit, persistir no SQLite e notificar via WhatsApp (Baileys).

## Arquitetura

- SGP SaaS API (TSMX hosted)
- NestJS backend
- Prisma ORM
- SQLite
- Cron job (a cada 6 horas)
- WhatsApp (Baileys)

## Requisitos

- Node.js 18+

## Setup rapido

1. Configure o arquivo `.env`:
   - Copie `.env.example` para `.env` e ajuste as variaveis.
   - Exemplo de SQLite: `DATABASE_URL="file:./sgp.db"`
   - SGP: `SGP_URL`, `SGP_USER`, `SGP_PASS`
2. Instale dependencias:
   - `npm install`
3. Gere o Prisma Client e aplique schema:
   - `npm run prisma:generate`
   - `npm run prisma:dbpush`
4. Rode a aplicacao:
   - `npm run start:dev`

## Sincronizacao manual

- `npm run sync`
- `GET /sync/manual`

## Observacoes

- O WhatsApp **nao** consulta o SGP diretamente. Ele le apenas o SQLite.
- O cron sincroniza clientes e titulos a cada 6 horas, depois roda a cobranca.

## Exemplo de query SQL (titulos vencidos)

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
