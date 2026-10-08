# Proposta — Perguntas estruturadas do Claude (`AskUserQuestion`)

**Estado:** virou o [plano 24 — Perguntas estruturadas](../plans/24-structured-questions/README.md) em 2026-10-08. As decisões do §14 estão lá ([decisions.md](../plans/24-structured-questions/decisions.md)), com os mesmos IDs; D-01 mudou (plano 24, e não 22). Nenhum código escrito.
**Criada em:** 2026-10-04. Origem: uma sessão do painel em que o Claude perguntou "Qual tipo de avaliação
você quer?" com quatro opções. A tela não mostrou a pergunta, mostrou o JSON. O usuário clicou em
"Permitir", e o Claude recebeu `The user did not answer the questions.`
**Destino:** servir de insumo para um plano em [docs/plans/](../plans/README.md). Esta proposta
**não** é um plano: não tem tarefas com ID nem critério de conclusão por comando. Ela fixa o **quê**
e o **porquê**, registra como a referência (a extensão do Claude Code no VS Code) resolve o problema,
mede o impacto nas três pontas e lista o que falta decidir antes de virar plano.
**Relação com outras propostas:**
- [workflow-de-sessoes.md](02-workflow-de-sessoes.md): as lacunas 1 e 2 do §4 deste documento são
  exatamente o assunto aqui. A fase A do §21 ("Decisões estruturadas") inclui "`AskUserQuestion`
  respondida pela UI".
- [multiplos-motores-de-agente.md](03-multiplos-motores-de-agente.md): o §6.4 define a pergunta
  estruturada como **interação canônica**.

