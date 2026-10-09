# Persistência — PostgreSQL 18 + Drizzle

Voltar para o [índice do backend](README.md).

---

## O que vai no banco (e o que não vai)

| Vai para o Postgres | Fica fora |
|---|---|
| Usuários, devices, tokens | **Transcript das conversas** — vive no JSONL do Claude |
| Regras de permissão persistidas | Sessões **vivas** — estado de processo, em memória |
| Histórico de permission requests | Conteúdo de arquivo do workspace — inclusive o do histórico local, que é blob no disco |
| **Trilha de auditoria** | Credencial do Claude — é do SO, em `~/.claude/` |
| Metadados de workspace (allowlist, último uso) | |
| Configuração do Claude por usuário: padrões, servidores MCP (segredo **cifrado**), aprovações do `.mcp.json`, plugins, preferências de skills | O conteúdo de arquivos de `.claude/` e de plugins — lido do disco a cada pedido |

**Não duplique o transcript.** O Claude já persiste em `~/.claude/projects/*.jsonl`, e é o
mesmo arquivo que o VSCode usa. Copiar para o Postgres cria duas fontes de verdade que
divergem. Leia via funções do SDK. Ver [04-claude-integration.md](04-claude-integration.md).
A regra é de máquina: `pnpm lint:arch` reprova (`transcript-is-never-persisted`) qualquer arquivo
de `adapter/outbound/persistence/` ou `infrastructure/database/` que alcance o que lê uma conversa
— os casos de uso e o store do `transcript`, os adapters sobre o SDK, o tipo da mensagem. Nomear
uma conversa pelo id (`@domain/transcript`) continua permitido.

**O que o banco guarda sobre sessão de Claude é procedência, não conteúdo:** que *nós*
iniciamos aquele `sessionId`. O SDK não informa a origem de uma sessão, e é esse registro que
permite rotular "nossa" e "externa" na lista — e escolher a estratégia de retomada. Uma linha
de metadado não é duplicar transcript.

Esse registro é a tabela `session_origins` — `claude_session_id` (chave), `session_id`,
`user_id`, `workspace_path`, `opened_at`, e nenhuma coluna de conteúdo. Dona é `session`, que a
grava **antes** do `query()`, com o UUID que ela mesma cunhou e passou ao SDK como `sessionId`;
falha ao gravar não abre a sessão. Gravar a mesma conversa duas vezes mantém o primeiro dono.
Uma **retomada por fork** grava a linha do id novo antes do `query()`, pela mesma regra; a conversa
de origem, começada fora, continua sem linha — não é nossa. Uma retomada **in-place** não grava
nada: a linha foi escrita quando a conversa foi aberta.

A migration `0012` acrescenta `session.resumed` e `session.forked` ao CHECK de
`audit_events.kind`: retomar é fato da trilha, gravado antes do subprocesso, com a conversa
continuada como sujeito e o workspace como rótulo — nunca o resumo, que é o primeiro prompt.

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

A migration `0013` ([plano 04 · F4](../../plans/04-transcript-and-resume/F4-checkpoint.md)) muda
três coisas, uma razão cada:

- **`claude_session_id` nas duas tabelas do journal.** Uma conversa nossa continuada in-place é
  uma sessão viva **nova** sobre a **mesma** conversa, e os pontos de desfazer das sessões
  anteriores são dela também: o alcance do desfazer é a sessão viva **mais** a conversa que ela é.
  Anulável — linha anterior à `0013` não nomeia conversa e só é alcançada pela própria sessão;
- **`session_file_states.hash` anulável.** `NULL` diz que a sessão deixou **nenhum arquivo** ali: o
  próprio desfazer removeu um que o turno desfeito criara. Continua sendo linha de base — sem ela,
  um segundo desfazer para um ponto anterior leria o arquivo ausente como obra de outra pessoa;
- **`audit_events.details` (jsonb) e o tipo `session.filesRewound`.** Desfazer muda o disco e
  entra na trilha **antes** de escrever, com o ponto e cada caminho com o que acontecerá a ele —
  nunca conteúdo de arquivo, nunca mensagem da conversa. Trilha indisponível não desfaz.

A purga do store de snapshots roda num job interno (`SnapshotPurgeJob`, a cada 10 minutos, o
primeiro um minuto depois do boot) e preserva o que qualquer sessão viva alcança — as dela e as das
sessões anteriores da mesma conversa. As linhas do que ela remove saem junto, para nenhum
checkpoint apontar para blob que não existe.

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

