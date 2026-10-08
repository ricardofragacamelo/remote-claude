# F0 — Normas e contrato

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano. As decisões da [F0](decisions.md#f0--normas-e-contrato)
estão tomadas.
**Entrega:** as normas dizem o que é uma pergunta e como se responde; os schemas, o
`protocol.ts` e o `protocol.g.dart` carregam a `interaction` e as `answers`; as chaves de texto
existem nas três pontas.

**Por quê primeiro:** é mudança de contrato WebSocket. O
[gatilho do AGENTS.md](../../../AGENTS.md#gatilhos-específicos) manda escrever o contrato antes e
mudar as três pontas no mesmo plano.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — As normas ✅

- [05 §O fluxo de permissão](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão):
  a `interaction` do pedido, as `answers` da resposta e do resolvido, que `scope` e `reach` são
  ignorados numa pergunta, e o prazo próprio. Em
  [§Campo obrigatório por condição](../../architecture/shared/05-websocket-protocol.md), a
  exceção explicada: "`answers` obrigatório quando o pedido é pergunta" não cabe no
  `x-required-when`, porque o payload da resposta não tem o `toolName`, e é validado no use case.
- [04 — erros e HTTP](../../architecture/shared/04-errors-and-http.md): `PERMISSION_ANSWERS_INVALID`
  (422, `permission.error.answersInvalid`) e `PERMISSION_RULE_TOOL_INTERACTIVE` (422,
  `permission.error.ruleToolInteractive`).
- [backend/04](../../architecture/backend/04-claude-integration.md): a pergunta passa pelo
  `canUseTool` em qualquer modo, a tradução das respostas para o `updatedInput` mora no runner, e
  `HUMAN_ONLY_TOOLS` não é respondida por regra de allow nem por Permitir tudo.
- [web/03](../../architecture/web/03-ui-system.md) e [mobile/04](../../architecture/mobile/04-ui.md):
  o card de pergunta — abas no web, passos no app, avanço automático, "Outro", preview, recusa.

O comportamento detalhado está na [proposta §10.4](../../discovery/05-perguntas-estruturadas.md#104-o-card-de-pergunta-comportamento-comum);
a norma o resume e aponta para lá só como origem.

### B-02 — Schemas e tipos gerados ✅

Em `packages/contracts/schema/` — as formas repetidas (`QuestionInteraction`, `QuestionAnswer`) em
`definitions/`, nomeadas por `$ref`, que o gerador passou a aceitar, com `minItems`
([D-28](decisions.md#f0--normas-e-contrato)):

- `events/permission-requested.schema.json`: `interaction` opcional — `kind` (`const: 'question'`),
  `malformed`, `questions[]` com `id`, `header`, `prompt`, `multiSelect` e `options[]` (`label`,
  `description`, `preview` anulável). Limites: `questions.maxItems: 4`, `options.minItems: 2`,
  `options.maxItems: 4`, e `maxLength` nos textos, com folga sobre o que o SDK pede.
- `responses/permission-resolve.schema.json`: `answers` opcional — `questionId`, `selected[]`
  (`maxItems: 4`), `other` (`maxLength: 2000`); `answers.maxItems: 4`.
- `events/permission-resolved.schema.json`: o mesmo `answers`, opcional.
- `events/tool-completed.schema.json`: `question` opcional — as `answers` e o desfecho
  (`answered`, `declined` com o motivo, `expired`) —, preenchido só no histórico e no seguidor, pela
  [B-21](F5-history.md#b-21--enriquecer-pelo-tooluseid-). Ao vivo, o cliente já tem o
  `permission.resolved`.

O `v` não muda: só entram campos opcionais ([05 §Versionamento](../../architecture/shared/05-websocket-protocol.md)).
Sem `oneOf`: o gerador não aceita, e com uma só variante não precisa (R-03). Rodar
`pnpm contracts` e conferir com `pnpm contracts:check`.

### B-03 — Textos ✅

Chaves novas, em `en` e `pt-BR`, com o par no `scripts/i18n-shared.json`:

- web: `permission.tool.AskUserQuestion`, `permission.question.*` (Outro, digite sua resposta,
  Enviar respostas, Não responder, Pergunta {n} de {total}, sem prévia, expirou, não foi possível
  ler a pergunta, aguardando sua resposta, Perguntou: {header}, Fez {n} perguntas), os dois erros;
- app: os mesmos em `app_en.arb` e `app_pt.arb`, com `@descrição`, e `permissionToolAskUserQuestion`;
- backend: `push.question.title` e `push.question.body` ([D-22](decisions.md#f0--normas-e-contrato)).

**Na execução** ([D-33](decisions.md#f0--normas-e-contrato)): chave declarada e não usada é órfã, e o
`i18n:check` a recusa — também dentro do portão 7. As chaves foram desenhadas aqui e entram com o
código que as usa: as do push na B-10, as do web na F3, as do app na F4. O S-04 fecha na F4.

---

## Cenários cobertos

S-01…S-04.

---

## Critério de conclusão

```bash
pnpm verify
```
