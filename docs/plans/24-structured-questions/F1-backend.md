# F1 — Backend

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md), e das decisões da [F1](decisions.md#f1--backend): D-04,
D-07 e D-08 (todas ✅).
**Entrega:** o backend publica a pergunta normalizada, recusa resposta inválida, grava e audita as
respostas, e o Claude as recebe no formato do SDK. Regra de allow não responde mais pergunta.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-04 — Normalizar ✅

Em `domain/permission`, sem framework:

- value objects `QuestionInteraction` e `QuestionAnswer`;
- `normalizeQuestion(input)`, função pura: lê o `input` do SDK e devolve a `interaction` com ids
  `q1…q4` pela posição, os textos truncados no `maxLength` do schema (não recusados: o texto é do
  Claude, e o pedido precisa chegar), e `malformed: true` para o que não se lê com segurança
  ([D-16](decisions.md#f1--backend)): sem perguntas, mais de 4, menos de 2 ou mais de 4 opções,
  opção sem rótulo, pergunta sem `options` (o modo estendido, R-02), texto de pergunta repetido,
  rótulo repetido na mesma pergunta.

A `interaction` guarda, por opção, o rótulo original junto do exibido, para a tradução da B-09
achar o original pela posição (S-49).

### B-05 — Validar a resposta ✅

`validateAnswers(interaction, decision, answers)`, função pura no domínio, com
`PermissionAnswersInvalidError` (`PERMISSION_ANSWERS_INVALID`, 422). Recusa: `allow` sem
`answers`; `answers` num pedido que não é pergunta ou num `deny`; `questionId` inexistente ou
repetido; pergunta sem resposta ([D-04](decisions.md#f1--backend)); rótulo que não é opção daquela
pergunta; escolha única com mais de uma escolha; "Outro" vazio depois de `trim`; `allow` num pedido
malformado. `details[]` diz a regra e o `questionId`, nunca o texto digitado.

É a mesma validação que um respondedor automático vai usar
([workflow §13.2](../../discovery/02-workflow-de-sessoes.md)); por isso é do domínio, e não do handler.

### B-06 — O pedido de pergunta ✅

No `RequestPermissionUseCase` e no `permission-payloads`, quando a tool é `AskUserQuestion`:
`interaction` normalizada, `riskHint: 'read'` (o `risk.classifier` ganha a tool na lista de
leitura), `defaultToNo: false`, `suggestions: []`, `reaches: []` ([D-09](decisions.md#f1--backend),
[D-10](decisions.md#f1--backend)), `title: 'permission.tool.AskUserQuestion'`, sem `description`.

O prazo é `RC_QUESTION_TIMEOUT_MS` ([D-07](decisions.md#f1--backend)): validado em
`infrastructure/config/environment.ts`, levado ao `PermissionSettings` como `questionTimeoutMs`, e
documentado no `.env.example`. A extensão usa o passo e o teto de hoje.

Na resolução, `scope` e `reach` de uma pergunta são ignorados: vale `once`, e nenhuma regra nasce
(S-28).

### B-07 — Regras não respondem perguntas ✅

- `rule-precedence.answeringRule`: um `allow` que casa com uma tool de `HUMAN_ONLY_TOOLS` não
  responde ([D-25](decisions.md#f1--backend)); um `deny` continua recusando. A regra ignorada é
  logada em `debug` ([D-26](decisions.md#f1--backend)).
- `POST /permission-rules` recusa allow para essas tools com `PermissionRuleToolInteractiveError`
  (`PERMISSION_RULE_TOOL_INTERACTIVE`, 422).
- A [D-08](decisions.md#f1--backend) manteve o `ExitPlanMode`: a regra usa a constante inteira,
  e uma regra de allow deixa de aprovar planos sem ninguém ver.

Permitir tudo já pergunta (`answeredByMode`); S-33 é a regressão que prova que continua.

### B-08 — Resolver com respostas ✅

- WS: o zod do `permission.resolve` em `permission-commands.ts` aceita `answers`, e o handler as
  repassa. Hoje um campo a mais é descartado em silêncio.
- `ResolvePermissionUseCase`: valida (B-05) **antes** de liquidar, e uma resposta inválida deixa o
  pedido aberto. `PermissionAnswer`/`PermissionResolution` ganham `answers`.
- `settle-permission`: grava `answers` em `permission_requests` (migration nova em
  `infrastructure/database/migrations`, coluna `answers jsonb null`; mapper) e na linha de decisão
  da trilha ([D-12](decisions.md#f0--normas-e-contrato)).
- `permission.resolved` leva `answers` ([D-14](decisions.md#f0--normas-e-contrato)), inclusive no
  replay do `session.attach`.
- Log: `info` `permission.question.answered` com `requestId`, número de perguntas e se houve
  "Outro", sem conteúdo; `debug` com o conteúdo truncado.

A serialização das respostas a um mesmo pedido, que o plano 23 introduziu (ciclo 6 do
[diário do 23](../23-fluid-permissions/progress.md)), vale aqui sem mudança: é ela que garante S-38.

### B-09 — O veredito chega ao SDK ✅

- `PermissionVerdict` ganha `answers: ReadonlyArray<QuestionAnswer> | null`
  ([D-03](decisions.md#f0--normas-e-contrato)).
- `PermissionBridge.verdictOf` copia `answers` da resolução.
- `SessionRunner.canUseTool`: num `allow` com `answers`, monta
  `updatedInput = { ...input, answers }`, com a chave pelo texto **original** da pergunta e o valor
  `[...rótulos originais, ...(other ? [other] : [])].join(', ')`. Sem `answers`, como hoje.
- No vencimento de uma pergunta, o `deny` leva a mensagem de "não respondida a tempo"
  ([D-07](decisions.md#f1--backend)), em inglês, porque é para o Claude.

### B-10 — Push e estado ✅

- `PushMessage.permissionRequested` ganha a variante de pergunta pela `interaction`, com
  `push.question.*`, sem texto do Claude ([D-22](decisions.md#f0--normas-e-contrato)).
- `GET /sessions/:id/permissions/:requestId` devolve a `interaction` e, resolvido, as `answers`.
- Pergunta de subagente (`parentToolUseId`) segue o mesmo caminho; S-55 prova.

**Na execução:** S-55 é provado no runner, com um `canUseTool` que traz `agentID` — nenhuma gravação
tem uma pergunta dentro de subagente, e o backend não distingue o caminho. A prova de que o SDK recebe
as respostas por inteiro (S-38, S-50 no nível de integração) lê o registro do fake SDK, da B-12.

---

## Cenários cobertos

S-05…S-55.

---

## Critério de conclusão

```bash
pnpm verify
```