**A escrita da pessoa nos arquivos** entra aqui também, pela migration `0016_file_events`, que só
acrescenta ao `CHECK` os kinds `file.created`, `file.written`, `file.moved`, `file.copied`,
`file.deleted` e `file.failed` — sem tocar na `0013`, já aplicada. O `subject_id` é o caminho real, o
`subject_label` o relativo à pasta aberta, e `details` leva tamanhos, hashes antes e depois, origem e
destino, contagem e `sensitive` — **nunca conteúdo de arquivo**: o conteúdo do workspace continua
fora do banco. O fato é gravado **antes** do disco; `file.failed` aponta (`details.failedEventId`)
o fato cuja escrita o disco recusou depois ([ADR-015](../shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)).
A leitura é `GET /audit-events`, no módulo de consulta ([03-modules](03-modules.md#audit)).

A F7 e a F8 do plano 07 acrescentam dois kinds, cada um por migration nova: `file.downloaded`
(`0017_file_downloads`) — baixar tira conteúdo da máquina, e entra antes do primeiro byte — e
`file.restored` (`0018_file_history`), a restauração de uma versão do histórico local. O upload
grava os `file.created`/`file.written` de sempre, com `details.source: upload`.

**A configuração do Claude** ([plano 13](../../plans/13-claude-settings/README.md)) acrescenta os kinds
`claude.defaultsChanged`, `claude.mcpServerAdded`, `claude.mcpServerChanged`, `claude.mcpServerRemoved`,
`claude.mcpServerToggled`, `claude.mcpServerTested`, `claude.mcpProjectServerApproved`,
`claude.mcpProjectServerRejected`, `claude.pluginAdded`, `claude.pluginUpdated`, `claude.pluginToggled`,
`claude.pluginRemoved` e `claude.skillSourceToggled`, pela `0020_claude_config`. São autorização
antecipada do mesmo peso de uma regra `always`: cada um amplia o que roda antes de alguém ser perguntado.
Entram **antes** do efeito; `details` leva o comando, os argumentos (redigidos quando têm forma de
segredo) e a URL por extenso e só os **nomes** das variáveis e cabeçalhos — nunca um valor.

### A configuração do Claude

As tabelas da `0020_claude_config`, todas **por usuário** — o CLI da máquina tem um login, e o que uma
pessoa configurou nunca chega à sessão de outra:

| Tabela | O quê | Chave |
|---|---|---|
| `claude_defaults` | o padrão do usuário (`folder_path` nulo) e a sobreposição de uma pasta, que vale para as subpastas: modelo, modo (nunca `bypassPermissions`, pelo `CHECK`), esforço, thinking, output style, modelo reserva; campo nulo é "não definido aqui" | `(user_id, folder_path)` `NULLS NOT DISTINCT` |
| `mcp_servers` | o store de servidores: nome, escopo `user`/`folder` (e a pasta), transporte, comando e argumentos, ou URL, ligado | `(user_id, scope, folder_path, name)` `NULLS NOT DISTINCT` |
| `mcp_server_secrets` | os valores de env e de cabeçalho, **AES-256-GCM** com a chave lida de um arquivo (`RC_MCP_SECRET_KEY_FILE`): `ciphertext`, `iv`, `tag` — nunca o valor em claro, e nunca de volta pela API ([13 · D-02](../../plans/13-claude-settings/decisions.md#d-02--segredo-de-servidor-mcp)) | `(server_id, kind, name)`, apagada com o servidor |
| `mcp_project_approvals` | a aprovação **nossa** de uma entrada do `.mcp.json` de uma pasta, pelo digest da entrada normalizada: mudou, volta a pendente | `(user_id, folder_path, name)` |
| `claude_plugins` | plugin local (diretório da allowlist) ou de marketplace (baixado pelo backend para `RC_CLAUDE_PLUGINS_DIR`, fixado no commit), o digest **aprovado**, ligado | `(user_id, path)` |
| `claude_skill_preferences` | quais origens de skill estão ligadas e quais skills desligadas, do usuário ou de uma pasta | `(user_id, folder_path)` `NULLS NOT DISTINCT` |

Uma escrita concorrente vence por inteiro: cada gravação é um `INSERT … ON CONFLICT DO UPDATE` da linha
inteira, nunca campo a campo.

### O histórico local

`file_history_entries` (migration `0018_file_history`) guarda o **metadado** de cada versão que uma
escrita da pessoa perderia: o caminho real (o sujeito, como na trilha), o relativo à pasta da
escrita (o rótulo), o tipo da entrada (`file`·`directory`), o sha256 e o tamanho, o motivo (`save`,
`delete`, `restore`, `upload`), se foi guardada (`yes`, ou `tooLarge` acima do teto de snapshot),
quem e quando, e o `batch_id` que junta os itens de um mesmo apagamento. **Nenhuma coluna de
conteúdo**: o conteúdo vai para um blob no disco do backend, endereçado pelo sha256 — a mesma razão
do store de snapshots do desfazer, que é a desta tabela não estar no Postgres com o conteúdo junto.
Não é trilha: a purga apaga linhas (por arquivo, por idade e pelo total dos blobs), e o fato que
importa para sempre — que a pessoa salvou, apagou ou restaurou — já está em `audit_events`
([ADR-015](../shared/00-decisions.md#o-histórico-local--o-backend-passa-a-guardar-conteúdo-da-pessoa)).

- O id é ULID do domínio e um `seq` (identity) ordena as páginas e a purga, como nas trilhas; o
  `created_at` é do relógio da aplicação, porque a retenção conta dele.
- `CHECK`s: tipo, motivo e `kept` conhecidos; arquivo sempre com `hash` e `size_bytes`, pasta sem
  os dois e sempre `kept = 'yes'`; `hash` só hex de 64 (é o nome do blob, nunca um caminho); só o
  `delete` tem `batch_id`, e só ele guarda pasta.
- Índices: `(path, seq DESC)` para as versões de um caminho, `path text_pattern_ops` para o prefixo
  `LIKE '<pasta>/%'` (os caracteres de padrão do nome da pasta são escapados), `batch_id`,
  `created_at` (retenção) e `hash` (o que a varredura deixa).
- **Uma trava para os dois lados:** guardar toma `pg_advisory_xact_lock_shared` na chave do
  histórico enquanto grava o blob (temporário + `rename`, ao lado) e a linha; a purga toma
  `pg_advisory_xact_lock` exclusivo na mesma chave e só então varre. Uma guarda que falha no meio
  desfaz as linhas e deixa, no máximo, um blob que ninguém nomeia — que a próxima varredura leva.

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

### As pastas que o usuário abriu

`workspace_folders` (migration `0014`) é uma linha **por pasta**, e ela é duas coisas ao mesmo tempo:
um recente e — enquanto a aba está aberta — uma aba de pasta
([06 · D-14](../../plans/06-workbench/decisions.md#d-14--onde-gravar-recentes-e-pastas-abertas)). Duas
tabelas seriam duas linhas para o mesmo fato "esta pessoa abriu esta pasta". A `workspaces`, que diz
qual **raiz** foi usada, não muda.

- A chave é `(user_id, path)`, como a de `workspaces`: abrir a mesma pasta duas vezes, ou de duas
  janelas ao mesmo tempo, atualiza a linha em vez de somar outra. É também o índice que toda
  consulta lê — toda consulta é "as pastas de um usuário".
- `last_opened_at` é nulo para a pasta tirada dos recentes com a aba aberta, e `tab_position` é nulo
  com a aba fechada; três `CHECK` repetem no banco o que o domínio garante: linha que não é recente
  nem aberta não fica, fixada é recente, posição não é negativa.
- As escritas que decidem contra as outras pastas do usuário — abrir contra o teto de abas,
  reordenar contra o conjunto aberto, podar os recentes além do teto — rodam numa transação atrás
  de um **advisory lock de transação sobre o usuário**. Sem ele, duas janelas abrindo duas pastas
  ao mesmo tempo leriam sete abas e abririam a oitava cada uma. As decisões são do domínio
  (`decideOpening`, `reorderTabs`, `recentBeyondLimit`); o repositório só as torna atômicas.

### O histórico de notificações

`notifications` (migration `0015`) guarda o centro de notificações do web por usuário
([06 · D-17](../../plans/06-workbench/decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)):
uma chave e os parâmetros dela, **nunca** conteúdo de conversa nem comando — a chave vem de um
catálogo fechado que o domínio confere antes de gravar
([06 · D-19](../../plans/06-workbench/decisions.md#d-19--o-catálogo-de-chaves-das-notificações)).

- O `id` é um ULID cunhado pelo domínio, como o das trilhas; `seq` é por onde a página é cortada,
  pela mesma razão de lá — duas entradas caem no mesmo milissegundo.
- `(user_id, client_id)` é único: o cliente que não recebeu a resposta manda de novo, e fica uma.
- `created_at` **não tem default**: é carimbado pelo relógio da aplicação, e a retenção conta dele.
- O teto de **200** é aplicado na transação que grava, atrás de um advisory lock sobre o usuário —
  duas gravações simultâneas com o usuário no teto não deixam 201. A retenção de **30 dias** (720
  horas, pelo mesmo motivo do piso da trilha) é um job de hora em hora.
- Índices, cada um com a consulta que o justifica: `(user_id, seq DESC)` para as páginas,
  `created_at` para a purga, e o par único para a gravação idempotente.

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
