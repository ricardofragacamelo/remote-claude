# F1 — Backend de regras

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md), e das decisões D-01, D-02, D-04…D-18 do
[decisions.md](decisions.md).
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

### B-08 — O casamento conhece a decisão, e a largura é do domínio 🔄

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

### B-09 — Criar regra: pasta pela allowlist, largura, validade de `deny`, origem 🔲

A `GrantPermissionRuleUseCase` continua sendo **a** rotina de concessão ([plano 03 · D-10](../03-rules-and-audit/decisions.md#d-10--dois-caminhos-para-nascer-uma-rotina)),
e ganha, na ordem:

1. **pasta** — regra `project` que não vem do card resolve o caminho pela porta `RuleFolderResolver`
   (adapter chamando o `ResolveWorkspaceUseCase`): fora da allowlist, de outra pessoa, inexistente,
   arquivo, symlink que escapa (S-22…S-28). O caminho gravado é o que a sessão carrega para a mesma
   pasta (S-29), e o casamento continua exato (S-30, [D-10](decisions.md#d-10--project-alcança-as-subpastas)).
   O card não passa por aqui: a pasta dele **é** a da sessão, já resolvida (S-34);
2. **largura** — `allow` `unbounded` recusado, `broad` só com `acknowledgeBroad` (S-31…S-33). Vale
   para toda porta: `POST`, importação, restauração, modelo;
3. **validade de `deny`** com default e teto próprios, limitados no código ([D-04](decisions.md#d-04--deny-sem-validade), S-37, S-38);
4. **origem** — migration versionada nova com as colunas anuláveis da B-07; o card grava
   `approval` e o `requestId`, o `POST` grava `request` e o `templateId` validado contra o catálogo
   (S-35, S-36).

O que não pode mudar, e os cenários de regressão provam: concessão concorrente vira uma linha (S-39),
trilha indisponível revoga o que foi criado (S-40), e **nada** sai em `updatedPermissions` (S-41). O
teste de integração que hoje concede `allow Write` com `always` passa a mandar `acknowledgeBroad` — o
contrato mudou; o teste não afrouxou.

### B-10 — Listar com filtros, ordenação, busca, resumo e os campos novos 🔲

`ListPermissionRulesUseCase` recebe os filtros da B-02 e o repositório os aplica no predicado,
**sempre** com `user_id` do chamador (S-49). Busca `q` com `ILIKE` e escape de `%`, `_` e `\` (S-45).
Ordenação estável com desempate por `id` (S-47); ordenar por uso junta a contagem da B-11 na mesma
consulta.

Cada item sai com `reach`, `breadth`, `findings` (da B-15, sobre o conjunto ativo do chamador),
`usage`, a origem, `etag` (derivado de `expires_at` e `revoked_at` — sem coluna de versão) e
`folderReachable`, que confere a pasta contra a allowlist do chamador pela regra pura, **sem** tocar o
disco (S-52). `GET /permission-rules/summary` conta sobre o mesmo predicado (S-53).

Índice novo para os filtros mais comuns (`user_id`, `revoked_at`, `expires_at`), na mesma migration da
B-09, com o plano de execução verificado (S-54) — o índice atual é parcial em `revoked_at IS NULL` e
não serve à aba "Revogadas".

### B-11 — Uso, invocações e a história da regra, lidos da trilha 🔲

O `AuditTrailReader` ganha três leituras, todas escopadas por usuário **e** pelo que se pede
([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação)):

- **uso de um conjunto de regras** — `count` e `max(at)` por `rule_id` nas entradas de decisão, na
  janela de retenção, numa consulta agrupada (S-55…S-58, S-64). Índice parcial novo
  `(user_id, rule_id, seq DESC) WHERE rule_id IS NOT NULL`, migration versionada nova;
- **invocações de uma regra** — keyset descendente sobre `seq`, como `GET /audit-entries`, com a
  lista de permissão de campos de `Read` (S-59, S-61);
- **história de uma regra** — os `audit_events` com `subject_id` = a regra e `user_id` = o chamador (S-63).

`GET /audit-entries` ganha o filtro opcional `ruleId`, para que "14 usos" abra a trilha com as mesmas
14 linhas (S-62). O [plano 14](../14-audit-explained/README.md) redesenha a trilha: o filtro precisa
sobreviver ao redesenho, e é o 14 que decide para onde o link aponta quando existir a página da
invocação. Regra alheia ou inexistente responde como o `GET /permission-rules/:id` (S-60).

### B-12 — Encurtar e estender a validade 🔲

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
  porque as regras são lidas a cada pedido, sem cache (S-76).

### B-13 — Revogar em lote e desfazer a revogação 🔲

`RevokePermissionRulesUseCase` ([D-06](decisions.md#d-06--revogar-em-lote-atômico-ou-por-item)):
confere todos os ids antes de escrever (S-81, S-82), escreve numa instrução idempotente por item
(S-80, S-83, S-85), teto de 100 (S-84), um evento por regra com o `batchId`. O `DELETE` avulso continua,
e passa a ser o lote de um — uma implementação.

`RestorePermissionRulesUseCase` ([D-11](decisions.md#d-11--desfazer-a-revogação)): só regra revogada
(S-89), pelo mesmo dono (S-93), dentro da janela (S-88), cuja validade original ainda não passou
(S-92); cria pela rotina de concessão — largura e teto de novo (S-90) — com origem `restore` e
`restoredFrom`. Restaurar duas vezes dá uma regra, porque a concessão já é idempotente entre as ativas
(S-91). A janela é configuração com teto no código, na B-07.

Regressão: depois do lote, a próxima invocação de cada sessão viva pergunta (S-86).

### B-14 — Testar um comando 🔲

`EvaluatePermissionUseCase` ([D-12](decisions.md#d-12--o-que-o-teste-de-comando-considera)) monta a
mesma `RuleQuestion` que a sessão monta e chama **a mesma** `answeringRule` — nenhuma cópia (S-94…S-97,
S-101). As regras vêm do repositório **do chamador** e só dele (S-98); a pasta passa pelo
`RuleFolderResolver` (S-99), e sem pasta só `always` responde (S-100). `sessionId` só de sessão viva
do chamador, pelo registro de sessões (S-108). O rascunho entra como uma regra a mais, não persistida,
com os achados da B-15 (S-104).

Devolve também **todas** as regras que casam, não só a que responde — é o que explica "por que meu
`allow` não valeu" —, os motivos (`denyWins`, `planMode`, `noRule`) e as ressalvas do que o CLI decide
antes (S-106). Sem efeito colateral de espécie alguma (S-102, S-103); o log leva tool, tamanho e
resultado, nunca o comando (S-107).

### B-15 — Redundância, sobreposição e conflito 🔲

`analyzeRules(rules, draft?)`, pura, sobre as regras **ativas** do chamador (S-115, S-119), com
`patternCovers` e a relação entre escopos (`always` ⊇ `project` de qualquer pasta; `project` de pastas
diferentes são disjuntas — S-114). Achados, cada um com as regras envolvidas e o que dizer:

| Achado | Quando |
|---|---|
| `identical` | mesmo escopo, pasta, padrão e decisão de uma ativa (S-110) |
| `redundant` | uma `allow` (ou `deny`) coberta por outra de mesma decisão em escopo igual ou mais largo (S-111, S-113) |
| `shadowedByDeny` | uma `allow` inteiramente coberta por uma `deny` que a alcança — ela nunca responde (S-112) |
| `overlapsDeny` | uma `allow` e uma `deny` casam um conjunto comum; ali, `deny` vence (S-112) |
| `tooBroad` | regra antiga que a [D-09](decisions.md#d-09--o-que-é-largo-demais) recusaria hoje (S-116) |
| `pathPrefix` | `:*` em tool de caminho ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho), S-117) |
| `unreachable` | `project` cuja pasta saiu da allowlist (da B-10) |

Ordem determinística (S-120). `POST /permission-rules/preview` devolve `reach`, `breadth` e os achados
de um rascunho, e recusa o padrão fora da gramática como a criação (S-118).

### B-16 — Simular contra as últimas invocações da trilha 🔲

`SimulatePermissionRulesUseCase` ([D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta)):
lê as últimas N entradas de decisão do chamador (S-124, S-127) com a pasta de cada sessão, monta o
conjunto "depois" (ativas + rascunhos − removidas; remover id alheio é `403`, S-131) e, para cada
invocação, compara o veredito gravado com o da `answeringRule` — a mesma da sessão (S-129). Devolve as
contagens (`unchanged`, `wouldAutoAllow`, `wouldAutoDeny`, `wouldAsk`), até 100 itens que mudam
(S-121…S-123), `withoutFolder` (S-125) e `assumedMode: default`. Tetos de `limit`, rascunhos e
removidas (S-126, S-130); campos de `Read` como na trilha (S-132); sem efeito colateral (S-128).

### B-17 — Modelos de regra 🔲

Catálogo versionado no backend ([D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram)),
em `application/permission/` (é dado de produto, não regra de domínio), com nome e descrição em chaves
de i18n (S-134). Um teste unit percorre o catálogo com a gramática e a largura: modelo com `allow`
`unbounded` reprova (S-133). `GET /permission-rules/templates` devolve os modelos com o `reach` e a
`breadth` de cada regra. Aplicar é importar (S-135): o cliente manda o modelo pela prévia e pela
aplicação da B-18, com `templateId`.

### B-18 — Exportar e importar 🔲

Pelo formato e pelas regras da [D-17](decisions.md#d-17--exportar-e-importar):

- **exportar** — os filtros da listagem, ordem determinística, sem ids nem dono (S-136), registrado
  (S-137);
- **prévia** — valida o arquivo (formato, versão, tamanho — S-140, S-141), cada item pela rotina de
  validação da concessão **sem gravar** (gramática, largura, pasta pelo `RuleFolderResolver` com o
  `folderMap`, validade), e devolve veredito por item e `digest` (S-138, S-144, S-147); campos de dono
  no arquivo são ignorados (S-139);
- **aplicar** — confere o `digest` (S-143), revalida os aceitos e recusa o lote se algum ficou
  inválido (S-142), concede item a item pela rotina com origem `import` (S-145, S-146), validade do
  lote (S-148), e registra o resumo. Falha no meio: o que nasceu fica, e a resposta é erro (S-149).

### B-19 — Lembrete de expiração 🔲

Pela [D-18](decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega): job diário no
`PermissionModule`, sob advisory lock (S-155), desligável por configuração como o job de purga
([plano 03 · D-22](../03-rules-and-audit/decisions.md#d-22--o-job-o-botão-de-desligar-e-o-que-o-comando-lê)).
Para cada usuário que optou (S-152), as regras ativas que expiram em até sete dias (S-153) e ainda não
foram lembradas: **um** push pela porta de notificação que `permission` já usa, com a contagem e o link
— nunca padrão nem pasta (S-151) —, e só então marca `expiry_reminded_at` (S-150). Push que falha não
marca (S-154). Se a preferência não tiver onde morar no servidor (plano 06), a tarefa entrega só o
job desligado e o registro no progresso — o lembrete da web (B-25) não depende deste.

---

## Cenários cobertos

S-07…S-155.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
