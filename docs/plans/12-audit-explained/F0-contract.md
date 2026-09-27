# F0 — Contrato

Plano: [12 — Auditoria explicada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano. Fora dele, do [plano 03](../03-rules-and-audit/README.md)
concluído (a trilha consultável e a retenção) e da moldura de tela do
[plano 06](../06-workbench/README.md) só a partir da F2.
**Entrega:** o desfecho medido contra o Claude de verdade, e o contrato inteiro escrito onde o resto
do repositório lê — `backend/03`, `backend/05`, o catálogo de erros e o `web/03` — antes de uma linha
de código.

---

## Por quê

A trilha é a tabela mais protegida do produto, e este plano a alarga. Cada garantia que o plano 03
fechou — append-only por trigger, piso de 2160 horas, purga que se registra na mesma instrução,
leitura escopada, `Read` que nunca devolve conteúdo — precisa continuar verdadeira **depois** da
migration. Escrever o contrato primeiro é o que permite conferir isso no papel, onde errar custa uma
linha, e não no banco de alguém, onde a migration já aplicada não se edita.

E o desfecho depende de um fato que ninguém mediu: **quais hooks o CLI dispara em cada caso**. A
[ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)
nasceu exatamente de um "parece que" que o spike desmentiu (6 hooks para 2 `canUseTool`); o desfecho
merece a mesma disciplina.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Spike: quais hooks disparam em cada desfecho 🔲

Contra o Claude local, com o `scripts/record-agent-sdk-fixtures.mjs` que já grava as fixtures do SDK
falso, registrar para cada caso **quais** de `PostToolUse`, `PostToolUseFailure` e `PermissionDenied`
disparam, em que ordem em relação ao `canUseTool` e ao `permission.resolved`, e com que campos:

- tool que conclui; `Read` de arquivo inexistente; `Bash` com saída 0 e com saída ≠ 0; `Bash`
  interrompido no meio (`session.interrupt`); tool negada pelo `canUseTool`; tool negada por `deny`
  de `.claude/settings.json` do projeto; pergunta que expira; `PreToolUse` que recusa (trilha
  indisponível); tool MCP;
- de onde sai o código de saída do `Bash` — o `BashOutput` do SDK `0.3.277` **não** tem campo de
  código, e a hipótese é o prefixo `Exit code N` do `error`;
- se `duration_ms` vem sempre, e se `tool_use_id` do hook de desfecho casa com o do `PreToolUse`.

O resultado vai para uma seção nova da [descoberta](../../discovery/01-descoberta-claude-agent-sdk.md)
(o registro dos spikes) e alimenta a [D-01](decisions.md#d-01--onde-mora-o-desfecho). As fixtures
gravadas entram no SDK falso: é delas que a F1 e a F4 tiram os cenários, em CI, sem o Claude real.

### B-02 — `backend/03` e `backend/05`: o desfecho, o vínculo e a leitura nova 🔲

Atualiza os dois documentos normativos, na mesma entrega, conforme as decisões D-01…D-07:

- [backend/05 · a trilha](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria): a linha de
  desfecho (onde mora, que colunas, que `CHECK`), as colunas de vínculo (`workspace_path`,
  `claude_session_id`, `prompt_id`, `tracks_outcome`), o `device_id` que deixa de ser sempre nulo, o
  índice de busca — e, **escrito de novo e sem mudança**, que a trigger, o piso e a purga continuam
  valendo para as linhas novas. A seção "Auditoria — append-only" do mesmo documento ainda diz que o
  append-only é "garantido por permissão de role", o que a D-06 do plano 01 trocou por trigger, e
  que a escrita de auditoria acontece "na mesma transação da decisão", quando a linha de decisão é
  gravada depois, sem ser esperada (`RecordDecisionOnResolved`): a B-02 corrige as duas frases;
- [backend/03 · audit](../../architecture/backend/03-modules.md#audit): o hook de desfecho (registra,
  **nunca** recusa — a tool já rodou), a invocação como unidade, a linha do tempo com os eventos, as
  rotas novas, e as setas novas do diagrama de fronteiras — a leitura de `audit` passa a consultar
  `transcript` (título) e `session` (sessão viva, procedência). `audit` continua **write-only para os
  outros**: ninguém que escreve recebe como ler.

### B-03 — Contrato HTTP das rotas novas 🔲

Em [backend/03 · audit](../../architecture/backend/03-modules.md#audit), com a tabela de status de
cada uma, no formato que `GET /audit-entries` já usa:

| Rota | Para quê |
|---|---|
| `GET /audit/timeline` | a linha do tempo: invocações e eventos (D-03), filtros `types`, `sessionId`, `folder`, `toolName`, `decision`, `outcome`, `q`, `from`, `to`, `toolUseId`; `cursor` composto; `limit` 1…100 |
| `GET /audit/invocations/:id` | uma invocação: a linha do tempo inteira e os vínculos |
| `GET /audit/events/:id` | um evento de conta, com `details` e vínculos |
| `GET /audit/summary` | as contagens do período para o cabeçalho: por decisão, desfecho, tool e pasta |
| `GET /audit/facets` | o que os seletores oferecem: sessões (pasta, título, datas, contagem), tools vistas, pastas |
| `GET /audit/export` | o recorte filtrado como arquivo — contrato escrito aqui, rota implementada na F3 depois da ADR |
| `GET/POST/PATCH/DELETE /audit/views` | visões salvas, se a [D-10](decisions.md#d-10--visões-salvas) as puser no servidor |

Toda rota responde `200` com página ou recurso; `400 INVALID_INPUT` para o que não se entende; `403
FORBIDDEN` para o que é de outra pessoa ([03 · D-17](../03-rules-and-audit/decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro));
`404`/`410` conforme a [D-07](decisions.md#d-07--a-invocação-que-passou-dos-90-dias). `GET /audit-entries`
fica como está (S-70). Os endpoints novos entram nos limites de taxa do
[plano 05](../05-hardening-operations/README.md) quando ele chegar.

### B-04 — Os códigos novos, no catálogo e nas duas línguas 🔲

No [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) **antes** do
código, e no `error-catalogue.ts` na mesma entrega:

| `code` | HTTP | Significa |
|---|---|---|
| `AUDIT_ENTRY_NOT_FOUND` | 404 | invocação ou evento que nunca existiu (ou o par `sessionId`/`toolUseId` que ainda não foi gravado) |
| `AUDIT_ENTRY_PURGED` | 410 | existiu, a retenção de 90 dias o removeu, e não volta |
| `AUDIT_EXPORT_TOO_LARGE` | 422 | o recorte passa do teto da exportação — `params.limit`, `params.count` |
| `AUDIT_VIEW_NOT_FOUND` | 404 | visão salva que não existe |
| `AUDIT_VIEW_NAME_TAKEN` | 409 | já há uma visão com esse nome |
| `AUDIT_VIEW_LIMIT_REACHED` | 422 | acima do teto de visões por usuário — `params.limit` |

Cada um com `messageKey` em `en` e `pt-BR` que diz **o que fazer** ("estreite o período ou filtre por
pasta"), não só o que falhou (S-114).

### B-05 — `web/03` e `web/04`: a tela de auditoria redesenhada 🔲

Reescreve a seção [Trilha de auditoria do web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria)
para o que este plano entrega — invocação como unidade, cabeçalho com propósito e ajuda (a moldura do
[plano 06](../06-workbench/README.md)), resumo do período, lista em colunas agrupável, painel de detalhe
com a história em frases, filtros por seletor, visões, endereço permanente, eventos na linha do tempo,
exportação — mantendo as regras de lá que continuam valendo (cursor, rascunho de filtro, link que
sobrevive ao login, regra que abre em qualquer estado).

Em [web/04 · a URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado): o que vai na
search de `/audit` (filtros, `group`, `view`, `open`) e as rotas novas — `/audit/invocations/$invocationId`
e `/audit/events/$eventId`, os endereços permanentes.

### B-06 — O contrato dos tipos de evento que outros planos acrescentam 🔲

Os planos seguintes gravam fatos novos em `audit_events`: arquivos escritos pelo humano
([07](../07-explorer-and-editor/README.md)), mutações de git ([09](../09-search/README.md)),
terminal ([10](../10-integrated-terminal/README.md)), servidores MCP ([11](../11-claude-settings/README.md)),
criação e ajuste de regra ([13](../13-rules-management/README.md)), aparelhos ([15](../15-devices/README.md)).
Sem uma regra, cada um aparece na tela como um nome técnico solto.

A regra, escrita em `backend/03 · audit`: `kind` é `<módulo>.<fato no passado>`; `details` nunca leva
conteúdo de arquivo, mensagem da conversa, tecla digitada nem segredo; e **todo kind novo traz, na mesma
entrega, a explicação dele no registro de tipos do web** (frase, ícone, vínculo). Um teste compara a
lista `AUDIT_EVENT_KINDS` do domínio com o registro do web e reprova o kind sem explicação (S-05). Tipo
que a tela não conhece continua aparecendo, com o nome técnico e "esta versão não sabe explicar este
tipo" (S-116) — nunca some.

---

## Cenários cobertos

S-01…S-05. As tasks de documento (B-02, B-03, B-05) não têm cenário próprio: o que elas desenham é
provado pelos cenários das tasks que as implementam, citados no [rastreio](README.md#rastreio).

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
