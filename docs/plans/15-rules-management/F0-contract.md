# F0 — Contrato

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano. Fora dele, do [plano 03](../03-rules-and-audit/README.md)
concluído (é o que se gerencia aqui), do [plano 28](../28-agent-neutral-core/README.md) concluído (a
gramática canônica de regra e o `RuleDialect` tradutor da F5 de lá, o `kind` canônico, os modos canônicos
e o REST no pacote `contracts` — [D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)) e da F0 do
[plano 06](../06-workbench/README.md) só para os nomes de rota da navegação global.
**Entrega:** o contrato inteiro da gestão de regras escrito nos documentos normativos — rotas,
campos, códigos de erro, kinds da trilha, a gramática endurecida e o desenho da tela — antes de
uma linha de código.

---

## Por quê

Este plano mexe na fronteira de segurança do produto: quem cria regra, com que largura, e o que o
casamento de padrão aceita. Contrato escrito depois do código é contrato que descreve o código,
não o que se quis garantir. E cinco decisões desta fase mudam comportamento que o plano 03 entregou
([D-07](decisions.md#d-07--comando-composto-e-o-prefixo), [D-09](decisions.md#d-09--o-que-é-largo-demais),
[D-10](decisions.md#d-10--project-alcança-as-subpastas)) — elas precisam estar nos documentos antes
de virar teste.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — `backend/03-modules.md`: a superfície nova do módulo `permission` 🔲

A seção [`permission`](../../architecture/backend/03-modules.md#permission) ganha as rotas das B-02 e
B-03, com a tabela de status de cada uma, e as regras que as governam: só validade se edita
([D-01](decisions.md#d-01--o-que-se-edita-numa-regra)), largura recusada por qualquer porta
([D-09](decisions.md#d-09--o-que-é-largo-demais)), pasta validada pelo `workspace`, teste e simulação
sem efeito colateral.

As [fronteiras](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)
ganham duas arestas, e o texto diz por que nenhuma cria ciclo (a terceira — `permission` → `RuleDialect`,
implementado pelo adapter de cada motor só para traduzir a regra canônica — é da
[F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md), e este plano só a usa:
[D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)):

- **`permission → workspace`** — criar regra `project`, testar comando numa pasta e remapear pasta na
  importação resolvem o caminho pelo `ResolveWorkspaceUseCase`, por uma porta declarada em
  `application/permission/ports/` (`RuleFolderResolver`). Hoje o controller só normaliza o caminho
  com `WorkspacePath.create` — e aceita qualquer pasta;
- **`permission → audit` (leitura)** — uso, invocações, história da regra e simulação leem pelo
  `AuditTrailReader` ([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação)). A regra 4
  ("ninguém lê de dentro do fluxo") continua valendo: **a decisão** de permissão — a
  `PermissionRuleBook` — nunca lê a trilha; só as rotas de consulta da tela.

A seção [`audit`](../../architecture/backend/03-modules.md#audit) ganha o filtro `ruleId` em
`GET /audit-entries` (S-62) e os kinds da B-05.

### B-02 — Contrato das rotas de leitura 🔲

Todas sob `Bearer`, escopadas pelo chamador, com o log de I/O em `debug` sem padrão, comando nem
caminho no corpo do log — só contagens, ids e status ([03-logging](../../architecture/shared/03-logging.md)).

| Rota | O que devolve |
|---|---|
| `GET /permission-rules` | a listagem. **Sem parâmetro, idêntica à de hoje** (S-01): ativas e expiradas, sem revogadas, mais novas primeiro. Filtros opcionais `status` (`active`,`expired`,`revoked`,`disabled`, múltiplo — `disabled` é a regra que a migração do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md) desligou, e também fica fora sem parâmetro), `scope`, `decision`, `engine`, `kind` (o canônico), `folder`, `expiresBefore`, `q` (literal, sem curinga — S-45); `sort` (`grantedAt`, `expiresAt`, `lastUsedAt`, `useCount`, `pattern`) e `order`; teto de 1000 com `truncated` ([D-13](decisions.md#d-13--a-listagem-pagina)) |
| `GET /permission-rules/summary` | contagens por estado (com `disabled`), decisão e escopo, e quantas ativas expiram antes de `expiresBefore` — para as abas e o selo da navegação |
| `GET /permission-rules/:ruleId` | a regra enriquecida, em qualquer estado, com o cabeçalho `ETag` |
| `GET /permission-rules/:ruleId/invocations` | as invocações que a regra respondeu, keyset descendente sobre o `seq` da trilha (`cursor`, `limit` 1–100), com os campos que a trilha deixa sair (nunca conteúdo de `Read`) |
| `GET /permission-rules/:ruleId/history` | os eventos da própria regra em `audit_events` (concedida, validade mudada, revogada, restaurada), do chamador |
| `GET /permission-rules/templates` | o catálogo de modelos ([D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram)), na gramática canônica, com `engine` nulo — um catálogo só |
| `GET /permission-rules/export` | o arquivo da [D-17](decisions.md#d-17--exportar-e-importar), com os mesmos filtros da listagem, `Content-Disposition: attachment` |

Os campos **acrescentados** à regra — aditivos, o app Flutter os ignora (S-02):

- `engine` e `kind` — `engine` nulo na regra canônica, que vale em todo motor com o `kind`, e o nome do
  motor só na regra restrita a ele; `kind` é o da gramática canônica (`shell`, `file.read`, `file.edit`,
  `file.write`, `search`, `web.fetch`, `mcp`, `agent`) ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect));
- `pattern` — na **gramática canônica** do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md)
  (`shell(git status:*)`, `file.edit(src/**)`, `mcp(srv:tool)`), como hoje é a do Claude;
- `reach` — o alcance estruturado que o **domínio** lê do padrão canônico (`describeReach`):
  `{ engine?, kind, form: any|exact|prefix, content, excludesCompound }`, em forma canônica, sem nome de
  ferramenta do motor. É dele que a tela escreve a frase; o cliente **não** reinterpreta o padrão (a
  mesma razão do [plano 03 · D-12](../03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta));
- `breadth` — `narrow` | `broad` | `unbounded`, calculado pelo domínio, pela tabela da D-09 por `kind`;
- `legacyPattern` e `disabledReason` (`messageKey` + `params`) — só na regra `disabled`: o padrão antigo
  como texto opaco e o porquê de a migração do 28 não o ter traduzido; ela não tem `reach` nem `breadth`
  (S-224);
- `findings` — os achados da B-15 que envolvem a regra, cada um com `kind`, as regras relacionadas e
  os parâmetros da explicação;
- `usage` — `{ count, lastUsedAt, windowDays }`;
- `grantedVia` (`approval` | `request` | `import` | `restore` | `null` para anterior à migration),
  `grantedFromRequestId`, `templateId`, `restoredFrom`;
- `folderReachable` — se a pasta de uma regra `project` ainda está na allowlist do chamador;
- `etag`.

O `grantedBy` continua (é o `sub` do dono, como hoje) — a tela passa a dizer "você", e a origem diz
de onde.

### B-03 — Contrato das rotas de escrita, de teste e de simulação 🔲

| Rota | O que faz | Recusas |
|---|---|---|
| `POST /permission-rules` | como hoje, mais: o `pattern` na gramática canônica, validado pelo domínio (a forma antiga `Bash(…)` é `400`); `engine` opcional (ausente = regra canônica, para todo motor com o `kind`; presente = restrita a um motor registrado); `projectPath` resolvido pela allowlist; largura conferida, com `acknowledgeBroad`; `templateId` opcional; origem `request` | `400` padrão/entrada; `403 WORKSPACE_NOT_ALLOWED`/`FORBIDDEN`; `404 WORKSPACE_NOT_FOUND`; `422 WORKSPACE_NOT_A_DIRECTORY`, `PERMISSION_RULE_TOO_BROAD`, `PERMISSION_RULE_EXPIRY_TOO_LONG` |
| `PATCH /permission-rules/:ruleId` `{ expiresAt }` com `If-Match` | encurta ou estende; `200` com a regra e o `ETag` novo; a regra `disabled` é `409` (S-226) | a ordem fixa (S-72): `404` → `403 PERMISSION_NOT_OWNED` → `428 PRECONDITION_REQUIRED` → `409 PERMISSION_RULE_STATE_CONFLICT` → `412 PERMISSION_RULE_CHANGED` → `400`/`422` de validade |
| `POST /permission-rules/revoke` `{ ids }` | revoga em lote, atômico ([D-06](decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)); `200` com as regras | `400` (vazio, > 100); `404`; `403` — nada revogado |
| `POST /permission-rules/restore` `{ ids }` | desfaz revogações recentes ([D-11](decisions.md#d-11--desfazer-a-revogação)); `201` com as regras novas | `404`; `403`; `409 PERMISSION_RULE_STATE_CONFLICT`; `410 PERMISSION_RULE_RESTORE_WINDOW_CLOSED`; `422` de largura e teto |
| `POST /permission-rules/evaluate` | testa um comando: `{ engine, kind, subject, rawInput?, folder?, mode?, sessionId?, draft? }` → `{ outcome: allow\|deny\|ask, answeringRule, matching[], reasons[], caveats[] }` ([D-12](decisions.md#d-12--o-que-o-teste-de-comando-considera)), com as regras e o rascunho na gramática canônica. `engine` diz qual motor perguntaria (as regras com `engine` nulo e as restritas a ele contam); `mode` é o canônico (`ask` · `acceptEdits` · `readOnly` · `allowAll`); `rawInput` é opaco, só para a entrada exata; as `caveats` — o que o motor decide antes de nós — vêm do adapter do motor ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)) | `400`; `403 WORKSPACE_NOT_ALLOWED`/`FORBIDDEN` |
| `POST /permission-rules/preview` | analisa um rascunho: `{ draft }` (`engine` opcional; o padrão na gramática canônica, ou `{ kind, subject, form }` para o domínio escrevê-lo) → `{ pattern, reach, breadth, findings[] }`, tudo canônico | `400 PERMISSION_RULE_PATTERN_INVALID`; os da pasta |
| `POST /permission-rules/simulate` | `{ add?: draft[≤10], remove?: ruleId[≤100], folder?, limit? }` → contagens, itens que mudam, `withoutFolder`, `assumedMode` (canônico, `ask`) ([D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta)) | `400`; `403 PERMISSION_NOT_OWNED` |
| `POST /permission-rules/import/preview` | veredito por item e `digest` | `400`; `413 PAYLOAD_TOO_LARGE`; `422 PERMISSION_RULE_IMPORT_UNSUPPORTED` |
| `POST /permission-rules/import` | aplica os aceitos; `201` com criadas e existentes | os da prévia, mais `422 PERMISSION_RULE_IMPORT_REJECTED` com `details[]` |

**Teste, prévia e simulação não têm efeito colateral** — nenhuma linha em tabela nenhuma, nenhum
evento, nenhum push (S-102, S-128). São `POST` porque o corpo carrega comando e rascunho, que não
podem ir para a query string nem para o log de acesso.

Nenhuma rota nova ou mudança aqui toca o WebSocket: o schema do WS em `packages/contracts/schema` não
muda, e por isso o critério do plano é só `pnpm verify:full`. As rotas REST, sim: pela
[28 · D-09](../28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa), cada rota nova e cada
mudança desta tabela e da B-02 nasce com schema em `packages/contracts/schema/http/` — onde a
[B-48 do 28](../28-agent-neutral-core/F6-engine-extensions.md#b-48--o-resto-do-rest-no-pacote-contracts-)
pôs as de `/permission-rules` que já existem —, com o tipo gerado para TypeScript e Dart, e o
`contracts:check` reprova a rota sem schema (S-135 do 28). Os limites de taxa das rotas novas
entram nos [limites do plano 05](../05-hardening-operations/README.md).

### B-04 — Códigos de erro novos no catálogo e nas três pontas 🔲

No [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio), no
`error-catalogue.ts` e com `messageKey` em en e pt-BR — o texto diz **o que fazer**, não só o que
houve:

| `code` | HTTP | Significa |
|---|---|---|
| `PERMISSION_RULE_TOO_BROAD` | 422 | o padrão alcança mais do que uma regra `allow` pode alcançar (`params.breadth`: `unbounded`, ou `broad` sem confirmação) |
| `PERMISSION_RULE_STATE_CONFLICT` | 409 | a regra não está no estado que a operação exige — estender uma revogada ou expirada, restaurar uma que não foi revogada (`params.status`) |
| `PERMISSION_RULE_CHANGED` | 412 | o `If-Match` é de uma versão que não é mais a atual |
| `PRECONDITION_REQUIRED` | 428 | a operação exige `If-Match`. **Compartilhado** com o [plano 07](../07-explorer-and-editor/README.md), que o propõe para a escrita de arquivo: quem chegar primeiro o acrescenta, o outro reusa |
| `PERMISSION_RULE_RESTORE_WINDOW_CLOSED` | 410 | passou a janela de desfazer a revogação — o caminho é criar de novo |
| `PERMISSION_RULE_IMPORT_UNSUPPORTED` | 422 | o arquivo não é do formato, ou é de uma versão que esta instalação não lê |
| `PERMISSION_RULE_IMPORT_REJECTED` | 422 | um ou mais itens aceitos não podem ser criados; `details[]` por índice, com o código de cada um |

O teste de paridade (S-03) confere as três fontes. O status de cada um segue a
[tabela do doc 04](../../architecture/shared/04-errors-and-http.md#erro-do-cliente); `412` e `428`
entram nela.

### B-05 — Kinds novos na trilha, e os `details` dos que existem 🔲

`audit_events` ganha, por migration versionada nova que reescreve o `CHECK` de `kind` (S-04):
`permission.ruleExpiryChanged` (`details`: `from`, `to`), `permission.rulesExported` (`count`,
filtros) e `permission.rulesImported` (`count`, `created`, `existing`). Os que já existem ganham
`details` quando há o que dizer: `permission.ruleGranted` com `grantedVia`, `templateId`,
`restoredFrom`; `permission.ruleRevoked` com `batchId`.

Nunca input de tool, conteúdo de arquivo, nem nada de outra pessoa (S-05). Documentado em
[backend/05](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) e na seção `audit`
do `backend/03`.

### B-06 — `web/03-ui-system.md` e `web/02`: a tela de gestão de regras 🔲

A seção [Regras](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada) é
reescrita para a tela deste plano — sem perder nada do que ela garante (rota própria, os dois pontos
de entrada, revogar a um clique, falha que mantém a linha, sete dias, segundo passo):

- a moldura de tela do [plano 06](../06-workbench/README.md) (título, propósito numa linha, gaveta de
  ajuda) e a navegação global;
- abas de estado, filtros na search, tabela densa, painel de detalhe lateral, seleção e lote, menu de
  contexto, atalhos na paleta;
- o assistente em `/rules/new` ([D-19](decisions.md#d-19--rota-própria-para-o-assistente)), o teste de
  comando, a simulação, modelos, duplicar, exportar e importar;
- "desfazer" no lugar de confirmar na revogação avulsa, prévia no lote ([D-11](decisions.md#d-11--desfazer-a-revogação));
- a frase de alcance vem do `reach` do servidor, nunca de reinterpretar o padrão; o texto do núcleo
  nomeia o agente como `{agent}`, a gramática canônica (`shell(git status:*)`, o que o prefixo não cobre)
  é ajuda do núcleo, e o que só vale para o Claude (o que o CLI decide antes) é ajuda registrada por
  `web/src/engines/claude/` ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect));
- a lista das regras que a migração do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md)
  desligou, com o padrão antigo, o motivo e "recriar" (B-21).

E corrige o que está errado lá hoje: a linha "A linha mostra escopo, tool, padrão, autor, data e
**validade**" aparece **duas vezes** seguidas. `web/02-folder-structure.md` ganha as pastas novas
da feature `permission`.

### B-07 — O documento da gramática e o `backend/05`: a gramática endurecida e as colunas novas 🔲

A gramática é a **canônica**, do domínio ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect), revisão de 2026-10-10). A
[F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md) a escreve em
[backend/03 · `permission`](../../architecture/backend/03-modules.md#permission) e no ADR-025, e põe no
anexo `backend/04a-claude.md` só o dialeto do Claude — como a regra canônica vira o `updatedPermissions`
e como a sugestão nativa vira canônica. Esta task escreve na seção da gramática, no `backend/03`, o que
a leitura do código mostrou faltar (e no ADR-025 só o que mudar o contrato dela); o anexo não ganha nada:

- o prefixo e o comando composto em `shell` ([D-07](decisions.md#d-07--comando-composto-e-o-prefixo)) — a
  assimetria `allow`/`deny`, a falha fechada entre aspas, e o "lombada, não sandbox" do `deny`;
- o prefixo em `file.*` ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho));
- a largura por `kind` ([D-09](decisions.md#d-09--o-que-é-largo-demais)) e onde ela é conferida;
- `project` é a pasta exata da sessão, não a raiz nem as subpastas ([D-10](decisions.md#d-10--project-alcança-as-subpastas)).

[As regras de permissão](../../architecture/backend/05-persistence.md#as-regras-de-permissão) ganham
as colunas `granted_via`, `granted_from_request_id`, `template_id`, `restored_from` e
`expiry_reminded_at` (anuláveis; linha antiga fica nula e a tela diz "não registrado") e o índice
de filtro; [a trilha](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) ganha o
índice parcial por `rule_id` ([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação)). A
[configuração que falha fechada](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada)
ganha os tetos de `deny` ([D-04](decisions.md#d-04--deny-sem-validade)), a janela de restauração e
o intervalo do job de lembrete.

---

## Cenários cobertos

S-01…S-06, S-223.

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
