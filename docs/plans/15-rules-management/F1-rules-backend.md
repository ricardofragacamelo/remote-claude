# F1 — Backend de regras

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md), e das decisões D-01, D-02, D-04…D-18 do
[decisions.md](decisions.md). Fora do plano, da [F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md):
a gramática canônica de regra, no domínio, e o `RuleDialect` que só a traduz para o motor
([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)).
**Entrega:** o backend inteiro da gestão — casamento endurecido, criação que confere pasta e
largura, listagem filtrada com uso, validade, lote, desfazer, teste de comando, análise, simulação,
modelos, exportar/importar e lembrete —, com as garantias do plano 03 provadas de novo.

---

## Por quê a ordem das tarefas

O casamento (B-08) vem primeiro porque tudo depois dele o usa: a largura que a criação confere, a
contenção que a análise precisa, a precedência que o teste e a simulação chamam. Uma segunda cópia do
matcher em qualquer dessas rotas seria o defeito que o [plano 03 · D-12](../03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)
descreveu — a cópia que envelhece diferente é a que mostra um alcance e aplica outro.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-08 — O casamento conhece a decisão, e a largura é do domínio ✅

Em `domain/permission/services/`, três funções puras novas e uma mudança:

- **o casamento de `Bash` passa a conhecer a decisão** ([D-07](decisions.md#d-07--comando-composto-e-o-prefixo)):
  `allow` de prefixo não responde comando com operador de shell, mesmo entre aspas; `deny` de prefixo
  casa por segmento. `PermissionRule.matches` passa a decisão ao `ruleMatches`; `answeringRule` não
  muda (S-19);
- `ruleBreadth(pattern)` → `narrow` | `broad` | `unbounded`, pela tabela da [D-09](decisions.md#d-09--o-que-é-largo-demais),
  com a lista de interpretadores e lançadores como dado do domínio;
- `patternCovers(a, b)` — se tudo que `b` casa, `a` casa: a contenção de que a análise (B-15)
  precisa, decidível na nossa gramática (tool ⊇ prefixo ⊇ exato, prefixo na fronteira de token);
- `describeReach(pattern)` — o `reach` estruturado da B-02.

Testes: unit por fronteira, com cada operador (S-07…S-17) e as regressões do plano 03 (S-13, S-19);
um teste **por propriedade** sobre comandos gerados prova que a mudança só anda na direção segura
(S-20); integração com uma sessão viva e uma regra de prefixo antiga (S-21). O `risk.classifier.ts`
já reconhece `&&` como destrutivo — a lista de operadores é **uma**, compartilhada pelos dois, não
duas que divergem.

Pausada em 2026-10-10 até a [F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md)
([28 · D-12](../28-agent-neutral-core/decisions.md)); retoma escrita sobre a gramática canônica do
plano 28 ([28 · D-11, D-18](../28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto)).

**Concluída em 2026-11-05.** `ruleBreadth`, `patternCovers` e `describeReach` em
`domain/permission/services/rule-breadth.ts`, `rule-containment.ts` e `rule-reach-description.ts`;
o casamento composto do `allow`/`deny` já existia (antecipado em 2026-09-26) e só foi confirmado. A
leitura do código durante esta tarefa achou um quinto fato: a F5 do plano 28 (B-31) já havia fixado a
forma de caminho como glob só, e nunca deixou `:*` alcançar um `kind` de caminho — a parte da D-08
sobre aceitar `:*` em `file.*` com o achado `pathPrefix` descrevia uma porta que não existe mais.
S-14 foi reescrito para refletir isso (recusa, não aceitação), e a linha `pathPrefix` da tabela de
achados da B-15, abaixo, não tem mais o que calcular — fica registrada ali como decisão revertida,
não como trabalho pendente. Também corrigido, pela mesma leitura: `readShell` agora colapsa espaço
repetido/tabulação no padrão antes de ler (S-17) — sem isso, `shell( git  status :*)` gravava
`" git  status"` como conteúdo, lido depois como um comando diferente do que a pessoa digitou.

### B-09 — Criar regra: pasta pela allowlist, largura, validade de `deny`, origem ✅

A `GrantPermissionRuleUseCase` continua sendo **a** rotina de concessão ([plano 03 · D-10](../03-rules-and-audit/decisions.md#d-10--dois-caminhos-para-nascer-uma-rotina)),
e ganha, na ordem:

1. **pasta** — regra `project` que não vem do card resolve o caminho pela porta `RuleFolderResolver`
   (adapter chamando o `ResolveWorkspaceUseCase`): fora da allowlist, de outra pessoa, inexistente,
   arquivo, symlink que escapa (S-22…S-28). O caminho gravado é o que a sessão carrega para a mesma
   pasta (S-29), e o casamento alcança a pasta **e as subpastas** dela, por prefixo com fronteira de
   segmento (S-30, [D-10](decisions.md#d-10--project-alcança-as-subpastas), decidido em 2026-11-05
   contra a recomendação original). O card não passa por aqui: a pasta dele **é** a da sessão, já
   resolvida (S-34);
2. **largura** — `allow` `unbounded` recusado, `broad` só com `acknowledgeBroad` (S-31…S-33). Vale
   para toda porta: `POST`, importação, restauração, modelo. A largura é do domínio, pela tabela por
   `kind` canônico da D-09, para a regra de qualquer `engine` — nula ou restrita
   ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect));
3. **validade de `deny`** com default e teto próprios, limitados no código ([D-04](decisions.md#d-04--deny-sem-validade), S-37, S-38);
4. **origem** — migration versionada nova com as colunas anuláveis da B-07; o card grava
   `approval` e o `requestId`, o `POST` grava `request` e o `templateId` validado contra o catálogo
   (S-35, S-36).

O que não pode mudar, e os cenários de regressão provam: concessão concorrente vira uma linha (S-39),
trilha indisponível revoga o que foi criado (S-40), e **nada** sai em `updatedPermissions` (S-41). O
teste de integração que hoje concede `allow Write` com `always` (`allow file.write` depois da migração
do 28) passa a mandar `acknowledgeBroad` — o contrato mudou; o teste não afrouxou.

**Concluída em 2026-11-05.** `GrantPermissionRuleCommand.projectPath` passa a ser
`{ trusted: string } | { raw: string } | null`: `trusted` é o caminho que o card já resolveu (a
pasta da própria sessão), `raw` é resolvido dentro da rotina de concessão por um `RuleFolderResolver`
novo (`application/permission/ports/rule-folder-resolver.port.ts`, implementado por
`WorkspaceModuleRuleFolderResolver` chamando o `ResolveWorkspaceUseCase`, no molde do
`FolderResolver` do plano 07). A largura (`rule.breadth`, novo getter na entidade, sobre `ruleBreadth`
da B-08) só é conferida para `grantedVia !== 'approval'` — o card nunca vê `acknowledgeBroad`, por
desenho (S-34): uma reach de prefixo de um token (`shell(ls:*)`) que o card ofereça é `broad` pela
tabela da D-09, e exigir confirmação dele quebraria a promessa do plano 03 de "sem segundo passo de
largura". `deny` ganha default/teto próprios (`ruleDenyDefaultLifetimeMs`/`ruleDenyMaxLifetimeMs`,
variáveis `RC_PERMISSION_RULE_DENY_DEFAULT_LIFETIME_MS`/`_MAX_LIFETIME_MS`, teto de 5 anos no código,
`RULE_DENY_LIFETIME_CEILING_MS`). O alcance de `project` (D-10) é `projectPathReaches` — pasta e
subpastas, fronteira de segmento — em `domain/permission/services/project-reach.ts`, usado pela
entidade (`reaches()`) e espelhado no SQL de `findApplicable` com `starts_with()` (nunca `LIKE`, que
leria `%`/`_` de um nome de pasta como curinga). A origem (`grantedVia`, `grantedFromRequestId`,
`templateId`, `restoredFrom`) é campo da entidade e da linha, lida como "não registrada" (`null`)
numa regra anterior à coluna — exposta em `PermissionRulePayload` (S-35). **Gap conhecido:**
`templateId` ainda não é validado contra um catálogo — a B-17 (modelos) não existe nesta fase; o campo
é aceito e gravado, mas S-36 (`templateId` que o catálogo não tem → `400`) fica para quando a B-17
entrar. O teste de integração `permission-rules-api.spec.ts` foi ajustado para resolver `PROJECT`
dentro do allowlist real da suíte (antes, um caminho fixo fora de qualquer allowlist, que passava
porque nada o conferia) — não rodado nesta tarefa (critério de fase é só `pnpm verify`), mas corrigido
porque senão quebraria na primeira `pnpm test:integration`.

### B-10 — Listar com filtros, ordenação, busca, resumo e os campos novos ✅

`ListPermissionRulesUseCase` recebe os filtros da B-02 e o repositório os aplica no predicado,
**sempre** com `user_id` do chamador (S-49). Busca `q` com `ILIKE` e escape de `%`, `_` e `\` (S-45).
Ordenação estável com desempate por `id` (S-47); ordenar por uso junta a contagem da B-11 na mesma
consulta. A paginação é por **cursor** sobre `(granted_at, id)`
([D-13](decisions.md#d-13--a-listagem-pagina), decidido em 2026-11-05 contra a recomendação original
do plano — lista-tudo-com-teto): o repositório expõe os dois modos, a página cursor-limitada para esta
rota e uma leitura interna sem paginação para a B-15, que precisa do conjunto inteiro de regras ativas
do chamador para achar redundância e sobreposição, não da página que a tela tem carregada.

Cada item sai com `engine`, `kind`, `reach` e `breadth` (do domínio, sobre o padrão canônico), `findings` (da
B-15, sobre o conjunto ativo do chamador),
`usage`, a origem, `etag` (derivado de `expires_at` e `revoked_at` — sem coluna de versão) e
`folderReachable`, que confere a pasta contra a allowlist do chamador pela regra pura, **sem** tocar o
disco (S-52). `GET /permission-rules/summary` conta sobre o mesmo predicado (S-53).

`status=disabled` traz as regras que a migração do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md)
desligou por não terem tradução inequívoca ([28 · D-18](../28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto)):
com o `legacyPattern` (texto opaco, nunca interpretado) e o `disabledReason`, sem `reach`, `breadth`,
`findings` nem `usage`. Elas ficam fora da listagem sem parâmetro (S-01) e nunca entram no conjunto que
responde, que analisa ou que simula (S-224).

Índice novo para os filtros mais comuns (`user_id`, `revoked_at`, `expires_at`), na mesma migration da
B-09, com o plano de execução verificado (S-54) — o índice atual é parcial em `revoked_at IS NULL` e
não serve à aba "Revogadas".

**Concluída em 2026-11-05.** `PermissionRuleRepository` ganha `listPage` (filtros + cursor sobre
`(sortValue, grantedAt, id)`, genérico: o cursor carrega o valor do próprio campo ordenado, não só
`grantedAt`/`id`, para que ordenar por `expiresAt`/`pattern` também pagine sem repetir nem pular —
migration `0030_rules_list_index.sql`, índice `(user_id, granted_at DESC, id DESC)` sem `WHERE`, que
serve qualquer `status`), `listAllMatching` (sem paginação, para a B-15 futura e para o caminho de
`lastUsedAt`/`useCount`) e `summarize`. `lastUsedAt`/`useCount` **não** são ordenáveis pelo
repositório — a fronteira do `backend/03` proíbe `permission` de ler a trilha fora do
`AuditTrailReader` — e saem do caso de uso: `ListPermissionRulesUseCase.search()` lê todas as regras
que casam o filtro, pede o uso ao `AuditTrailReader.usageOf()`, ordena em memória e devolve **uma
página só** (sem continuação — pedir uma segunda página de uma ordenação por uso ainda não é
suportado; gap registrado). `byDecision`/`byScope`/`expiringBefore` do resumo contam sobre o mesmo
conjunto default da listagem (`active`+`expired`), nunca sobre revogadas/desligadas — "o mesmo
predicado da listagem" lido como o predicado **default**, já que o resumo não recebe filtro de
`status`. `findings` (B-15) fica ausente, como o contrato já previa. `folderReachable` é
`RuleFolderResolver.reaches()`, novo método sobre `WorkspaceAllowlistSource.admits()` (puro, sem
tocar o disco). **Gap conhecido:** o achado `unreachable` de uma regra fora da allowlist (parte de
S-52) é da B-15 (análise), que ainda não existe — só o campo `folderReachable: false` está pronto.

### B-11 — Uso, invocações e a história da regra, lidos da trilha ✅

O `AuditTrailReader` ganha três leituras, todas escopadas por usuário **e** pelo que se pede
([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação)):

- **uso de um conjunto de regras** — `count` e `max(at)` por `rule_id` nas entradas de decisão, na
  janela de retenção, numa consulta agrupada (S-55…S-58, S-64). Índice parcial novo
  `(user_id, rule_id, seq DESC) WHERE rule_id IS NOT NULL`, migration versionada nova;
- **invocações de uma regra** — keyset descendente sobre `seq`, como `GET /audit-entries`, com a
  lista de permissão decidida pelo `kind`: de um `file.read`, só o `subject` e a janela (S-59, S-61);
- **história de uma regra** — os `audit_events` com `subject_id` = a regra e `user_id` = o chamador (S-63).

`GET /audit-entries` ganha o filtro opcional `ruleId`, para que "14 usos" abra a trilha com as mesmas
14 linhas (S-62). O [plano 14](../14-audit-explained/README.md) redesenha a trilha: o filtro precisa
sobreviver ao redesenho, e é o 14 que decide para onde o link aponta quando existir a página da
invocação. Regra alheia ou inexistente responde como o `GET /permission-rules/:id` (S-60).

**Concluída em 2026-11-05.** `AuditTrailFilter` ganha `ruleId`, lido pelo índice parcial que a F0 já
criou (`audit_entries_user_id_rule_id_seq_idx`); `AuditTrailReader.usageOf(userId, ruleIds,
windowStart)` é uma consulta agrupada (`count`/`max(at)` com `GROUP BY rule_id`) sobre esse mesmo
índice. As invocações (`GET /permission-rules/:ruleId/invocations`) passam por
`QueryAuditTrailUseCase` — a **mesma** rotina de `GET /audit-entries`, não uma segunda — para herdar
a divulgação que tira o conteúdo de um `file.read` (S-61); `permission` ganha sua própria instância
dela (e dos dois readers), nunca a de `AuditQueryModule`, que não exporta nenhum dos dois a propósito
(nota no `permission.module.ts`). A história (`GET /permission-rules/:ruleId/history`) usa
`AuditEventReader`, que ganha o filtro `subjectId`, sobre o índice que `keysetIndexes` já cria em
`audit_events` — nenhuma migration nova fez falta para B-11. `ListRuleInvocationsUseCase` e
`ListRuleHistoryUseCase` reusam `ownedRule` (o mesmo helper de `DescribePermissionRuleUseCase`) para
a ordem fixa 404→403 (S-60). **Gaps conhecidos, não testados nesta tarefa** (pedem Postgres real):
S-54/S-64 (plano de execução usa o índice), S-56 (fronteira exata da janela de retenção), S-59
(paginação sob escrita concorrente) — a lógica espelha exatamente o padrão já provado do plano 03
para `audit_entries`/`audit_events`, reaproveitado, não reescrito.

### B-12 — Encurtar e estender a validade ✅

`ChangePermissionRuleExpiryUseCase`, só validade ([D-01](decisions.md#d-01--o-que-se-edita-numa-regra), S-79):

- recusas na ordem fixa da B-03 (S-72); estado antes de versão, porque "a regra foi revogada" diz
  mais que "a regra mudou" (S-70);
- a escrita é **condicional** — `WHERE id = $1 AND revoked_at IS NULL AND expires_at = $etagExpiry` —,
  e é ela, não uma leitura anterior, que decide a corrida com a revogação e com outro `PATCH`
  (S-74, S-75). Uma regra revogada nunca volta a valer por um `PATCH`;
- teto de agora + teto da decisão ([D-14](decisions.md#d-14--o-teto-da-extensão-conta-de-quando), S-66);
  nova validade no passado é `400` — encerrar é revogar (S-67);
- mesma validade → nada escrito, nada registrado (S-73);
- `permission.ruleExpiryChanged` com antes e depois (S-65). Trilha indisponível: a **extensão** volta
  à validade anterior (condicional de novo) e falha, como a concessão; o **encurtamento** fica e
  falha, como a revogação (S-77);
- estender apaga `expiry_reminded_at` (S-78). Encurtar vale na próxima invocação da sessão viva,
  porque as regras são lidas a cada pedido, sem cache (S-76);
- a regra `disabled` pela migração do 28 é `409 PERMISSION_RULE_STATE_CONFLICT`: ela nunca volta a valer
  por um `PATCH` — o caminho é recriar (S-226).

**Concluída em 2026-11-05.** A ordem de recusas implementada é 404 → 403 → 428 (`If-Match` ausente,
`PermissionRuleIfMatchRequiredError`, novo, código `PRECONDITION_REQUIRED` — compartilhado com o
catálogo do plano 07, nunca duplicado) → 409 (estado, via `statusAt`) → 412 (`If-Match` obsoleto) →
400/422 (a nova validade, pelo `PermissionRule.withExpiry`, novo método de domínio que devolve a
**mesma instância** quando o valor não muda — o que implementa S-73 sem escrita nem registro). A
escrita condicional é `PermissionRuleRepository.changeExpiry(ruleId, expectedExpiresAt, newExpiresAt,
clearReminder)`, `WHERE id = $1 AND revoked_at IS NULL AND expires_at = $expectedExpiresAt`, que devolve
`{ rule, changed }` — quando `changed` é falso, o caso de uso relê o estado devolvido para decidir entre
409 (a regra moveu de estado) e 412 (perdeu a corrida para outro `PATCH`), nunca uma leitura própria.
`expiry_reminded_at` é zerado na mesma instrução, só numa extensão. Dois gaps de contrato achados e
fechados nesta tarefa, não previstos no F0: os três kinds novos da B-05 (`permission.ruleExpiryChanged`,
`permission.rulesExported`, `permission.rulesImported`) estavam na migration 0029 mas faltavam em
`AUDIT_EVENT_KINDS` (TS) e no `CHECK` do schema Drizzle de `audit_events` — sincronizados; e a rota
`PATCH /permission-rules/:ruleId` precisava do schema de contrato (`permission-rule.schema.json` ganhou
a rota) — o lote de B-13 abaixo ganhou o schema próprio `permission-rule-batch.schema.json`.

### B-13 — Revogar em lote e desfazer a revogação ✅

`RevokePermissionRulesUseCase` ([D-06](decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)):
confere todos os ids antes de escrever (S-81, S-82), escreve numa instrução idempotente por item
(S-80, S-83, S-85), teto de 100 (S-84), um evento por regra com o `batchId`. O `DELETE` avulso continua,
e passa a ser o lote de um — uma implementação.

`RestorePermissionRulesUseCase` ([D-11](decisions.md#d-11--desfazer-a-revogação)): só regra revogada
(S-89) — a `disabled` pela migração do 28 não é revogada e não se restaura (S-226) —, pelo mesmo dono (S-93), dentro da janela (S-88), cuja validade original ainda não passou
(S-92); cria pela rotina de concessão — largura e teto de novo (S-90) — com origem `restore` e
`restoredFrom`. Restaurar duas vezes dá uma regra, porque a concessão já é idempotente entre as ativas
(S-91). A janela é configuração com teto no código, na B-07.

Regressão: depois do lote, a próxima invocação de cada sessão viva pergunta (S-86).

**Concluída em 2026-11-05.** `PermissionRuleRepository.saveRevocations(ruleIds, at)` escreve numa
única instrução (`UPDATE … WHERE id = ANY($1) AND revoked_at IS NULL RETURNING`), idempotente por id —
a já revogada é relida, não escrita de novo. `RevokePermissionRuleUseCase` (o `DELETE` avulso) passou a
delegar inteiramente para `RevokePermissionRulesUseCase` com uma lista de um id — uma implementação só,
como o texto pede —, e o `permission.ruleRevoked` de um `DELETE` avulso agora também carrega `batchId`
nos `details` (o lote de um). O teto de 100 e o mínimo de 1 id ficam no schema Zod da rota
(`ruleIdsSchema`), não no caso de uso — a mesma divisão já usada por `grantPermissionRuleSchema`.
`RestorePermissionRulesUseCase` reaproveita o `GrantPermissionRuleUseCase.executeAll` sem nenhuma
rotina própria: a validade original a restaurar passada como `expiresAt`, o que faz
`PermissionRuleExpiryInvalidError` cobrir S-92 de graça (a validade original já no passado é refusada
pela mesma checagem de qualquer criação), e `acknowledgeBroad: true` sempre, porque D-11 pede um clique
só — `unbounded` continua recusado de todo jeito. Janela configurável por
`RC_PERMISSION_RULE_RESTORE_WINDOW_MS` (`PermissionSettings.ruleRestoreWindowMs`), já documentada em
`.env.example`/`13-environment-variables.md` por uma task anterior desta mesma fase, mas nunca
amarrada ao código — amarração fechada aqui (schema de validação, `environment.ts`,
`process-environment.ts`, `.env` real, testes de configuração).

### B-14 — Testar um comando ✅

`EvaluatePermissionUseCase` ([D-12](decisions.md#d-12--o-que-o-teste-de-comando-considera)) monta a
mesma `RuleQuestion` que a sessão monta — `engine`, `kind`, `subject` e o `rawInput` opaco, só para a
entrada exata, nunca `toolName` + `input` ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)) — e chama **a mesma** `answeringRule`, que
casa pela gramática canônica do domínio, com as regras de `engine` nulo e as restritas ao `engine`
perguntado — nenhuma cópia (S-94…S-97, S-101). As regras vêm do repositório **do chamador** e só dele (S-98); a pasta passa pelo
`RuleFolderResolver` (S-99), e sem pasta só `always` responde (S-100). `sessionId` só de sessão viva
do chamador, pelo registro de sessões (S-108). O rascunho entra como uma regra a mais, não persistida,
com os achados da B-15 (S-104).

Devolve também **todas** as regras que casam, não só a que responde — é o que explica "por que meu
`allow` não valeu" —, os motivos (`denyWins`, `readOnlyMode`, `noRule` — o modo é o canônico
`ask` · `acceptEdits` · `readOnly` · `allowAll`) e as ressalvas do que o motor decide antes de nós, que
o adapter declara — no Claude, o `deny` do projeto, o `acceptEdits` e as leituras que o CLI aprova
sozinho (S-106). Sem efeito colateral de espécie alguma (S-102, S-103); o log leva `kind`, tamanho e
resultado, nunca o comando (S-107).

### B-15 — Redundância, sobreposição e conflito ✅

`analyzeRules(rules, draft?)`, pura, sobre as regras **ativas** do chamador (S-115, S-119), com a
contenção do domínio (`patternCovers`, sobre a gramática canônica — [D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect); a regra
restrita a um motor nunca cobre a de outro motor, e a canônica, de `engine` nulo, alcança as de qualquer
motor) e a relação entre escopos (`always` ⊇ `project` de qualquer pasta; `project` de pastas sem
relação de ancestralidade são disjuntas — S-114, atualizado em 2026-11-05: desde a revisão da
[D-10](decisions.md#d-10--project-alcança-as-subpastas), uma pasta e sua subpasta **não** são mais
disjuntas — a regra da pasta-mãe cobre a da subpasta, como `always` cobre `project`). Achados, cada um
com as regras envolvidas e o que dizer:

| Achado | Quando |
|---|---|
| `identical` | mesmo escopo, pasta, padrão e decisão de uma ativa (S-110) |
| `redundant` | uma `allow` (ou `deny`) coberta por outra de mesma decisão em escopo igual ou mais largo (S-111, S-113) |
| `shadowedByDeny` | uma `allow` inteiramente coberta por uma `deny` que a alcança — ela nunca responde (S-112) |
| `overlapsDeny` | uma `allow` e uma `deny` casam um conjunto comum; ali, `deny` vence (S-112) |
| `tooBroad` | regra antiga que a [D-09](decisions.md#d-09--o-que-é-largo-demais) recusaria hoje (S-116) |
| ~~`pathPrefix`~~ | fora de escopo desde 2026-11-05 ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)): a B-08 confirmou que `:*` nunca alcança um `kind` de caminho — o padrão é recusado na criação, então não há regra `disabled`-por-ambiguidade a explicar aqui; S-117 foi retirado da matriz de achados |
| `unreachable` | `project` cuja pasta saiu da allowlist (da B-10) |

Ordem determinística (S-120). `POST /permission-rules/preview` devolve `reach`, `breadth` e os achados
de um rascunho, e recusa o padrão fora da gramática canônica como a criação (S-118).

### B-16 — Simular contra as últimas invocações da trilha ✅

`SimulatePermissionRulesUseCase` ([D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta)):
lê as últimas N entradas de decisão do chamador (S-124, S-127) com a pasta de cada sessão, monta o
conjunto "depois" (ativas + rascunhos − removidas; remover id alheio é `403`, S-131) e, para cada
invocação, compara o veredito gravado com o da `answeringRule` — a mesma da sessão (S-129). Devolve as
contagens (`unchanged`, `wouldAutoAllow`, `wouldAutoDeny`, `wouldAsk`), até 100 itens que mudam
(S-121…S-123), `withoutFolder` (S-125) e `assumedMode: ask` (o modo canônico). Tetos de `limit`,
rascunhos e removidas (S-126, S-130); `file.read` com os campos que a trilha deixa sair, pelo `kind`
(S-132); sem efeito colateral (S-128).

### B-17 — Modelos de regra ✅

Catálogo versionado no backend ([D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram)),
em `application/permission/` (é dado de produto, não regra de domínio), com nome e descrição em chaves
de i18n (S-134). Os modelos são **canônicos** ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect), revisão de 2026-10-10): cada
regra na gramática do plano 28 (`shell(pnpm test:*)`, `web.fetch`), com `engine` nulo, num catálogo só.
Um teste unit percorre o catálogo com a gramática e a largura do domínio: modelo com `allow` `unbounded`
reprova (S-133).
`GET /permission-rules/templates` devolve os modelos com o `reach` e a `breadth` de cada regra. De
passagem, fechado o gap que a B-09 deixou: `templateId` que o catálogo não tem é `400 INVALID_INPUT`
(S-36), em `GrantPermissionRuleUseCase.build`.

**Pendência, deixada para a B-18**: "aplicar um modelo" ainda não tem rota — a aplicação é uma
importação (S-135), e a B-18 (exportar e importar) é onde essa rotina nasce. `GET /permission-rules/templates`
só lê o catálogo; nenhuma rota escreve a partir de um `templateId` ainda.

### B-18 — Exportar e importar ✅

Pelo formato e pelas regras da [D-17](decisions.md#d-17--exportar-e-importar):

- **exportar** (`GET /permission-rules/export`) — os filtros da listagem, ordem determinística, sem
  ids nem dono, com o `pattern` na gramática canônica e o `engine` só na regra restrita a um motor
  (S-136), registrado em `permission.rulesExported` (S-137); a regra `disabled` não sai; na
  importação, item sem `engine` é canônico, para todo motor com o `kind`;
- **prévia** (`POST /permission-rules/import/preview`) — valida o arquivo (formato, versão, tamanho —
  S-140, S-141), cada item pela mesma gramática/largura/validade da concessão **sem gravar** (a forma
  antiga do Claude é item inválido), e devolve veredito por item (`new`/`existing`/`invalid` com o
  código) e `digest` (S-138, S-147). **A pasta de um item `project` não é resolvida aqui** — não há
  `folderMap` ainda nesta chamada (D-17 só o entrega na aplicação) — o "existing" de um item `project`
  casa por padrão/decisão/engine/escopo, ignorando o caminho não mapeado; a aplicação, com o caminho
  real, é quem confirma ou recusa de fato;
- **aplicar** (`POST /permission-rules/import`) — confere o `digest` (S-143) e que todo índice de
  `accept`/`acknowledgeBroad` existe no arquivo, revalida **todos** os aceitos pela rotina de
  concessão de verdade (`GrantPermissionRuleUseCase.validate`, a mesma pasta pelo `RuleFolderResolver`
  com o `folderMap` — S-144 — e o mesmo teto de validade — S-148) e recusa o lote inteiro, sem
  escrever nada, se um só ficar inválido (S-142, `422 PERMISSION_RULE_IMPORT_REJECTED`); só então
  concede item a item pela rotina com origem `import`, sequencial e sem desfazer o que já nasceu numa
  falha de escrita (S-149) — a idempotência (S-145) e a concorrência (S-146) são as da própria rotina
  de concessão (o `pg_advisory_xact_lock` que já existia), não uma de sua conta; registra o resumo
  (`permission.rulesImported`, contagem/criadas/já existentes). Campos de dono no arquivo (`userId`,
  `id`) são sempre ignorados — toda regra nasce do chamador (S-139).

**Decisões de execução**: (1) `GrantPermissionRuleUseCase` ganhou `validate()` (constrói e valida sem
gravar) e `grantWithResult()` (grava e diz se criou), ambos reusados por `execute()` — uma única rotina
de concessão, nunca duas; (2) o corpo grande (até 256 KB) precisa de um parser de corpo próprio para
`/permission-rules/import*`, no mesmo molde de `/files` (`bootstrap.ts`, plano 07, D-04) — o limite do
Nest/Express é 100 KB por padrão; (3) três classes de erro novas no domínio, todas `code: 'INVALID_INPUT'`
ou `'PAYLOAD_TOO_LARGE'` literais — `application` não pode importar `shared/errors` (mesma regra que a
B-17 já tinha batido nela): `PermissionRuleImportTooLargeError`, `PermissionRuleImportInvalidError`
(`digest`/`index` do próprio pedido de aplicar, não de um item do arquivo).

### B-19 — Lembrete de expiração ⛔

Pela [D-18](decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega): job diário no
`PermissionModule`, sob advisory lock (S-155), desligável por configuração como o job de purga
([plano 03 · D-22](../03-rules-and-audit/decisions.md#d-22--o-job-o-botão-de-desligar-e-o-que-o-comando-lê)).
Para cada usuário que optou (S-152), as regras ativas que expiram em até sete dias (S-153) e ainda não
foram lembradas: **um** push pela porta de notificação que `permission` já usa, com a contagem e o link
— nunca padrão nem pasta (S-151) —, e só então marca `expiry_reminded_at` (S-150). Push que falha não
marca (S-154). Se a preferência não tiver onde morar no servidor (plano 06), a tarefa entrega só o
job desligado e o registro no progresso — o lembrete da web (B-25) não depende deste.

**Bloqueada, confirmado nesta sessão**: o plano 06 (D-13, `docs/plans/06-workbench/decisions.md`)
fechou as preferências do produto — e nenhuma delas é "este usuário aceita um push de lembrete de
regra"; o que existe é per-visitante (`localStorage`: tema, densidade, idioma) ou um único item
server-side sem relação (recentes/abas abertas). Não há onde ler "quem optou" (S-152) no servidor.
É exatamente a condição que a D-18 já previa, com a própria resposta: nada além desta nota entra
nesta sessão — nenhum job, nenhuma rota de push nova. Escrever o job mesmo assim (sempre desligado,
sem chamador real) seria código morto, especulativo para uma preferência que não existe — o oposto
do que o `AGENTS.md` pede. Ver [progress.md](progress.md#escopo-reduzido-ou-adiado) e a entrada em
[decisions.md](decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega). O selo na web (B-25) e a
central de notificações do plano 06 **não** dependem disto e seguem de pé.

---

## Cenários cobertos

S-07…S-155, S-224, S-226.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
