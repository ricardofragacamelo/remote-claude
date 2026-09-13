# Persistência — PostgreSQL 18 + Drizzle

Voltar para o [índice do backend](README.md).

---

## O que vai no banco (e o que não vai)

| Vai para o Postgres | Fica fora |
|---|---|
| Usuários, devices, tokens | **Transcript das conversas** — vive no JSONL do Claude |
| Regras de permissão persistidas | Sessões **vivas** — estado de processo, em memória |
| Histórico de permission requests | Conteúdo de arquivo do workspace |
| **Trilha de auditoria** | Credencial do Claude — é do SO, em `~/.claude/` |
| Metadados de workspace (allowlist, último uso) | |

**Não duplique o transcript.** O Claude já persiste em `~/.claude/projects/*.jsonl`, e é o
mesmo arquivo que o VSCode usa. Copiar para o Postgres cria duas fontes de verdade que
divergem. Leia via funções do SDK. Ver [04-claude-integration.md](04-claude-integration.md).

---

## Drizzle, não Prisma nem TypeORM

Ver [ADR-003](../shared/00-decisions.md#adr-003--postgresql-18-desde-o-início-com-drizzle-orm).
Em resumo: o schema Drizzle é TypeScript puro, sem geração de cliente e sem decorator em
entidade — nada vaza para `domain/`.

### Schema mora em `infrastructure/`, não em `domain/`

```
src/infrastructure/database/schema/
├── auth.schema.ts
├── permission.schema.ts
├── workspace.schema.ts
├── audit.schema.ts
└── index.ts
```

A tabela **não é** a entidade. `Session` (domínio) e `sessions` (tabela) são coisas
diferentes, ligadas por um mapper no adapter:

```
domain/session/entities/session.entity.ts  ←─ mapper ─→  infrastructure/database/schema/session.schema.ts
                        (adapter/outbound/persistence/session/session.mapper.ts)
```

Parece cerimônia até a primeira vez em que a tabela precisa mudar sem que a regra de negócio
mude — ou o contrário.

---

## Repositório

Interface em `application/<domínio>/ports/`, implementação em
`adapter/outbound/persistence/<domínio>/`:

```ts
// src/application/permission/ports/permission-rule.repository.ts
export interface PermissionRuleRepository {
  findMatching(sessionId: SessionId, toolName: string, input: ToolInput): Promise<PermissionRule | null>
  save(rule: PermissionRule): Promise<void>
  revoke(ruleId: PermissionRuleId): Promise<void>
}
export const PERMISSION_RULE_REPOSITORY = Symbol('PermissionRuleRepository')
```

Regras:

- Repositório devolve **entidade de domínio**, nunca row do Drizzle.
- Um repositório por agregado, não por tabela.
- Query específica de leitura para tela não precisa passar pelo agregado — pode ser um
  *read model* que devolve DTO direto. Forçar toda leitura pelo agregado gera N+1 e
  hidratação inútil.
- **Sem lógica de negócio no repositório.** Ele busca e grava.

---

## Migrations

```
src/infrastructure/database/migrations/
├── 0000_initial.sql
├── 0001_add_permission_rules.sql
└── meta/
```

- Geradas por `drizzle-kit generate` a partir do schema; **revisadas à mão** antes do commit.
- **Nunca edite uma migration já aplicada.** Crie a próxima.
- Toda migration precisa ser reversível, ou trazer o plano de reversão no comentário do topo.
- Mudança destrutiva (drop de coluna) em **duas** entregas: primeiro para de usar, depois
  remove. Cliente antigo ainda está no ar durante o deploy.
- Migration roda no start do processo, atrás de advisory lock — duas instâncias subindo
  juntas não corrompem o schema.

---

## Convenções de schema

| Item | Convenção |
|---|---|
| Tabela | `snake_case`, plural: `permission_rules` |
| Coluna | `snake_case`: `created_at` |
| PK | `id`, tipo `uuid`, default `gen_random_uuid()` |
| FK | `<singular>_id`: `user_id` |
| Timestamp | `timestamptz`, **sempre**. Nunca `timestamp` sem fuso |
| Booleano | prefixo `is_` / `has_`: `is_revoked` |
| Enum | `text` + CHECK constraint, não `enum` nativo (migrar enum do PG é doloroso) |
| Soft delete | só onde é requisito; então `deleted_at timestamptz` |
| JSON | `jsonb`, nunca `json` |

Colunas de auditoria em toda tabela: `created_at`, `updated_at`. Onde houver ator:
`created_by`, `updated_by`.

**Índice é decisão explícita.** Toda FK usada em join tem índice; toda coluna de filtro
frequente tem índice; índice novo entra junto com a query que o justifica, na mesma migration.

---

## Transações

- Fronteira transacional é o **use case**, aplicada no adapter por interceptor. O use case
  declara `@Transactional()`; ele não abre nem fecha conexão.
- Repositório **nunca** abre transação própria.
- Sem transação de longa duração. Nunca segure transação esperando I/O externo — em
  particular, **nunca** esperando decisão de permissão (que pode levar minutos).
- Isolamento default (`READ COMMITTED`) basta; `SERIALIZABLE` só onde houver invariante
  entre linhas, e com retry.

---

## Auditoria — append-only

A tabela `audit_entries` é a garantia de que dá para responder *"quem autorizou este comando?"*.

- Sem `UPDATE`, sem `DELETE` — garantido por permissão de role no banco, não só por
  convenção de código.
- Escrita de auditoria acontece **na mesma transação** da decisão. Falhou a auditoria,
  falhou a autorização.
- Retenção mínima: 90 dias. Expurgo é job explícito e ele próprio auditado.

---

## Conexão e pool

- Pool com máximo explícito; `min` em 0 para não segurar conexão ociosa.
- Timeout de query obrigatório (`statement_timeout`) — query pendurada trava o pool.
- Healthcheck faz `SELECT 1`, não query de negócio.
- Falha de conexão no boot **impede o processo de subir**. Não suba degradado.

---

## Ambiente de desenvolvimento e teste

- Dev: Postgres 18 via `docker-compose.yml` na raiz.
- Teste de integração: **testcontainers**, container efêmero por suíte. Nunca SQLite, nunca
  mock. Ver [ADR-004](../shared/00-decisions.md#adr-004--testcontainers-para-testes-de-integração)
  e [07-testing.md](07-testing.md).
- Isolamento entre testes: transação com rollback ao final, ou schema dedicado por worker.

---

## Logging

Toda query loga em `debug`, com `op: "db.query"`, o SQL **parametrizado** (nunca com valores
interpolados) e `durationMs`. Query acima de 200 ms loga `warn` — é o que denuncia índice
faltando antes de virar incidente. Ver [logging](../shared/03-logging.md).