Esta proposta é o recorte mínimo que as duas exigem como pré-requisito, já na forma canônica.
Nenhuma das duas é alterada (§12).

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [Vocabulário](#2-vocabulário)
3. [Princípios](#3-princípios)
4. [Estado atual: o diagnóstico](#4-estado-atual-o-diagnóstico)
5. [O contrato do SDK (0.3.277)](#5-o-contrato-do-sdk-03277)
6. [A referência: como a extensão do VS Code faz](#6-a-referência-como-a-extensão-do-vs-code-faz)
7. [Arquitetura alvo](#7-arquitetura-alvo)
8. [Contrato](#8-contrato)
9. [Fluxos](#9-fluxos)
10. [Mudanças por ponta](#10-mudanças-por-ponta)
11. [Testes e fixtures](#11-testes-e-fixtures)
12. [Alinhamento com as propostas existentes](#12-alinhamento-com-as-propostas-existentes)
13. [Fora do escopo](#13-fora-do-escopo)
14. [Decisões em aberto](#14-decisões-em-aberto)
15. [Riscos](#15-riscos)
16. [Matriz de cenários (semente)](#16-matriz-de-cenários-semente)
17. [Fatiamento sugerido](#17-fatiamento-sugerido)
18. [Referências](#18-referências)

---

## 1. O pedido

O Claude Code tem uma ferramenta, `AskUserQuestion`, com que o modelo **para e pergunta** ao
humano: de 1 a 4 perguntas, cada uma com 2 a 4 opções, escolha única ou múltipla, e sempre com a
saída "Outro" em texto livre. É assim que ele tira dúvida antes de planejar, escolhe entre
abordagens e pede uma preferência.

Hoje o remote-claude **não tem como responder**. A pergunta aparece como um pedido de permissão
genérico (Permitir/Recusar com o JSON do input), e qualquer resposta é ruim:

- **Permitir** devolve ao SDK o input original, sem respostas. O Claude recebe
  `The user did not answer the questions.` e segue adivinhando.
- **Recusar** devolve um `deny`, e o Claude entende que o usuário não quer continuar.

O usuário pediu duas coisas:

1. entender como o plugin do Claude no VS Code **renderiza e processa** a pergunta, cobrindo
   várias perguntas em passos, escolha única e escolha múltipla;
2. registrar tudo de forma completa para depois virar plano.

---

## 2. Vocabulário

| Termo | Significado |
|---|---|
| **Pergunta estruturada** | uma chamada de `AskUserQuestion`. Contém de 1 a 4 **perguntas**. |
| **Pergunta** | um item da chamada: o texto (`question`), um rótulo curto (`header`, até 12 caracteres), as opções e o `multiSelect`. |
| **Opção** | `label` (de 1 a 5 palavras), `description` e um `preview` opcional (mockup, trecho de código). |
| **Outro** | a resposta em texto livre. O modelo é instruído a **não** incluí-la nas opções: quem a oferece é a interface. |
| **Resposta** | para cada pergunta, as opções escolhidas e/ou o texto do "Outro". |
| **Interação** | o campo novo do pedido de permissão que diz "isto não é um pedido de permitir/negar, é uma pergunta" e carrega as perguntas já normalizadas pelo backend (§8.1). |
| **Ferramenta interativa** | ferramenta cuja resposta é **conteúdo do humano**, não autorização: `AskUserQuestion` (e, em parte, `ExitPlanMode`). Regra automática não a responde (§7.5). |
| **Card de pergunta** | a tela, no web e no app, que substitui o card de permissão quando o pedido é uma pergunta. |

---

## 3. Princípios

1. **A pergunta é respondida, não autorizada.** O humano escolhe opções. "Permitir" não existe
   nesta tela, e nenhum caminho devolve `allow` sem respostas.
2. **O protocolo é nosso.** O cliente não lê o `input` cru do SDK. O backend normaliza as
   perguntas para um formato próprio e traduz a resposta de volta para o formato do SDK. Vale o
   [ADR-006](../architecture/shared/00-decisions.md) e a forma canônica de
   [multiplos-motores §6.4](03-multiplos-motores-de-agente.md).
3. **Tudo o que já vale para permissão continua valendo:** idempotência por `requestId`, a
   primeira resposta vence, prazo vencido nega, só o dono responde, toda decisão é auditada
   ([05 §Regras não negociáveis](../architecture/shared/05-websocket-protocol.md)).
4. **Resposta inválida não chega ao Claude.** O backend valida a resposta contra as perguntas que
   ele mesmo publicou: rótulo inexistente, duas escolhas numa pergunta de escolha única ou
   pergunta sem resposta são recusados com código de erro, sem tocar o SDK.
5. **Texto do Claude é conteúdo, não interface.** Pergunta, `header`, rótulos e descrições
   aparecem como vieram, sem tradução. Já "Outro", "Enviar respostas", "Pergunta 2 de 3" etc. são
   chaves de i18n. O push **nunca** leva o texto da pergunta
   ([workflow-de-sessoes §14](02-workflow-de-sessoes.md)).
6. **Preview é markdown renderizado com segurança.** Nunca HTML. O `previewFormat` do SDK fica
   no default (`markdown`).
7. **As três pontas mudam juntas.** É mudança de contrato WebSocket: backend, web e mobile no
   mesmo plano (AGENTS.md, gatilho de contrato).

---

## 4. Estado atual: o diagnóstico

### 4.1 A cadeia ponta a ponta, hoje

```
CLI ── canUseTool('AskUserQuestion', {questions}) ──► SessionRunner.canUseTool
                                                        │
                                       PermissionBridge.ask → RequestPermissionUseCase
                                                        │  (riskHint = destructive,
                                                        │   suggestions = once/session)
                                       permission.requested { toolName, input, … }
                                                        │
                            web: PermissionCard genérico (JSON)   mobile: PermissionCardView genérico
                                                        │
                                       permission.resolve { decision:'allow', scope:'once' }
                                                        │
                                       verdictOf → { decision, reason }   ← sem lugar para respostas
                                                        │
SessionRunner ◄── { behavior:'allow', updatedInput: input } ──   ← o input original, sem answers
                                                        │
CLI → tool_result: "The user did not answer the questions."
```

| Ponto | Onde | O que faz hoje |
|---|---|---|
| Ponte `canUseTool` | [session-runner.ts](../../backend/src/adapter/outbound/claude/session-runner.ts) (`canUseTool`, ~:224-252) | `allow → { behavior:'allow', updatedInput: input }`. Devolve o próprio input. |
| Porta | [permission-gate.port.ts](../../backend/src/application/session/ports/permission-gate.port.ts) | `PermissionVerdict = { decision, reason }`. Não há onde carregar respostas. |
| Implementação | [permission-bridge.ts](../../backend/src/adapter/outbound/claude/permission-bridge.ts) (`verdictOf`) | copia só `decision` e `reason`. É o gargalo. |
| Pedido | [request-permission.use-case.ts](../../backend/src/application/permission/request-permission.use-case.ts), [permission-payloads.ts](../../backend/src/application/permission/permission-payloads.ts) | `title = permission.tool.AskUserQuestion` (chave inexistente nos clientes), `input` cru, `defaultToNo: true`, sugestões `once`/`session`. |
| Risco | [risk.classifier.ts](../../backend/src/domain/permission/services/risk.classifier.ts) | a tool não está em nenhuma lista, então cai em **`destructive`**. No celular isso dispara a confirmação em dois passos. |
| Resposta WS | [permission-commands.ts](../../backend/src/adapter/inbound/ws/permission/permission-commands.ts) | zod não estrito: um `answers` enviado hoje seria **descartado em silêncio**. |
| Contrato | [permission-resolve.schema.json](../../packages/contracts/schema/responses/permission-resolve.schema.json) | `decision` só aceita `allow`/`deny` ("There is no third value"), mais `scope` e `reason`. |
| Domínio | [permission-request.entity.ts](../../backend/src/domain/permission/entities/permission-request.entity.ts) | `PermissionAnswer`/`PermissionResolution` sem respostas. |
| Persistência e auditoria | `permission_requests`, `audit_entries` | guardam o input original. **As respostas não ficam em lugar nenhum.** |
| Push | [push-translator.ts](../../backend/src/shared/i18n/push-translator.ts), `push.permission.body` | "Quer executar AskUserQuestion. Abra para permitir ou recusar." Texto errado para uma pergunta. |
| Linha da tool (ao vivo) | [sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts) | `tool.completed.summary` = os primeiros 200 caracteres do `tool_result`. O `tool_use_result` estruturado (`questions`, `answers`) é descartado. |
| Linha da tool (histórico) | [transcript.adapter.ts](../../backend/src/adapter/outbound/claude/transcript.adapter.ts) | a leitura de volta do SDK não traz o resultado estruturado. Sobra só o texto. |
| Web, card | [PermissionRequestCard.tsx](../../web/src/features/permission/components/PermissionRequestCard.tsx) | desvia só `ExitPlanMode` → `PlanApprovalCard`. O resto vai para o `PermissionCard` genérico. |
| Web, linha | [ToolRow.tsx](../../web/src/features/session/components/conversation/ToolRow.tsx) | sem renderer por tool: `JSON.stringify(input)` e o `summary`. |
| Mobile, card | [permission_panel.dart](../../mobile/lib/features/permission/presentation/widgets/permission_panel.dart) | desvia só `ExitPlanMode` → `PlanApprovalCard`. O resto vai para o `PermissionCardView`. |
| Mobile, linha | [tool_card.dart](../../mobile/lib/features/session/presentation/widgets/tool_card.dart) | `Text('${tool.input}')`, o mapa cru. |

### 4.2 Achados colaterais

Estes pontos não aparecem no sintoma, mas o plano precisa tratar:

1. **Uma regra pode "responder" a pergunta sozinha.** `POST /permission-rules` aceita o padrão
   de tool inteira `AskUserQuestion`, e nada exclui ferramenta alguma. Uma regra `allow` liquida o
   pedido com `auto: true`, e o Claude recebe "did not answer". No modo `plan`, regras de allow
   não respondem, e isso mascara o problema. Pelo card, o escopo `session` não grava regra
   (`patternForInvocation` é nulo), e `project`/`always` lançam `PermissionScopeUnsupportedError`.
2. **A fixture e2e foi gravada com o bug.** `backend/test/fakes/agent-sdk/fixtures/plan-turn.json`
   contém um `AskUserQuestion` (uma pergunta, `header` "Description", três opções). O
   `tool_result` gravado é "The user did not answer the questions.", com
   `tool_use_result.answers: {}`. A causa é que o gravador
   ([record-agent-sdk-fixtures.mjs](../../scripts/record-agent-sdk-fixtures.mjs)) responde
   `canUseTool` com o próprio input. O cenário `e2e/scenarios/panel-changes.json` declara
   `"planAsksBefore": ["AskUserQuestion"]`, e o spec
   [claude-panel-changes.spec.ts](../../e2e/specs/claude-panel-changes.spec.ts) clica em
   "Permitir uma vez" no card genérico. **Esse spec quebra quando o card novo entrar.**
3. **O replay do fake SDK ignora o veredito.** `ScriptedQuery` consulta o `canUseTool` mas emite o
   `tool_result` gravado, seja qual for a resposta. Para o e2e provar que a resposta chegou, o fake
   precisa mudar ou a verificação precisa estar em outro nível (§11).
4. **O status "esperando você" não distingue pergunta de permissão.** Web (`waitingPermission`,
   `WorkingIndicator`, `PendingPill`, avisos do navegador) e mobile usam o texto genérico.
5. **Não há chave de título.** Faltam `permission.tool.AskUserQuestion` no web e
   `permissionToolAskUserQuestion` no app, e o título cai no fallback.
6. **Não há markdown no app.** Não existe pacote de markdown no `pubspec` (o plano 21 cobre só o
   web). O plano é mostrado como `SelectableText`.
7. **Não há radio nem checkbox no shadcn do web.** Hoje se usam inputs nativos (`PlanApprovalCard`,
   `SettingChoice`, `ExportDialog`).
8. **A feature de permissão do web não loga nada.** O I/O é logado pelo transporte (`ws.outbound`),
   o que basta para a regra 3 do AGENTS.md. O fato de negócio ("pergunta respondida") é novo.

---

## 5. O contrato do SDK (0.3.277)

Fontes: `sdk-tools.d.ts` e `sdk.d.ts` do `@anthropic-ai/claude-agent-sdk` 0.3.277, e o binário do
CLI empacotado (`@anthropic-ai/claude-agent-sdk-linux-x64`), lido por `strings`. O que vem do
binário **não é API pública** e está marcado como tal.

### 5.1 Entrada (pública: `AskUserQuestionInput`)

```ts
{
  questions: Array<{            // 1..4
    question: string;           // o texto completo, termina em "?"
    header: string;             // chip curto, até 12 caracteres
    multiSelect: boolean;
    options: Array<{            // 2..4
      label: string;            // 1 a 5 palavras
      description: string;
      preview?: string;         // mockup/código; só faz sentido em escolha única
    }>;
  }>;
  answers?:     { [questionText: string]: string };
  annotations?: { [questionText: string]: { preview?: string; notes?: string } };
  metadata?:    { source?: string };   // analytics, não exibido
}
```

O prompt da tool instrui o modelo a:

- não incluir "Other", porque a interface oferece;
- pôr a opção recomendada **em primeiro**, com o sufixo "(Recommended)" no rótulo;
- não usar a ferramenta no modo plan para perguntar "o plano está pronto?", porque para isso
  existe o `ExitPlanMode`.

### 5.2 Resposta (pública: `canUseTool` → `updatedInput`)

```ts
return {
  behavior: 'allow',
  updatedInput: {
    questions,                                   // as mesmas que chegaram
    answers: { 'Qual biblioteca?': 'date-fns' }, // texto da pergunta → rótulo
    // escolha múltipla: rótulos unidos por ", "      → 'Lint, Testes'
    // "Outro": o texto digitado, no lugar do rótulo   → 'uma lib própria'
    annotations: { 'Qual biblioteca?': { notes: '…' } },   // opcional
  },
};
```

A chave é o **texto da pergunta**. Duas perguntas com o mesmo texto na mesma chamada colidem.

### 5.3 O que o CLI devolve ao Claude (`tool_result`)

Lido do binário. O texto varia com o que veio em `updatedInput`:

| Situação | Texto que o Claude recebe |
|---|---|
| Sem nenhuma resposta (o nosso caso hoje) | `The user did not answer the questions.` |
| Respostas que batem com as opções | `Your questions have been answered: "Q1"="A1", "Q2"="A2". You can now continue with these answers in mind.` |
| Alguma resposta fora das opções ("Outro"), ou com notas | `The user answered: "Q1"="…". Read the answers carefully — they may request clarification, changes, or that you not proceed — and follow what they actually say.` |
| Com `annotations` | cada par ganha `selected preview:\n…` e/ou `notes: …` |
| `deny` com mensagem | a mensagem do `deny` (a extensão do VS Code manda o texto padrão de rejeição: "The user doesn't want to proceed with this tool use… STOP what you are doing and wait for the user…") |

A conferência "bate com as opções" aceita, numa pergunta de escolha múltipla, a string unida por
`", "`. Se um rótulo contém `", "`, a resposta cai na segunda linha da tabela, o que é inofensivo.

### 5.4 Comportamento da ferramenta no CLI

- `checkPermissions` devolve **sempre** `ask` ("Answer questions?") e
  `requiresUserInteraction()` é `true`. Ou seja, a ferramenta passa pelo `canUseTool` em qualquer
  modo; o modo `plan` foi medido ([discovery §10.9](01-descoberta-claude-agent-sdk.md)).
  `bypassPermissions` não foi medido, e o produto não oferece esse modo
  (`allowDangerouslySkipPermissions: false`).
- `isReadOnly()` e `isConcurrencySafe()` são `true`: a ferramenta não tem efeito colateral.
- `toolConfig.askUserQuestion.previewFormat: 'markdown' | 'html'` (público, em `sdk.d.ts`). Muda o
  que o modelo é instruído a gerar no `preview`. O default `markdown` é "renderizado numa caixa
  monoespaçada". `html` exige fragmento sem `<script>`/`<style>`.

### 5.5 Recursos não documentados (observados no binário)

O CLI tem um modo **"Extended questions (this host renders them)"**, ligado por
`toolConfig.askUserQuestion.extendedQuestions` (o SDK traduz para
`CLAUDE_CODE_QUESTION_EXTENDED=1`), mais `optionalDescriptions`. Nenhum dos dois está nos tipos
públicos. Com ele ligado:

- cada pergunta ganha `kind`: `choice` (default), `text` (caixa de texto, sem opções) ou `number`
  (`min`, `max`, `step`, `defaultValue`, `unit`); e um `description` de ajuda;
- a chamada ganha um `title`; a `description` das opções vira opcional;
- o modelo é instruído a preferir `multiSelect: true` e a **não** criar "Skip": o usuário pode
  deixar perguntas sem resposta;
- a resposta aceita `answers` com **array** de rótulos, `response` (texto livre para a chamada
  inteira, que vira `The user responded: …`), `followUp: true` (o usuário pediu **mais
  perguntas**; o Claude é instruído a chamar a ferramenta de novo antes de agir) e `afkTimeoutMs`
  (o usuário saiu, e o Claude segue com o que estava marcado).

Há também, em `sdk.d.ts`, `askUserQuestionTimeout` (`60s|5m|10m|never`) e `dialogExpiry` nas
configurações do CLI. Eles valem para a interface do próprio CLI e para clientes remotos dele, não
para o nosso `canUseTool`. O nosso prazo é nosso (§7.6).

**Recomendação:** não depender do modo estendido nesta entrega (§13, D-18). Fica registrado
porque é a direção provável do produto e muda a modelagem (perguntas abertas e numéricas, resposta
parcial, "me pergunte mais").

---

## 6. A referência: como a extensão do VS Code faz

Fonte: `anthropic.claude-code-2.1.286`, `webview/index.js`, desminificado. Nomes entre parênteses
são os identificadores minificados, para quem quiser conferir.

### 6.1 Onde aparece

- O card de permissão escolhe o conteúdo pela tool: um registro por ferramenta (`jQ(toolName)`)
  expõe `permissionRequest(...)`. A classe de `AskUserQuestion` (`LJ1`) devolve o componente de
  perguntas (`ic0`) no lugar do "Do you want to proceed with X?".
- Para essa tool o card **não se recolhe**, não tem as sugestões de "sempre permitir" nem o botão
  "No", e não tem o campo "Tell Claude what to do instead".
- O status da sessão vira **"Waiting for your answer…"**, e a notificação diz **"Claude is asking
  you a question."**

### 6.2 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ [Escopo ✓] [Formato] [Prazo]                          ⌄   ✕      │ ← abas = header de cada pergunta
├──────────────────────────────────────────────────────────────────┤
│ Qual formato de saída você prefere?                              │ ← texto grande
│                                                                  │
│ (•) Markdown                         │ ┌──────────────────────┐  │
│     Um arquivo .md no repositório    │ │ Markdown             │  │ ← painel de preview
│ ( ) HTML                             │ │ # Relatório          │  │   (só em escolha única
│     Página publicada                 │ │ ## Achados …         │  │    com algum preview)
│ ( ) Outro                            │ └──────────────────────┘  │
│     [ Type your answer…          ]   │                           │ ← só quando "Outro" marcado
├──────────────────────────────────────────────────────────────────┤
│ [1  Submit answers]                                Esc to cancel │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Interação

**Uma pergunta por vez**
- As abas no topo usam o `header`. A aba ganha marca de "respondida" quando há seleção.
- ← e → trocam de pergunta, ↑ e ↓ percorrem as opções em ciclo, Enter ou espaço marcam.

**Escolha única** (`role="radio"`)
- Marcar limpa a anterior.
- Se não for a última pergunta, a opção fica num estado "confirmando" por 300 ms e o card **avança
  sozinho** para a próxima.

**Escolha múltipla** (`role="checkbox"`)
- Marcar alterna a opção e não avança.

**"Other"**
- É sempre a última opção, criada pela interface.
- Marcar abre um campo de texto ("Type your answer…") com foco automático. Enter no campo avança
  para a próxima pergunta.
- Na escolha múltipla, "Other" convive com as outras opções.

**Preview**
- Só aparece na escolha única e quando alguma opção tem `preview`.
- O painel mostra o preview da opção em foco ou sob o mouse, com um pequeno atraso no hover.
- Opção sem preview mostra "No preview for this option". O conteúdo é renderizado como markdown.

**Enviar e cancelar**
- "Submit answers" fica **desabilitado até toda pergunta ter resposta não vazia**.
- Não há botão "No". O ✕ ou o Esc fazem o `reject`, um `deny` com a mensagem padrão de rejeição.

### 6.4 Processamento da resposta

1. O estado é um mapa *pergunta → conjunto de rótulos*, mais um mapa *pergunta → texto do
   "Outro"*.
2. A cada mudança, o componente remonta `{ questions, answers }`. Os rótulos são unidos por
   `", "`, e o "Other" é trocado pelo texto digitado (descartado se o texto estiver vazio).
3. Enviar chama `accept({ questions, answers })`, que vira `canUseTool → { behavior: 'allow',
   updatedInput }`. **Não manda `annotations`.**

### 6.5 Depois de respondida (a linha no histórico)

- O cabeçalho é "Question" ou "Questions".
- O corpo lista cada pergunta com as opções: a escolhida marcada, as outras esmaecidas, e o
  "Outro" com o texto digitado. Fica tudo somente leitura.
- O estado é um de três: *answered*, *declined* (com o motivo) ou *pending*. As respostas saem do
  `tool_use_result`.

### 6.6 Pergunta pendente numa sessão que caiu (o "replay")

Ao reabrir uma sessão cuja última chamada é um `AskUserQuestion` sem resultado (por exemplo,
interrompido pelo fim do processo), a extensão:

1. apresenta a pergunta de novo como **pedido local**, sem SDK do outro lado;
2. ao ser respondida, envia uma **mensagem de usuário**: `Answering your earlier question "X": Y`
   (ou `Answering your earlier questions:` seguido de uma lista);
3. ao recarregar o histórico, reconhece esse texto e marca a chamada antiga como respondida.

### 6.7 Fragilidades que a extensão contorna, e que não precisamos herdar

- Rótulo com `", "` numa pergunta de escolha múltipla torna a string ambígua. A extensão desiste
  de reconstruir a seleção.
- Uma opção que se chame literalmente "Other" se confunde com a saída livre.
- A chave por texto da pergunta colide quando dois textos são iguais.

No nosso fio a resposta é **estruturada** (§8.2): lista de rótulos, mais o texto do "Outro" em
campo separado, por **id** de pergunta. A string unida por vírgula só existe no adapter do backend.

---

## 7. Arquitetura alvo

### 7.1 A ideia

O pedido continua sendo um **pedido de permissão**: mesmo `requestId`, mesmo prazo, mesmas
garantias. Ele ganha uma **interação** do tipo `question`, e a resposta ganha as **respostas**. O
backend é o único que conhece o formato do SDK:

```
SDK input ──► normalizar (backend) ──► interaction.question ──► cliente desenha
                                                                     │
SDK updatedInput ◄── traduzir (backend) ◄── validar ◄── answers ◄────┘
```

### 7.2 Normalização (backend)

No `RequestPermissionUseCase`, quando a tool é `AskUserQuestion`, uma função pura do domínio lê o
input e produz:

```ts
QuestionInteraction {
  kind: 'question';
  questions: Array<{
    id: string;            // 'q1'…'q4', pela posição; estável dentro do pedido
    prompt: string;        // = question
    header: string;
    multiSelect: boolean;
    options: Array<{ label: string; description: string; preview: string | null }>;
  }>;
}
```

- **Input malformado** (sem perguntas, mais de 4, opção sem rótulo, texto de pergunta repetido,
  rótulo repetido na mesma pergunta) **não** vira interação genérica: vira
  `{ kind: 'question', questions: [], malformed: true }`. O cliente mostra um card **só de
  recusa**, explicando que a pergunta não pôde ser lida (D-16). Nunca há `allow` sem respostas.
- O "(Recommended)" no rótulo não é removido: é texto do Claude e a resposta precisa do rótulo
  exato. O cliente pode **destacar** a opção que termina com ele (D-23).

### 7.3 Validação e tradução da resposta (backend)

Ao resolver um pedido de pergunta:

| Regra | Erro |
|---|---|
| `allow` sem `answers` | `PERMISSION_ANSWERS_INVALID` (422) |
| `answers` num pedido que não é pergunta | `PERMISSION_ANSWERS_INVALID` (422) |
| `answers` num `deny` | `PERMISSION_ANSWERS_INVALID` (422) |
| id de pergunta inexistente, ou repetido | `PERMISSION_ANSWERS_INVALID` (422) |
| pergunta sem resposta (todas são obrigatórias, D-04) | `PERMISSION_ANSWERS_INVALID` (422) |
| rótulo que não é opção daquela pergunta | `PERMISSION_ANSWERS_INVALID` (422) |
| escolha única com mais de uma escolha (rótulos + "Outro") | `PERMISSION_ANSWERS_INVALID` (422) |
| "Outro" vazio depois de `trim`, ou acima do limite | `PERMISSION_ANSWERS_INVALID` (422) |
| forma do payload errada (tipo, `maxItems`, `maxLength`) | `INVALID_INPUT` (400), pelo schema |
| pedido com `malformed: true` respondido com `allow` | `PERMISSION_ANSWERS_INVALID` (422) |

`details[]` diz qual regra falhou e em qual pergunta, sem ecoar o texto digitado.

A tradução para o SDK é feita no **adapter** (o runner), não no domínio:

```ts
answers[q.prompt] = [...selected, ...(other ? [other] : [])].join(', ');
updatedInput = { ...originalInput, answers };   // questions e metadata preservados
```

### 7.4 O veredito ganha conteúdo

```ts
// application/session/ports/permission-gate.port.ts
interface PermissionVerdict {
  readonly decision: 'allow' | 'deny';
  readonly reason: string | null;
  /** Só numa pergunta respondida: o que o humano escolheu, por pergunta. */
  readonly answers: ReadonlyArray<QuestionAnswer> | null;
}
```

O `PermissionBridge.verdictOf` copia `answers` da resolução. O runner monta o `updatedInput`.
Preferimos `answers` a um `updatedInput` genérico: a porta continua sem conhecer o SDK, e o veredito
já fica na forma canônica de [multiplos-motores §6.4](03-multiplos-motores-de-agente.md) (D-03).

### 7.5 Regras automáticas não respondem perguntas

- `AskUserQuestion` entra numa lista de **ferramentas interativas** no domínio.
- `rule-precedence` ignora regras de **allow** para elas. Uma regra de **deny** continua valendo
  (D-08): é um jeito legítimo de dizer "não me pergunte nada nesta pasta".
- `POST /permission-rules` recusa um padrão de allow para essas ferramentas, com um código novo:
  `PERMISSION_RULE_TOOL_INTERACTIVE` (422).
- Regras de allow já gravadas para elas são ignoradas na leitura. Não há migração de dados.
- `ExitPlanMode` tem o mesmo problema (uma regra de allow aprovaria planos sem ninguém ver). A
  recomendação é incluí-lo na lista, mas é mudança de comportamento e fica para o D-08 decidir.

### 7.6 Prazo

O prazo atual é 120 s, com até 3 extensões de 120 s. Isso serve a uma permissão, não a uma
pergunta que pede leitura e reflexão. A proposta é:

- um prazo próprio, `RC_QUESTION_TIMEOUT_MS`, sugerido em 10 min, com as mesmas extensões (D-07);
- no vencimento, o mesmo `deny` com `PERMISSION_REQUEST_EXPIRED`, mas com uma mensagem ao Claude
  que diga o que aconteceu: "The user did not answer in time. Do not assume an answer; ask again
  or stop." (D-07);
- "sem prazo" com estacionamento da sessão fica para a proposta de workflow (§10.5 de lá).

### 7.7 Risco, sugestões e destaque do pedido

- `riskHint: 'read'`: a ferramenta não tem efeito colateral. Isso também tira a confirmação em
  dois passos do celular.
- `defaultToNo: false`.
- `suggestions: []`: não há escopo para "sempre responder assim". O schema já permite lista vazia?
  O plano confere e, se não permitir, ajusta.
- `title`: a chave `permission.tool.AskUserQuestion`. O `description` fica omitido; quem desenha é
  a `interaction`.

### 7.8 Onde as respostas ficam

- **`permission_requests.answers jsonb null`** (migration nova), gravado na resolução. É a fonte
  para o `GET /sessions/:id/permissions/:requestId` e para o histórico (§7.9).
- **Auditoria:** a linha de decisão (`allowed`) ganha `answers` (D-12). Quem respondeu, de onde e
  o quê é exatamente o que a trilha existe para dizer. A linha `recorded` (PreToolUse) continua
  com o input original.
- **Log:** `info` com `op: 'permission.question.answered'`, `requestId`, número de perguntas e se
  houve "Outro", **sem** o conteúdo. Em `debug`, o conteúdo truncado, como já se faz com o
  `tool input`.

### 7.9 A linha da tool depois de respondida

| Momento | Fonte das respostas |
|---|---|
| Ao vivo, no cliente que respondeu | o que ele mesmo enviou, confirmado pelo `permission.resolved` |
| Ao vivo, nos outros clientes | `permission.resolved.answers` (campo novo, §8.3) |
| Histórico (sessão reaberta, transcript) | o backend enriquece o evento `tool.started`/`tool.completed` do `AskUserQuestion` com as respostas de `permission_requests`, casando pelo `toolUseId` (D-13) |
| Histórico de sessão respondida fora do produto (CLI, VS Code) | não há registro nosso: a linha mostra as perguntas e o resumo em texto (`summary`) |

A alternativa de **ler as respostas do texto do `tool_result`** (como faz o replay da extensão)
foi descartada como fonte primária: depende de um formato de texto não documentado (§5.3).

### 7.10 Fora da tela: avisos e status

- **Push:** chaves novas, `push.question.title` ("O Claude tem uma pergunta") e
  `push.question.body` ("Abra para responder."). O push não leva o texto da pergunta. O
  `PushMessage.permissionRequested` ganha a variante pela `interaction`.
- **Web:** `WorkingIndicator`, `PendingPill`, o aviso interno (`notification.permission.waiting`)
  e o aviso do navegador ganham as variantes "pergunta" ("Aguardando sua resposta").
- **Mobile:** o mesmo no indicador e na tela de chegada do push.

---

## 8. Contrato

Os esboços abaixo são normativos para o plano só depois das decisões do §14. A fonte da verdade
continua sendo `packages/contracts/schema/`, de onde saem `protocol.ts` e `protocol.g.dart`.

### 8.1 `permission.requested` ganha `interaction` (opcional, não quebra)

```jsonc
{
  "requestId": "req_…",
  "toolUseId": "toolu_…",
  "toolName": "AskUserQuestion",
  "title": "permission.tool.AskUserQuestion",
  "input": { "questions": [ … ] },          // continua, para auditoria e depuração
  "riskHint": "read",
  "defaultToNo": false,
  "suggestions": [],
  "expiresAt": "2026-10-04T12:10:00.000Z",
  "interaction": {
    "kind": "question",                     // const; "plan" fica para depois (multiplos-motores §6.4)
    "malformed": false,
    "questions": [
      {
        "id": "q1",
        "header": "Avaliação",
        "prompt": "Qual tipo de avaliação você quer?",
        "multiSelect": false,
        "options": [
          { "label": "Backend — arquitetura (Recommended)", "description": "…", "preview": null },
          { "label": "Frontend — auditoria técnica",        "description": "…", "preview": null }
        ]
      }
    ]
  }
}
```

Limites no schema: `questions.maxItems: 4`, `options.minItems: 2`, `options.maxItems: 4`,
`header.maxLength` (com folga sobre os 12 caracteres, porque o modelo nem sempre obedece),
`prompt`/`label`/`description`/`preview` com `maxLength`. Um valor acima do limite é **truncado
na normalização** e não recusado: o texto é do Claude e o pedido precisa chegar.

### 8.2 `permission.resolve` ganha `answers`

```jsonc
{ "kind": "response", "type": "permission.resolve", "correlationId": "<id do request>",
  "payload": {
    "requestId": "req_…",
    "decision": "allow",
    "answers": [
      { "questionId": "q1", "selected": ["Backend — arquitetura (Recommended)"] },
      { "questionId": "q2", "selected": ["Lint", "Testes"], "other": "e a pipeline de CI" }
    ]
  } }
```

- `answers` tem `maxItems: 4`, `selected` tem `maxItems: 4`, e `other` tem `maxLength` (sugestão:
  2000).
- `scope` é ignorado num pedido de pergunta: o backend usa `once`.
- O `x-required-when` não consegue exprimir "obrigatório quando o pedido é uma pergunta", porque o
  payload da resposta não tem o `toolName`. Essa regra é **semântica**, fica no use case e devolve
  `PERMISSION_ANSWERS_INVALID` (§7.3). Isso é registrado no
  [05 §Campo obrigatório por condição](../architecture/shared/05-websocket-protocol.md) como
  exceção explicada.
- Recusar continua sendo `decision: 'deny'` com `reason` obrigatório. O cliente manda a chave
  padrão de recusa se o usuário não escrever nada (D-15).

### 8.3 `permission.resolved` ganha `answers` (opcional)

O mesmo formato do §8.2, presente quando a decisão foi `allow` num pedido de pergunta. Vale para o
evento, para o replay do `session.attach` e para o `GET` de estado.

### 8.4 Catálogo de erros ([04](../architecture/shared/04-errors-and-http.md))

| Código | HTTP | `messageKey` | Quando |
|---|---|---|---|
| `PERMISSION_ANSWERS_INVALID` | 422 | `permission.error.answersInvalid` | §7.3 |
| `PERMISSION_RULE_TOOL_INTERACTIVE` | 422 | `permission.error.ruleToolInteractive` | regra de allow para ferramenta interativa (§7.5) |

### 8.5 Versão do protocolo

Só entram campos opcionais novos, então o `v` não muda
([05 §Versionamento](../architecture/shared/05-websocket-protocol.md)). Um cliente antigo que
receber uma pergunta mostra o card genérico e, ao permitir, recebe `PERMISSION_ANSWERS_INVALID`.
É falha **fechada**: o Claude não recebe um "permitido" vazio. Como os três clientes são nossos e
saem juntos, essa janela só existe para um app de celular desatualizado.

### 8.6 Limitação do gerador

O gerador de contratos aceita `object`, `string`, `integer`, `boolean`, `array`, `enum` e `const`,
e **não** aceita `oneOf`. Com uma única variante (`kind: const 'question'`) isso basta. Quando
`plan` entrar como segunda variante, ou o gerador ganha união discriminada, ou a `interaction`
vira um objeto com campos opcionais por tipo. Fica registrado como risco R-03.

---

## 9. Fluxos

### 9.1 Caminho feliz

```
Claude ─ AskUserQuestion ─► canUseTool ─► RequestPermissionUseCase
                                           ├─ normaliza → interaction.question
                                           ├─ regra de allow? ignorada (ferramenta interativa)
                                           ├─ prazo = RC_QUESTION_TIMEOUT_MS
                                           ├─► event permission.requested (todas as conexões)
                                           └─► push "O Claude tem uma pergunta" (se ninguém online)
web/app: card de pergunta → usuário escolhe → "Enviar respostas"
  ◄── response permission.resolve { decision:'allow', answers:[…] }
ResolvePermissionUseCase ─ valida ─ settle ─ grava answers ─ audita
  ├─► event permission.resolved { …, answers } (todas as conexões)
  └─► PermissionBridge → verdict { allow, answers } → runner → updatedInput { questions, answers }
CLI → tool_result "Your questions have been answered: …" → Claude continua
```

### 9.2 Recusar

"Não responder" envia `deny` com `reason` (o texto do usuário ou a chave padrão). O Claude recebe
a mensagem e para, como acontece com qualquer recusa.

### 9.3 Prazo vencido

O deadline liquida com `PERMISSION_REQUEST_EXPIRED`. O Claude recebe a mensagem do §7.6. O card
vira "a pergunta expirou", e as escolhas feitas e não enviadas são descartadas.

### 9.4 Dois clientes

Web e celular mostram o mesmo card, e **a primeira resposta vence**. O outro cliente recebe
`permission.resolved` com `answers`, troca o card pela linha respondida ("respondida por você, no
celular") e descarta o rascunho local. Se ele enviar depois, recebe o `ack` silencioso da
idempotência.

### 9.5 Reconexão no meio da resposta

O rascunho (seleções e texto do "Outro") é **estado local do card**. Se o socket cair, o card
continua editável. No `session.attach`, o replay reentrega o mesmo `requestId`, e o card é
reaproveitado **sem perder o rascunho**: a chave é o `requestId`. Se o pedido tiver sido resolvido
em outro lugar nesse meio-tempo, vale o §9.4.

### 9.6 Chegada pelo push (mobile)

O deep link abre `/sessions/:sessionId/permissions/:requestId`. O `GET` de estado devolve o pedido
com a `interaction`, e a tela de permissão mostra o **card de pergunta** em tela cheia. Pendente,
resolvido (com as respostas), 410 e 404 continuam como hoje.

### 9.7 Pergunta dentro de subagente

A pergunta chega pelo mesmo `canUseTool`, com `parentToolUseId`. O web já põe numa cauda
(`TailRequests`) o pedido cuja linha não está desenhada. O card de pergunta herda isso sem
tratamento especial. Precisa de um cenário.

---

## 10. Mudanças por ponta

### 10.1 Backend

| Camada | Mudança |
|---|---|
| `domain/permission` | `QuestionInteraction` e `QuestionAnswer` (value objects); `normalizeQuestion(input)` e `validateAnswers(interaction, answers)` (funções puras); a lista `INTERACTIVE_TOOLS`; `PermissionAnswer`/`PermissionResolution` com `answers`; o `risk.classifier` com `AskUserQuestion` em `read`; `rule-precedence` ignorando allow para ferramenta interativa; os erros `PermissionAnswersInvalidError` e `PermissionRuleToolInteractiveError`. |
| `application/permission` | o `RequestPermissionUseCase` normaliza e escolhe o prazo; o `permission-payloads` emite `interaction`, `suggestions: []`, `defaultToNo: false` e `answers` no resolved; o `ResolvePermissionUseCase` valida e passa `answers`; o `settle-permission` persiste; o `PermissionSettings` ganha `questionTimeoutMs`. |
| `application/session` | `PermissionVerdict.answers`. |
| `adapter/outbound/claude` | o `permission-bridge.verdictOf` copia `answers`; o `session-runner.canUseTool` monta o `updatedInput`; o `transcript.adapter` (ou um enriquecedor na aplicação) junta as respostas no histórico. |
| `adapter/inbound/ws` | zod do `resolve` com `answers`; o handler em `permission.module.ts` repassa. |
| `adapter/inbound/http` | o `POST /permission-rules` recusa allow para ferramenta interativa; o `GET` de estado devolve `interaction` e `answers`. |
| `persistence` | migration `permission_requests.answers jsonb`; mapper; coluna ou campo de `answers` na linha de auditoria (D-12). |
| `notification` | variante de pergunta no `PushMessage` e as chaves `push.question.*` em `en`/`pt-BR`. |
| `infrastructure/config` | `RC_QUESTION_TIMEOUT_MS` validado em `environment.ts`, mais `.env.example`. |

### 10.2 Web

| Onde | Mudança |
|---|---|
| `features/permission/types` | `PermissionRequest.interaction`, `QuestionAnswer`, `PermissionOutcome.answers`. |
| `services/permission.service.ts` | `toRequest` lê `interaction`; `sendAnswer` aceita `answers`; `toOutcome` lê `answers`. |
| `hooks/usePermissionQueue.ts` | `answerQuestion(request, answers)` e o rascunho por `requestId`, que sobrevive a reconexão e a replay. |
| `components/QuestionCard.tsx` (novo) | o card (§10.4). Entra no desvio de `PermissionRequestCard.tsx`, ao lado do `ExitPlanMode`. |
| `components/AnsweredQuestions.tsx` (novo) | a pergunta respondida, somente leitura. É usado pela linha da tool e pelo card resolvido em outro lugar. |
| `session/components/conversation/ToolRow.tsx` | um ramo para `AskUserQuestion`, no mesmo padrão de `DIFFABLE` e `opensSubagent`: no lugar do JSON e do `summary`, mostra `AnsweredQuestions`. |
| `session/lib/tool-labels.ts` | um rotulador: "Perguntou: {header}" ou "Fez 3 perguntas". |
| Status e avisos | `WorkingIndicator`, `PendingPill`, `usePermissionNotices` e `useBrowserNotifications` com a variante "pergunta". |
| i18n | `permission.question.*` em `en`/`pt-BR` e o par em `scripts/i18n-shared.json`. |
| Componentes | inputs nativos de radio e checkbox, estilizados, como no `PlanApprovalCard` (D-20). O preview usa o `Markdown` seguro existente, em modo monoespaçado. |

### 10.3 Mobile

| Onde | Mudança |
|---|---|
| `domain/entities/permission_request.dart` | `interaction` e `QuestionAnswer`. |
| `data/mappers/permission_mapper.dart` | lê `interaction` e `answers`. |
| `data/datasources/permission_ws_data_source.dart` e `domain/repositories` | `answer(..., answers)`. |
| `presentation/providers/permission_queue_controller.dart` | `answerQuestion` e o rascunho por `requestId`. Biometria: D-11. |
| `presentation/widgets/question_card.dart` (novo) | o card (§10.4), no desvio de `permission_panel.dart`. |
| `presentation/widgets/answered_questions.dart` (novo) | somente leitura. Usado pela linha da tool e pela tela de chegada. |
| `session/.../tool_card.dart` | ramo para `AskUserQuestion`. |
| `permission_card_view.dart` (`toolLabel`) e a tela de chegada do push | a chave nova e o card de pergunta em tela cheia. |
| i18n | `permissionQuestion*` em `app_en.arb`/`app_pt.arb`, com `@descrição`. |
| Preview | `SelectableText` monoespaçado, sem dependência nova (D-21). |

### 10.4 O card de pergunta: comportamento comum

Sigo a referência (§6) com os ajustes para o nosso contexto.

**Estrutura**
- Com várias perguntas, uma por vez. No web, abas com o `header`. No celular, um passo por tela,
  com "Pergunta 2 de 3" e Voltar/Próxima, porque abas não cabem bem numa tela estreita.
- A aba ou o passo ganha marca de respondido.
- Cada opção mostra o rótulo e a descrição; a que termina em "(Recommended)" é destacada (D-23).
- "Outro" é sempre a última opção e abre um campo de texto com foco.
- Escolha única: radio. Escolha múltipla: checkbox, e "Outro" pode ser combinado com outras
  opções.

**Avanço automático**
- Ao escolher numa pergunta de escolha única que não é a última, o card avança para a próxima,
  como na extensão.
- No celular, o avanço também acontece, mas o botão Voltar fica sempre à vista.

**Preview**
- Só em escolha única com algum preview.
- No web, um painel lateral com o preview da opção em foco ou sob o mouse; empilhado, em tela
  estreita.
- No celular, um "Ver prévia" por opção abre uma folha com o conteúdo.

**Enviar e recusar**
- "Enviar respostas" fica desabilitado até toda pergunta ter resposta. Um "Outro" marcado mas
  vazio não conta como resposta.
- "Não responder" recusa e abre um campo opcional de motivo. No web, Esc faz o mesmo.

**Prazo e estados**
- O card mostra a contagem regressiva e o "Estender", reaproveitando `PermissionCountdown` e
  `ExtendAction`.
- Enquanto envia, o card fica bloqueado e mostra "Enviando". Se o socket estiver fora, o envio é
  liberado e o rascunho fica.

**Acessibilidade e teclado (web)**
- `role="radiogroup"` / `role="group"` por pergunta, com `aria-checked`.
- ← e → trocam de pergunta, ↑ e ↓ andam pelas opções, Enter marca, Ctrl/⌘+Enter envia.
- O foco na chegada vai para a primeira opção, e não para "recusar" (`defaultToNo: false`).

**Pergunta malformada:** o card mostra só a explicação e "Não responder" (D-16).

---

## 11. Testes e fixtures

### 11.1 Fake SDK e fixtures

- **Regravar** com um gravador que **responde** a pergunta:
  [record-agent-sdk-fixtures.mjs](../../scripts/record-agent-sdk-fixtures.mjs) passa a devolver
  `answers` fixos (a primeira opção de cada pergunta) quando a tool é `AskUserQuestion`. Isso
  corrige o `plan-turn` e produz `tool_result` e `tool_use_result` realistas.
- **Fixture nova, `question-turn`**: um prompt que leve o Claude a fazer **duas ou mais
  perguntas, uma de escolha múltipla e uma com preview**. Como a gravação depende do modelo, o
  gravador confere a forma (`questions.length ≥ 2`, `some(multiSelect)`, `some(preview)`) e falha
  se o modelo não cooperar, em vez de gravar algo menos útil.
- **O replay continua ignorando o veredito** (D-19). A prova de que a resposta chega ao SDK fica
  em dois níveis:
  - **unit**: o runner monta o `updatedInput` certo a partir do veredito;
  - **integração**: o `ScriptedQuery` **registra** o que o `canUseTool` devolveu, e o teste lê
    esse registro.
  - O e2e prova a tela, o fio e a linha respondida.

### 11.2 O que quebra e precisa ser ajustado

- `e2e/specs/claude-panel-changes.spec.ts` (o "Permitir uma vez" no card do `AskUserQuestion`) e o
  `planAsksBefore` do `panel-changes.json` passam a responder pelo card de pergunta.
- `recorded-fixtures.spec.ts`, `sdk-message.mapper.spec.ts`, `session-runner.spec.ts` e
  `permission-bridge.spec.ts`, por causa do veredito novo.
- Os testes de `permission-payloads` e do classificador de risco.

### 11.3 Níveis

| Nível | Backend | Web | Mobile |
|---|---|---|---|
| unit | normalização, validação, tradução, `rule-precedence`, classificador, payloads, runner | service (`toRequest`/`sendAnswer`), store, hook (rascunho), `tool-labels` | mapper, data source, controller, entidades |
| integração | WS `permission.resolve` com `answers` (Testcontainers), `GET` de estado, `POST /permission-rules` recusando, migration, auditoria, enriquecimento do histórico | `QuestionCard` (todas as variantes), `ChatInline` (linha respondida), `PermissionQueue` | widget: `question_card`, `permission_panel`, `permission_page`, `tool_card` |
| e2e | — | Playwright com `question-turn`: escolha única, múltipla, "Outro", recusa, prazo, dois clientes | `integration_test` com o mesmo cenário; a chegada pelo push |

---

## 12. Alinhamento com as propostas existentes

| Proposta | O que ela pede | Como esta proposta atende |
|---|---|---|
| [workflow-de-sessoes §4](02-workflow-de-sessoes.md), lacunas 1 e 2 | veredito com respostas; tela de pergunta nas três pontas | é exatamente o escopo daqui |
| [workflow-de-sessoes §10.2](02-workflow-de-sessoes.md) (objeto decisão) | `questions` com `id`, `kind`, opções com `id`, recomendação, `answer` por id | o fio já usa **id de pergunta** e resposta estruturada. A caixa de decisões (§10.3 de lá) pode **embrulhar** o card de pergunta sem mudar o contrato do pedido |
| [workflow-de-sessoes §13.1-13.2](02-workflow-de-sessoes.md) (`QuestionResponder`, validação contra as opções) | resposta automática antes do humano, validada | a validação do §7.3 é a mesma que um respondedor automático vai usar; o ponto de encaixe é o `RequestPermissionUseCase` |
| [multiplos-motores §6.4 e §8](03-multiplos-motores-de-agente.md) | interação canônica `question`; `permission.resolve` ganha `answers` | `interaction.kind = 'question'` e `answers` no resolve, sem nome de ferramenta do Claude no domínio do cliente |
| [multiplos-motores §10.2](03-multiplos-motores-de-agente.md) e ME-15 (ordem M0 × WF-A) | "fazer canônico desde o início" | fazemos, sem esperar o M0. O M0 depois só generaliza a origem (`kind` do pedido e capacidade `questions`) |

**Recomendação (D-01):** fazer como **plano próprio**, com o número 22 e inserido antes do 19, que
fica sempre por último. A justificativa é que o problema é real hoje, independe de workflow e de
outros motores, e as duas propostas maiores o tratam como pré-requisito.

---

## 13. Fora do escopo

- **A caixa de decisões** (workflow §10.3), recomendação com evidência e respondedor automático
  (UC-07, UC-08).
- **Migrar o `ExitPlanMode` para `interaction.kind = 'plan'`.** O `PlanApprovalCard` continua como
  está. A única mudança possível é a lista de ferramentas interativas (D-08).
- **O modo estendido do CLI** (§5.5): perguntas `text`/`number`, resposta parcial, `response`,
  "me pergunte mais".
- **`annotations.notes`** e o envio do preview escolhido (D-06).
- **Responder depois, com a sessão caída** (o "replay" da extensão, §6.6). Depende do
  estacionamento de sessão da proposta de workflow (D-17).
- **`previewFormat: 'html'`** (princípio 6).
- **Markdown completo no app** (plano 21 e D-21).

---

## 14. Decisões em aberto

Cada uma traz a recomendação. Viram `D-nn` no `decisions.md` do plano.

| ID | Pergunta | Recomendação |
|---|---|---|
| D-01 | Plano próprio ou fase do WF-A ou do M0? | plano próprio (22, inserido antes do 19), já na forma canônica (§12) |
| D-02 | Quem normaliza as perguntas: o backend (`interaction`) ou cada cliente lendo o `input`? | o backend; o cliente nunca lê o input do SDK |
| D-03 | Resposta no fio: estruturada por id ou o mapa texto → string do SDK? Veredito com `answers` ou com `updatedInput` genérico? | estruturada por id; `answers` no veredito, com a tradução no adapter |
| D-04 | Toda pergunta é obrigatória? | sim, como na extensão. A resposta parcial vem com o modo estendido |
| D-05 | Preview: entra? Em que formato? | entra, em markdown, renderizado com o `Markdown` seguro no web e monoespaçado no app; `previewFormat` no default |
| D-06 | Notas por pergunta (`annotations.notes`)? | não, por enquanto; a extensão também não manda |
| D-07 | Prazo da pergunta e mensagem ao Claude no vencimento | `RC_QUESTION_TIMEOUT_MS` = 10 min, com as extensões atuais; mensagem explícita de "não respondida a tempo" |
| D-08 | Ferramentas interativas e regras: allow ignorado e recusado na API; deny mantido. Incluir `ExitPlanMode`? | sim para `AskUserQuestion`; sim para `ExitPlanMode`, registrando a mudança de comportamento |
| D-09 | Sugestões de escopo numa pergunta | nenhuma (`suggestions: []`) |
| D-10 | `riskHint` e `defaultToNo` | `read` e `false` |
| D-11 | No celular, a biometria (`approvalLock`) vale para responder pergunta? | não: responder não autoriza execução. Fica registrado porque o lock hoje vale para todo `allow` |
| D-12 | Onde guardar as respostas | `permission_requests.answers` e a linha de decisão da auditoria |
| D-13 | Histórico: de onde vêm as respostas | do nosso banco, pelo `toolUseId`; fora disso, o `summary` em texto. Ler o texto do `tool_result` não é fonte primária |
| D-14 | `permission.resolved` carrega `answers`? | sim, para o outro cliente e para a linha ao vivo |
| D-15 | Recusa: botão explícito ou só ✕/Esc? Motivo obrigatório? | botão "Não responder" mais Esc no web; motivo opcional, com a chave padrão quando vazio |
| D-16 | Input malformado | card só de recusa, com explicação; `allow` recusado no backend |
| D-17 | Responder depois, com a sessão caída (replay) | fora; volta com o estacionamento de sessão do workflow |
| D-18 | Modo estendido do CLI (`extendedQuestions`) | não ligar; reavaliar quando entrar nos tipos públicos |
| D-19 | Fake SDK: passar a honrar o veredito ou registrar o que recebeu? | registrar o que recebeu e regravar as fixtures com respostas |
| D-20 | Web: inputs nativos ou `radio-group`/`checkbox` do shadcn (Radix, dependência nova)? | nativos, como o `PlanApprovalCard` |
| D-21 | App: dependência de markdown para o preview? | não agora; monoespaçado. O markdown entra num plano próprio de prévias no app |
| D-22 | Texto do push | chaves `push.question.*`, sem conteúdo do Claude |
| D-23 | Destacar a opção "(Recommended)" | destacar visualmente, sem pré-selecionar e sem alterar o rótulo |
| D-24 | Avanço automático na escolha única | sim nos dois clientes, com o Voltar sempre visível no app |

---

## 15. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R-01 | O SDK muda o formato de `answers` (o binário já aceita array) ou o texto do `tool_result` | a tradução fica isolada no adapter, com teste unit do `updatedInput`; o histórico não depende do texto (D-13); o gravador de fixtures detecta mudança |
| R-02 | O modo estendido vira padrão e o modelo passa a mandar `kind: text/number` sem opções | a normalização trata pergunta sem opções como **malformada** (card só de recusa), e não como erro; o plano tem cenário para isso |
| R-03 | O gerador de contratos não tem `oneOf`, e a segunda variante (`plan`) não cabe | registrado; resolver quando o `plan` entrar (§8.6) |
| R-04 | A regravação de fixtures depende do modelo cooperar (duas perguntas, uma múltipla, uma com preview) | o gravador confere a forma e falha alto; o prompt da gravação é explícito |
| R-05 | Um celular desatualizado mostra o card genérico | falha fechada: `PERMISSION_ANSWERS_INVALID` ao permitir (§8.5) |
| R-06 | Rascunho perdido por reconexão ou replay | estado do card por `requestId`, com cenário de concorrência e reconexão |
| R-07 | Regras de allow para `AskUserQuestion` já gravadas | ignoradas na leitura; aparecem na tela de regras como inativas? (o plano decide a apresentação) |
| R-08 | Texto da pergunta enorme ou com marcação estranha | `maxLength` com truncamento na normalização; tudo renderizado como texto, exceto o preview, que usa o markdown seguro |
| R-09 | `spec` de e2e e fixture atuais quebram na mesma mudança | previsto no §11.2; a fase de e2e é a última |

---

## 16. Matriz de cenários (semente)

É uma semente, não a matriz final: o plano renumera, completa e atribui tasks. Dimensões: `eq`
equivalência, `fron` fronteira, `err` erro, `est` transição de estado, `conc` concorrência, `idem`
idempotência.

| # | Cenário | Dim | Nível | Erro esperado |
|---|---|---|---|---|
| 1 | Uma pergunta, escolha única, opção escolhida → o Claude recebe `answers` com o rótulo | eq | unit + integração + e2e | — |
| 2 | Uma pergunta, escolha múltipla, duas opções → rótulos unidos por `", "` no SDK | eq | unit + e2e | — |
| 3 | Escolha única com "Outro" → o texto vai no lugar do rótulo | eq | unit + e2e | — |
| 4 | Escolha múltipla com opções e "Outro" juntos | eq | unit | — |
| 5 | Quatro perguntas × quatro opções (máximo) | fron | integração + e2e | — |
| 6 | Uma pergunta com duas opções (mínimo) | fron | unit | — |
| 7 | "Outro" no limite de tamanho, e um caractere acima | fron | unit + integração | `INVALID_INPUT` acima |
| 8 | Texto da pergunta e rótulos acima do `maxLength` → truncados na normalização | fron | unit | — |
| 9 | `allow` sem `answers` | err | integração | `PERMISSION_ANSWERS_INVALID` |
| 10 | Rótulo que não existe na pergunta | err | unit + integração | `PERMISSION_ANSWERS_INVALID` |
| 11 | Escolha única com dois rótulos, ou rótulo + "Outro" | err | unit | `PERMISSION_ANSWERS_INVALID` |
| 12 | Uma pergunta sem resposta | err | unit | `PERMISSION_ANSWERS_INVALID` |
| 13 | `questionId` inexistente ou repetido | err | unit | `PERMISSION_ANSWERS_INVALID` |
| 14 | `answers` num pedido que não é pergunta (ex.: `Bash`) | err | integração | `PERMISSION_ANSWERS_INVALID` |
| 15 | `answers` junto com `deny` | err | unit | `PERMISSION_ANSWERS_INVALID` |
| 16 | "Outro" só com espaços | err | unit | `PERMISSION_ANSWERS_INVALID` |
| 17 | Input malformado (0 perguntas, 5 perguntas, 1 opção, texto repetido, sem `options` como no modo estendido) → `malformed: true`, card só de recusa; `allow` recusado | err | unit + integração | `PERMISSION_ANSWERS_INVALID` no allow |
| 18 | Regra de allow `AskUserQuestion` criada pela API | err | integração | `PERMISSION_RULE_TOOL_INTERACTIVE` |
| 19 | Regra de allow já gravada não responde a pergunta; o humano é perguntado | est | integração | — |
| 20 | Regra de deny `AskUserQuestion` recusa automaticamente | eq | integração | — (`DENIED_BY_RULE` na trilha) |
| 21 | Recusar com e sem motivo → `deny` com o texto ou com a chave padrão | eq | integração + e2e | — |
| 22 | Prazo vence → `PERMISSION_REQUEST_EXPIRED`, mensagem explícita ao Claude, card expira | est | integração + e2e | `PERMISSION_REQUEST_EXPIRED` |
| 23 | Estender o prazo de uma pergunta | est | integração | — |
| 24 | Pergunta com prazo próprio (`RC_QUESTION_TIMEOUT_MS`) e não o de permissão | eq | unit | — |
| 25 | Dois clientes: o web responde primeiro; o app recebe `resolved` com `answers` e mostra a linha respondida | conc | integração + e2e | — |
| 26 | Dois clientes respondem ao mesmo tempo com respostas diferentes → a primeira vence; a segunda recebe `ack` | conc | integração | — |
| 27 | A mesma resposta reenviada (mesmo `requestId`) → `ack` silencioso, SDK chamado uma vez | idem | integração | — |
| 28 | Reconexão no meio da resposta: o replay do `attach` mantém o rascunho | est | integração (web e app) | — |
| 29 | Pergunta respondida em outro lugar enquanto o socket estava fora | conc | integração | — |
| 30 | Chegada pelo push: o `GET` de estado devolve `interaction`; resolvido devolve `answers`; 410 e 404 | est | integração + e2e (app) | `PERMISSION_REQUEST_EXPIRED` / `PERMISSION_REQUEST_NOT_FOUND` |
| 31 | Push de pergunta usa `push.question.*` e não carrega o texto | eq | unit | — |
| 32 | `riskHint: read`: o app não pede a confirmação em dois passos | eq | widget | — |
| 33 | Biometria: responder a pergunta não pede desbloqueio (se D-11 confirmar) | eq | widget | — |
| 34 | Sessão encerrada com pergunta aberta → expiry, card fecha | est | integração | — |
| 35 | Pergunta de subagente vai para a cauda e é respondida | eq | integração (web) | — |
| 36 | Linha respondida ao vivo e no histórico (enriquecida pelo `toolUseId`) | eq | integração | — |
| 37 | Histórico de sessão respondida fora do produto → perguntas e `summary`, sem quebra | eq | integração | — |
| 38 | Preview: escolha única com preview mostra o painel; escolha múltipla com preview ignora | eq | integração (web e app) | — |
| 39 | Avanço automático na escolha única; não avança na múltipla nem na última pergunta | est | integração | — |
| 40 | "Enviar" desabilitado até todas respondidas; "Outro" marcado e vazio não conta | fron | integração | — |
| 41 | Teclado no web: ←/→, ↑/↓, Enter, Ctrl+Enter, Esc | eq | integração | — |
| 42 | Auditoria grava as respostas na linha de decisão; o log `info` não traz conteúdo | eq | integração | — |
| 43 | Cliente antigo permite pelo card genérico → recusado | err | integração | `PERMISSION_ANSWERS_INVALID` |
| 44 | Duas perguntas com o mesmo texto na chamada → malformada | err | unit | — |
| 45 | Rótulo com `", "` em escolha múltipla → tradução correta, sem quebra | fron | unit | — |

---

## 17. Fatiamento sugerido

Ordem por dependência. A fase de e2e fica **por último**, como em todo plano.

| Fase | Conteúdo | Depende de |
|---|---|---|
| F0 — Normas e contrato | 05 (pedido, resposta, resolved, a exceção do `x-required-when`), 04 (dois códigos novos), schemas em `packages/contracts`, `protocol.ts` e `protocol.g.dart` gerados, chaves de i18n reservadas | — |
| F1 — Backend | domínio (normalizar, validar, ferramentas interativas, risco), resolve e veredito, bridge e runner (`updatedInput`), regras, prazo próprio, migration e auditoria, push, `GET` de estado, logs | F0 |
| F2 — Fixtures | gravador respondendo, `plan-turn` regravado, `question-turn` novo, `ScriptedQuery` registrando o veredito | F1 |
| F3 — Web | `QuestionCard`, `AnsweredQuestions`, ramo no `ToolRow`, rotulador, status e avisos, i18n | F0, F1 |
| F4 — Mobile | `question_card`, `answered_questions`, ramo no `tool_card`, tela de chegada do push, controller, i18n | F0, F1 |
| F5 — Histórico | enriquecimento das respostas pelo `toolUseId` no transcript; a linha respondida nas duas pontas | F1, F3, F4 |
| F6 — E2E | Playwright e `integration_test` com `question-turn`; o ajuste do `claude-panel-changes` | todas |

**Esforço relativo:**
- F1 e F3 são os maiores.
- F4 é parecido com F3, sem o painel de preview lado a lado.
- F2 é pequeno, mas arriscado (R-04).
- F0 e F5 são pequenos.

---

## 18. Referências

**SDK e CLI (0.3.277)**
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts`: `AskUserQuestionInput` e
  `AskUserQuestionOutput`.
- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`: `ToolConfig.askUserQuestion.previewFormat`,
  `CanUseTool` (opções `title`, `description`, `defaultToNo`, `suggestions`),
  `askUserQuestionTimeout` e `dialogExpiry`.
- O binário `claude` em `@anthropic-ai/claude-agent-sdk-linux-x64`: `checkPermissions`,
  `mapToolResultToToolResultBlockParam` e o prompt da tool, inclusive o modo estendido.

**Extensão do VS Code (2.1.286)**
- `~/.vscode/extensions/anthropic.claude-code-2.1.286-linux-x64/webview/index.js`.
- Componentes: `ic0` (perguntas), `am` (opção), `aA0` (card de permissão, o "Submit answers"),
  `LJ1` (renderer da tool), `maybeReplayUnansweredQuestion` (replay).

**Documentos do repositório**
- [05 — protocolo WebSocket](../architecture/shared/05-websocket-protocol.md): o fluxo de
  permissão, o campo obrigatório por condição e o versionamento.
- [04 — erros e HTTP](../architecture/shared/04-errors-and-http.md).
- [02 — i18n](../architecture/shared/02-i18n.md).
- [06 — estratégia de testes](../architecture/shared/06-testing-strategy.md) e
  [11 — protocolo de validação](../architecture/shared/11-validation-protocol.md).
- [Discovery do Agent SDK §10.9](01-descoberta-claude-agent-sdk.md).
- [workflow-de-sessoes.md](02-workflow-de-sessoes.md) e
  [multiplos-motores-de-agente.md](03-multiplos-motores-de-agente.md).
- Planos relacionados:
  - [08 B-22](../plans/08-claude-panel/F2-rendering.md) (modo plan);
  - [09 F4](../plans/09-chat-layout/README.md) (permissão inline, web);
  - [10 F4](../plans/10-mobile-chat-layout/F4-inline.md) (permissão inline, app).
