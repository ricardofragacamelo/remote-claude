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

**O que o banco guarda sobre sessão de Claude é procedência, não conteúdo:** que *nós*
iniciamos aquele `sessionId`. O SDK não informa a origem de uma sessão, e é esse registro que
permite rotular "nossa" e "externa" na lista — e escolher a estratégia de retomada. Uma linha
de metadado não é duplicar transcript.

Esse registro é a tabela `session_origins` — `claude_session_id` (chave), `session_id`,
`user_id`, `workspace_path`, `opened_at`, e nenhuma coluna de conteúdo. Dona é `session`, que a
grava **antes** do `query()`, com o UUID que ela mesma cunhou e passou ao SDK como `sessionId`;
falha ao gravar não abre a sessão. Gravar a mesma conversa duas vezes mantém o primeiro dono.

**E guarda o estado em que a sessão deixou cada arquivo** — caminho, hash e mtime, gravados no
hook `PostToolUse`. É o que permite ao desfazer distinguir "como a sessão deixou" de "alterado
à mão depois", porque o store de checkpoint do CLI guarda conteúdo puro e não sabe quem
escreveu. Ver [04-claude-integration.md](04-claude-integration.md#desfazer-arquivos--o-store-é-nosso).

Esse registro é **tabela própria, dona é `session`**, e **não** entra na trilha de auditoria:
a linha é sobrescrita a cada nova escrita no mesmo arquivo, e a trigger append-only da trilha
aborta `UPDATE` — misturar as duas quebraria uma das duas garantias. Uma é "o que resultou,
agora"; a outra é "o que aconteceu, para sempre".

**E guarda o conteúdo anterior**, por turno, chaveado por `(session_id, prompt_id, path)`: é o
snapshot que o desfazer restaura, arquivo por arquivo. Ele existe porque o `rewindFiles()` do
SDK não aceita filtro de arquivo — reverter alguns e preservar outros só é possível com store
próprio. Conteúdo grande **não** vai para o Postgres: a linha guarda o metadado e aponta para o
blob em disco, com teto e purga que nunca alcança sessão viva (referência medida: o store
equivalente do CLI ocupa 6,6 MB para 54 sessões).

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
  grant(rule: PermissionRule, now: Date): Promise<RuleGrant>          // atômico: a equivalente ativa, ou esta
  findById(ruleId: string): Promise<PermissionRule | null>
  findApplicable(userId: UserId, projectPath: string | null, now: Date): Promise<PermissionRule[]>
  listFor(userId: UserId): Promise<PermissionRule[]>
  saveRevocation(rule: PermissionRule): Promise<void>
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

### O device do celular

A unicidade do aparelho é o **índice único composto `(user_id, install_id)`**, não o `install_id`
sozinho. A identidade é do aparelho, mas a aprovação é do usuário: com a chave simples, o
registro do usuário B no mesmo celular sobrescreveria a linha já aprovada do usuário A, e a
aprovação seria herdada em silêncio. O índice nasce composto na migration que cria a tabela —
depois seria migração em tabela com dado. Ver
[08-authentication](../shared/08-authentication.md#device-e-o-canal-mobile).

### Os fatos de conta

`audit_events` é irmã de `audit_entries`, não um alargamento dela. A trilha de invocação é moldada
em torno de **uma invocação** — uma sessão, um nome de tool, um input exato —, e nenhuma das três
colunas tem valor honesto para "este celular foi aprovado". Tornar as três anuláveis transformaria
cada `NOT NULL` da tabela cuja razão de existir é poder ser confiada em um talvez.

O que a irmã copia é a disciplina: `seq` que ordena enquanto `at` filtra, ULID cunhado pelo
`IdGenerator` do domínio em vez de default do banco, e as mesmas duas triggers — `UPDATE` aborta
sempre, `DELETE` aborta dentro do piso de 90 dias. Ver
[03-modules](03-modules.md#audit) e
[08-authentication](../shared/08-authentication.md#logging).

### As regras de permissão

`permission_rules` guarda só o que precisa sobreviver ao processo — escopo `project` e `always`. A
regra de `session` fica em memória e morre com o subprocesso, que é o que ela significa.

- `user_id` e `expires_at` são **`NOT NULL`**: regra é de uma pessoa, e toda regra expira. O teto da
  validade é configuração, conferida na criação — um `CHECK` congelaria o número numa migration.
- **Nunca se apaga uma regra.** Revogar grava `revoked_at` e a linha fica: `permission_requests.rule_id`
  aponta para a regra que resolveu, e "qual regra deixou isto rodar?" precisa de resposta depois da
  revogação.
- **Sem índice único**, de propósito: "a mesma regra duas vezes é uma" vale entre as **ativas**, e
  estar ativa depende do relógio, que um índice não lê. O repositório serializa a concessão da
  mesma regra com um *advisory lock* de transação sobre usuário, escopo, projeto, padrão e decisão.
- O escopo e o projeto concordam por `CHECK`: `project` tem `project_path`, `always` não.

Ver [a F0 do plano 03](../../plans/03-rules-and-audit/F0-rules.md) e a
[D-10](../../plans/03-rules-and-audit/decisions.md#d-10--dois-caminhos-para-nascer-uma-rotina).

### A trilha de auditoria

A tabela de auditoria foge de duas convenções acima, e foge de propósito.

**Ela tem um sequencial próprio** — `seq bigint`, gerado pelo banco — **além** do `id`. O
identificador continua sendo a PK, e é um ULID em coluna `text` como as outras identidades deste
schema: ele é cunhado pelo `IdGenerator` do domínio, e um default do banco significaria que é o
banco quem decide quem é a entrada; o `seq` existe porque a consulta paginada precisa de uma ordenação
total e monotônica, e `at` não é nenhuma das duas: dois registros caem no mesmo milissegundo, e
o relógio da máquina do usuário pode ser ajustado para trás. `at` filtra, `seq` ordena. Ver
[a consulta](03-modules.md#audit).

**Ela é protegida por trigger, não por convenção:**

```
BEFORE UPDATE → aborta sempre
BEFORE DELETE → aborta se a linha estiver dentro do piso de retenção (90 dias = 2160 horas)
```

O piso é medido em **horas**, não em dias de calendário: para `timestamptz`, `interval '90 days'` é
aritmética no fuso da sessão, e atravessando um horário de verão são 2159 ou 2161 horas — enquanto
o código conta 90 × 24. A `0010` reescreveu as duas funções com `interval '2160 hours'`
([03 · D-21](../../plans/03-rules-and-audit/decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário)).

E um índice único sobre `(session_id, tool_use_id)`: o SDK reentrega uma invocação pendente depois
de um gap de transporte, e uma segunda linha faria a trilha afirmar que o comando rodou duas
vezes. Ele é total e não parcial, apoiado no `NULLS DISTINCT` que é o default do PostgreSQL —
`tool_use_id` é nulo quando o SDK não deu um, duas linhas sem id não colidem, e uma lacuna na
trilha é pior que uma duplicata.

A trigger vale para **quem quer que** esteja conectado — nenhum papel restrito, nenhuma segunda
string de conexão. É o que torna o append-only uma propriedade do banco em vez de uma promessa
do código, e é também o que dá passagem à purga: ela apaga fora do piso, e só fora dele.

O piso (90 dias) mora na trigger e é imutável em tempo de execução. A janela efetiva mora na
configuração e só pode ser ≥ piso. **Uma decide o que a purga tenta apagar, a outra decide o que
o banco deixa apagar** — e é a segunda que sobrevive a um bug nosso, a uma migration distraída
ou a um `DELETE` digitado à mão.

A trigger é barreira, não permissão: quem tem o papel de owner pode desligá-la. Ela impede o
acidente e o bug, não o ato deliberado de quem já controla o banco.

**O que a purga apaga fica escrito em `audit_purges`**, uma linha por lote, e a linha é gravada pela
**mesma instrução** que apaga — um CTE que seleciona o lote, apaga e insere a contagem do que o
`DELETE` devolveu. Uma instrução é uma transação: não existe instante em que a trilha perdeu linhas
e nada diz quem as tirou. A tabela recusa `UPDATE` e `DELETE` sempre, e repete o piso num `CHECK`
(`retention_days >= 90`). As duas trilhas ganharam índice em `at`, que é por onde o lote é escolhido
([03 · D-19](../../plans/03-rules-and-audit/decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga)).

**A entrada de decisão carrega o próprio veredito** — `request_id`, `auto`, `rule_id`, `scope`,
`resolved_by`, `resolved_from` —, e toda entrada carrega o `trace_id` em escopo quando foi gravada.
São colunas anuláveis, acrescentadas pela `0009` sem reescrever linha
([03 · D-15](../../plans/03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)). Duas
`CHECK` repetem no banco o que o domínio garante: entrada `recorded` não tem veredito, e só decisão
automática aponta regra. O `trace_id` é carimbado pelo repositório, a partir do contexto: o domínio
não sabe o que é um trace.

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
