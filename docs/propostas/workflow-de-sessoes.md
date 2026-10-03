# Proposta — Workflow de sessões

**Estado:** rascunho, em discussão. Nenhum código escrito.
**Criada em:** 2026-10-03, a partir de uma conversa com o usuário. Revisada no mesmo dia duas vezes:
quando a execução autônoma de trabalho passou a ser o caso central, e quando ficou definido que (a)
o motor **não conhece formato de tarefa nenhum** e (b) a **execução** também é um arquivo legível
por humano, ao lado do arquivo do workflow.
**Destino:** servir de insumo para um ou mais planos em [docs/plans/](../plans/README.md). Esta
proposta **não** é um plano: não tem fases com tarefas, nem critério de conclusão. O que ela fixa é
o **quê** e o **porquê**, e lista o que ainda precisa ser decidido antes de virar plano.

---

## 1. O pedido

O usuário quer criar e executar **workflows** dentro da ferramenta. O caso que mais pesa:

> **executar um trabalho inteiro** em etapas, **encadeando as execuções em sessões diferentes** —
> por exemplo, um prompt "implementar fase 1 e 2", e depois, **de forma autônoma, seguindo o
> workflow**, "implementar fase 3 e 4"; ou "implementar task 1 e 2", e assim por diante. O usuário
> é **notificado** dessas execuções; quando for preciso uma **decisão humana**, o celular e o web
> avisam e **apresentam o que tem de ser decidido**; e o usuário **acompanha visualmente** onde o
> fluxo está e como foi executado — **sucesso, erro, detalhes do erro e como remediá-lo** —, pode
> **parar** o workflow e **responder pela UI**, de forma **estruturada e fácil**, as questões que a
> execução levantar. O objetivo é deixá-lo **o mais autônomo possível**.

Três restrições sobre a forma, ditas pelo usuário:

- **o trabalho não segue o formato de tarefas deste repositório.** O usuário vai usar outros
  formatos — desenvolvimento orientado por specs (*spec-driven development*), por exemplo. O motor
  não pode depender de nenhum deles;
- **o workflow é um arquivo** entendido e editado por um ser humano, com um **editor visual**;
- **a execução do workflow é outro arquivo**, também legível por humano, com os detalhes do que
  aconteceu.

E os casos que vieram antes, que continuam valendo:

- depois que uma ação acontece numa sessão, **disparar outra sessão com outro prompt**;
- **responder automaticamente** a perguntas feitas dentro de uma sessão;
- **usar uma sessão, com um prompt próprio, para responder as perguntas de outra sessão**;
- **enviar notificações** a partir de ações;
- **mandar email**.

---

## 2. Casos de uso concretos

Os casos abaixo servem de régua: os dois formatos, o motor e as telas têm de expressar todos eles
sem gambiarra. Também são a semente dos cenários de e2e.

| # | Caso | Gatilho | Passos |
|---|---|---|---|
| **UC-01** | **Lotes explícitos** | manual: o usuário escolhe a spec e os lotes ("fase 1 e 2", "fase 3 e 4", "fase 5") | para cada lote, uma sessão nova recebe "implementar «lote» de «spec»" → a verificação confirma pela evidência → correção até 3 vezes → só então pergunta ao humano → próximo lote |
| **UC-02** | **Até concluir** | manual: a spec e o tamanho do lote ("2 fases por vez") | uma sessão nova lê a spec, implementa **o próximo lote pendente** e diz o que falta; o workflow repete até não faltar nada (ou até um teto) |
| **UC-03** | **Work item** | manual: um texto, um arquivo ou um item de rastreador | uma sessão planejadora quebra o item em lotes; **o humano aprova a lista**; segue como o UC-01 |
| **UC-04** | **Acompanhar e remediar de longe** | — | do celular: ver em que lote está, o que passou, o que falhou e por quê; responder uma decisão; aplicar uma remediação ("tentar de novo com esta orientação", "retomar do lote 3"); pausar, parar |
| **UC-05** | **Ler uma execução depois** | — | abrir o arquivo da execução de ontem, no editor ou na ferramenta, e entender sem ajuda o que rodou, em que ordem, quanto custou, o que falhou e o que foi feito a respeito |
| UC-06 | Revisão automática | a sessão terminou um turno dizendo que terminou | abre uma sessão revisora → se aprovado, notifica; senão, devolve os apontamentos |
| UC-07 | Respostas padrão | o Claude perguntou (`AskUserQuestion`) "qual gerenciador de pacotes?" | responde `pnpm` sem incomodar ninguém |
| UC-08 | Sessão conselheira | qualquer `AskUserQuestion` numa pasta | a pergunta vai para uma sessão "arquiteta"; se ela não souber, vai para o humano |
| UC-09 | Aviso de fim | a sessão encerrou | push e email com o resumo |
| UC-10 | Plano aprovado por critério | o Claude propôs um plano (`ExitPlanMode`) | uma sessão revisora aprova ou rejeita com o motivo |
| UC-11 | Rotina agendada | todo dia útil, 9h | sessão "atualize as dependências e rode os testes", email com o resultado |
| UC-12 | Portão humano no meio | manual | sessão A prepara a migração → **um humano aprova pelo celular** → sessão B aplica |

---

## 3. Princípios

1. **O motor encadeia; quem entende o trabalho é a sessão.** O motor não lê spec, plano, checklist
   nem issue. Ele manda prompts, recebe saídas estruturadas e decide o próximo passo pelo que o
   workflow diz. Qualquer formato de trabalho — SDD, plano, lista de tarefas, um parágrafo — serve,
   porque quem o interpreta é o Claude, que já sabe ler todos.
2. **Dois arquivos de texto, os dois legíveis**: o **workflow** (o que deve acontecer) e a
   **execução** (o que aconteceu). Nenhum dos dois é um formato que só a ferramenta entende.
3. **Ida e volta sem perda** no workflow: editar no canvas preserva comentários, ordem e formatação.
4. **Nada de código arbitrário.** Condições e templates são uma linguagem pequena e fechada.
5. **Autônomo por padrão, com os pontos de decisão explícitos.** Quando o workflow para, é por um
   motivo que tem nome, e o motivo vira uma **decisão estruturada**.
6. **Decidir e remediar tem de ser fácil.** Toda decisão e todo erro chegam com contexto, opções,
   consequências, recomendação e evidência, e se respondem com um toque, no web ou no celular.
7. **Evidência, não relato.** Um lote está pronto quando a verificação dele **rodou e passou**,
   conferida pelo motor — não quando a sessão diz que terminou.
8. **Parar é sempre possível**, de qualquer tela, e nunca perde o trabalho já feito.
9. **O humano continua no controle das permissões.** Workflow automatiza conversa e encadeamento,
   não contorna o [fluxo de permissão](../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão).
10. **Limite é obrigatório.** Profundidade, iterações, tempo, sessões e custo têm teto.
11. **As regras do repositório valem igual** para a implementação desta funcionalidade: contrato
    nas três pontas, i18n por `messageKey`, I/O logado em `debug`, três níveis de teste, 90 %.

---

## 4. O que já existe e serve de base

| Peça | Onde | Como serve |
|---|---|---|
| Barramento interno (`EventEmitter2`) | [backend/03 §Comunicação assíncrona](../architecture/backend/03-modules.md#comunicação-assíncrona) | o motor escuta fatos de outros módulos sem que eles o conheçam |
| `canUseTool` → `SessionPermissionGate` | [permission-gate.port.ts](../../backend/src/application/session/ports/permission-gate.port.ts) | por onde passam `AskUserQuestion` e `ExitPlanMode` ([discovery §10.9](../discovery/01-descoberta-claude-agent-sdk.md)) — o encaixe das decisões e das respostas automáticas |
| Passo "uma regra responde sem incomodar ninguém" | [request-permission.use-case.ts](../../backend/src/application/permission/request-permission.use-case.ts) | onde entra "um workflow responde" |
| Regras de permissão | [plano 03](../plans/03-rules-and-audit/README.md), [plano 15](../plans/15-rules-management/README.md) | autorização antecipada dos comandos que o trabalho vai precisar (§9.6) |
| Push com retry e central de notificações | [push-dispatcher.ts](../../backend/src/application/notification/push-dispatcher.ts), [backend/03 §notification](../architecture/backend/03-modules.md#notification) | os avisos de execução e de decisão, no celular e no web |
| Abrir, retomar, observar sessão | `session.start` (com `resumeSessionId`), `session.attach` ([05 §Comandos](../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor)) | uma sessão por lote; reabrir uma conversa estacionada (§10.5); assistir ao vivo à sessão do lote corrente |
| Slash commands no prompt | [05 §Slash commands](../architecture/shared/05-websocket-protocol.md#slash-commands) | ferramentas de SDD costumam se operar por slash commands do projeto; o prompt de um lote pode ser um deles |
| Trilha de auditoria | módulo `audit` | o que foi decidido em nome do usuário, e por quem |
| Jobs periódicos | [infrastructure/jobs/](../../backend/src/infrastructure/jobs/) | agendamento, lembretes de decisão, retenção de execuções |
| Watcher (chokidar) | [chokidar-folder.watcher.ts](../../backend/src/adapter/outbound/filesystem/chokidar-folder.watcher.ts) | recarregar o workflow quando o arquivo muda |
| Lib `yaml` (backend), Monaco (web) | `package.json` de cada ponta | ler e escrever YAML preservando comentários; painel de texto do editor |
| Arquivos sensíveis | [sensitive-files.ts](../../backend/src/domain/files/services/sensitive-files.ts) | o arquivo de workflow entra nessa lista (§15.1) |

### O que o SDK oferece (conferido na `0.3.277`)

- **`AskUserQuestion` é respondida pelo `canUseTool`**: `{ behavior: 'allow', updatedInput: { questions, answers } }`,
  com `answers` no formato *texto da pergunta → rótulo escolhido* (multi-seleção separada por
  vírgula) e `annotations` opcionais (`sdk-tools.d.ts`). São 1 a 4 perguntas, de 2 a 4 opções cada,
  mais o "Outro" livre.
- **`ExitPlanMode`** chega ao `canUseTool` com `{ plan, planFilePath }`.
- **Saída estruturada**: `outputFormat: { type: 'json_schema', schema }` nas opções do `query()`.
  É o que permite ao motor ser agnóstico de formato: a sessão lê a spec do jeito dela e devolve ao
  motor um objeto com forma fixa — o que fez, o que falta, o que precisa de decisão (§9.3).

### Lacunas que o trabalho precisa fechar antes

1. **O veredito só tem `allow`/`deny`** ([PermissionVerdict](../../backend/src/application/session/ports/permission-gate.port.ts)).
   Responder `AskUserQuestion` exige devolver `updatedInput`: muda o port, o bridge e o contrato
   `permission.resolve`.
2. **O humano hoje não consegue responder `AskUserQuestion` pela UI.** O web tem um card para o
   `ExitPlanMode` ([PlanApprovalCard.tsx](../../web/src/features/permission/components/PlanApprovalCard.tsx)),
   mas `AskUserQuestion` cai no pedido genérico de permitir/negar. Como o humano é o *fallback* de
   toda decisão automática, isso é **pré-requisito, nas três pontas** — e é o embrião da caixa de
   decisões (§10.3).
3. **Os fatos da sessão não estão no barramento.** Hoje ele leva `permission.*` e
   `session.fileStateRecorded`; turno concluído, sessão encerrada e ferramenta concluída vão direto
   para o fan-out do WebSocket. O módulo `session` passa a publicar os fatos que servem de gatilho.
4. **O prazo de permissão é curto** (120 s por padrão, com extensões). Serve a quem está na frente
   da tela, não a um trabalho de horas com o dono fora de casa (§10.5).
5. **Não existe canal de email** (§14).

---

## 5. Modelo conceitual

```
 WORKFLOW  (arquivo .yaml, escrito por gente)          EXECUÇÃO  (arquivo .run.yaml, escrito pelo motor)
 ─────────────────────────────────────────────         ────────────────────────────────────────────────
 trigger    quando começa                               qual workflow, qual versão (hash), quem disparou
 inputs     o que se pergunta no disparo                os inputs usados
 autonomy   quem decide o quê                           estado, posição atual, custo, duração
 limits     tetos                                       resumo legível do que aconteceu
 git        branch e commits                            o erro que parou, com diagnóstico e remediações
 steps      passos nomeados, ligados por `next`  ────►  cada passo executado, em ordem: lote, tentativa,
 layout     posição no canvas (opcional)                prompt, sessão, resultado, nota, verificação, erro
                                                        decisões: pergunta, resposta, quem, de onde
                                                        remediações aplicadas: o quê, quem, quando
```

| Termo | Significado |
|---|---|
| **Workflow** | a definição. Um arquivo YAML, um fluxo (§6). |
| **Execução** (*run*) | uma vez que o workflow rodou, disparada por um evento. **Também é um arquivo** (§7). |
| **Modelo** (*template*) | um workflow pronto, parametrizado, disparado por um formulário, sem tocar no YAML (§9.10). |
| **Ativação** | o ato humano de ligar um workflow para uma versão exata do arquivo (hash) (§15.1). |
| **Gatilho** | o fato que inicia uma execução: evento de sessão, pergunta, horário, clique. |
| **Passo** | uma ação com nome. Recebe o contexto, produz uma saída, diz qual o próximo. |
| **Lote** | uma porção de trabalho entregue a uma sessão: um texto opaco para o motor ("fase 1 e 2", "task 3", "o próximo pendente"). Quem sabe o que ele significa é a sessão que lê a spec (§9.2). |
| **Nota de passagem** (*handoff*) | a saída estruturada que toda sessão de lote devolve: o que fez, o que mudou, o que decidiu, **o que falta**, o que precisa de decisão (§9.3). |
| **Verificação** | a execução de um comando de critério (o que o projeto usar: `npm test`, `pytest`, `make check`…), conferida pelo motor (§9.4). |
| **Decisão** | uma pergunta estruturada ao humano, com opções, recomendação e evidência (§10). |
| **Remediação** | uma ação oferecida para sair de um erro: tentar de novo, orientar, retomar de um ponto, pular… (§11.3). |
| **Perfil de autonomia** | quem decide o quê: o agente, uma sessão revisora ou o humano (§9.7). |
| **Pré-voo** | a checagem antes de começar, que antecipa decisões para o trabalho rodar sem interrupção (§9.6). |
| **Respondedor** | uma sessão usada para responder perguntas de outra sessão (§13.3). |

---

## 6. O formato do workflow

### 6.1 Exemplo simples (UC-06)

```yaml
# Revisão automática: quando a sessão de implementação disser que terminou,
# uma segunda sessão revisa o diff antes de eu olhar.
format: remote-claude/workflow@1
name: Revisão automática depois de implementar

trigger:
  on: session.turnCompleted
  where:
    workspace: ~/projects/meu-app
    session.origin: human            # não reage a sessões abertas por workflow
    lastMessage: { contains: "implementação concluída" }

limits:
  maxRunsPerHour: 10
  timeout: 30m
  concurrency: skip

steps:
  review:
    action: session.start
    workspace: "{{ trigger.session.workspace }}"
    permissions: rules-only
    prompt: |
      Revise as mudanças da sessão "{{ trigger.session.title }}" com `git diff`.
    output:
      schema:
        verdict: { enum: [approved, changes-requested] }
        issues:  { type: list, of: text }
    closeAfter: true
    next:
      - when: { steps.review.output.verdict: { equals: approved } }
        goto: notify-ok
      - goto: send-back

  send-back:
    action: session.prompt
    session: "{{ trigger.session.id }}"
    prompt: |
      O revisor pediu mudanças:
      <<<
      {{ steps.review.output.issues | bullets }}
      >>>
    next: end

  notify-ok:
    action: notify
    severity: success
    message: "{{ trigger.session.title }} aprovada pelo revisor"
```

Os exemplos de trabalho encadeado estão no §9.8 e no §9.9.

### 6.2 Regras de legibilidade

- **Os ids dos passos são nomes** escolhidos por quem escreve (`review`, `send-back`), nunca UUID.
  São os mesmos nomes que aparecem no arquivo da execução (§7), e é isso que permite ler os dois
  lado a lado.
- **As arestas moram dentro do passo**, em `next`, não numa lista separada de nós e arestas.
- **O primeiro passo da lista é o de entrada.**
- **`next` omitido** = o passo seguinte da lista; `next: end` encerra com sucesso;
  `next: { fail: "motivo" }` encerra com falha.
- **Duração legível** (`30s`, `5m`, `2h`); **caminho com `~`** é expandido.
- **Comentários são bem-vindos** e sobrevivem a qualquer edição pelo canvas.
- **O bloco `layout` vai sempre no fim**, é opcional e o motor o ignora.
- **`format` é obrigatório desde o primeiro dia** (`remote-claude/workflow@1`): o formato vai mudar,
  e um arquivo antigo precisa ser reconhecido como antigo, não como inválido.

### 6.3 Campos de topo

| Campo | Obrigatório | Descrição |
|---|---|---|
| `format` | sim | `remote-claude/workflow@1`. |
| `name` | sim | nome legível. Texto do usuário — não passa por i18n. |
| `description` | não | uma frase. |
| `trigger` | sim | um gatilho (§6.4). |
| `inputs` | não | parâmetros do disparo manual: `{ nome: { type, label, default?, options?, example? } }`. O formulário de disparo é gerado daqui. |
| `autonomy` | não | perfil de autonomia (§9.7). Padrão `balanced`. |
| `limits` | não | tetos (§6.9). |
| `git` | não | branch e commits da execução (§9.8). |
| `verify` | não | o comando de verificação padrão dos lotes (§9.4). |
| `notifyOn` | não | o que gera aviso (§10.4). |
| `runs` | não | onde e por quanto tempo os arquivos de execução ficam (§7.5). |
| `steps` | sim | mapa ordenado de passos (§6.5). |
| `layout` | não | posições no canvas. |

### 6.4 Catálogo de gatilhos

Nomes no padrão dos eventos de domínio: `<módulo>.<fato no passado>`.

| `on` | Quando | O que entra em `trigger.*` |
|---|---|---|
| `manual` | um clique na UI (web ou app), com o formulário dos `inputs` | `inputs`, `startedBy`, `from` |
| `session.started` | uma sessão abriu | `session` (id, workspace, title, model, origin) |
| `session.turnCompleted` | um turno terminou | `session`, `turn` (usage, costUsd, durationMs), `lastMessage` |
| `session.closed` | a sessão encerrou | `session`, `reason` |
| `session.questionAsked` | o Claude chamou `AskUserQuestion` | `session`, `questions[]` — **a execução pode respondê-la** |
| `session.planProposed` | o Claude chamou `ExitPlanMode` | `session`, `plan` — **a execução pode aprová-lo ou rejeitá-lo** |
| `permission.requested` | pedido de permissão de ferramenta | `session`, `toolName`, `riskHint` — **só avisa, nunca responde** (§12) |
| `tool.completed` | uma ferramenta terminou | `session`, `toolName`, `status` |
| `files.changed` | arquivo alterado numa pasta assistida | `workspace`, `changes[]` |
| `workflow.runFinished` | outro workflow terminou | `workflow`, `run` |
| `schedule` | um horário (`cron`, `timezone`) | `firedAt` |

`where` filtra com a linguagem de condições (§6.7). Atalhos: `workspace` (a pasta e as subpastas),
`session.origin` (`human`·`workflow`·`any`, padrão `human` — §15.3) e `toolName`.

### 6.5 Catálogo de ações

Todo passo tem `action`, e opcionalmente `next`, `timeout`, `maxVisits` (padrão 1),
`onError` (`fail`·`continue`·`goto: <passo>`, padrão `fail`), `onExhausted` (quando `maxVisits`
estoura; padrão `fail`) e `notes` (um texto livre para quem lê o arquivo, que aparece no canvas e
no arquivo da execução).

#### Sessões

| `action` | Campos | Saída |
|---|---|---|
| `session.start` | `workspace`, `prompt`, `model?`, `effort?`, `permissions` (§12), `output.schema?` ou `output: handoff`, `waitFor` (`turn`·`close`·`none`), `closeAfter`, `resume?` | `sessionId`, `claudeSessionId`, `text`, `structured`, `costUsd` |
| `session.prompt` | `session`, `prompt`, `waitFor` | `text`, `structured`, `costUsd` |
| `session.interrupt` · `session.close` | `session` | — |

#### Trabalho encadeado (§9)

| `action` | Campos | Saída |
|---|---|---|
| `preflight` | `checks[]`, `commands[]`, `review?` (uma sessão lê o material e aponta ambiguidades antes de começar) | `ready`, `findings[]` |
| `foreach` | `items` (lista do YAML, dos `inputs` ou da saída de um passo), `as`, `steps` (sub-fluxo), `onItemFailure` (`escalate`·`skip`·`stop`) | `results[]` por item |
| `repeat` | `steps` (sub-fluxo), `until` (condição), `maxIterations` | `iterations`, `results[]` |
| `verify` | `command` (padrão: o `verify` do topo), `timeout` | `passed`, `exitCode`, `summary`, `log` |
| `diagnose` | `error` (padrão: o último) — uma sessão curta, só leitura, que explica o erro e sugere a remediação (§11.3) | `probableCause`, `suggestedRemediation`, `guidance` |

#### Humano e respostas (§10, §13)

| `action` | Campos | Saída |
|---|---|---|
| `decision.request` | `title`, `context`, `questions[]` (§10.2), `recommendation?`, `evidence[]`, `blocks` (`item`·`run`), `deadline?`, `onDeadline` | `answers`, `by`, `from` (`web`·`mobile`), `note` |
| `question.answer` | só sob `session.questionAsked`: `answers`, `from` ou `responder` | `answers`, `answeredBy` |
| `plan.decide` | só sob `session.planProposed`: `decision`+`reason`, `from` ou `responder` | `decision`, `reason` |

#### Avisos e saídas

| `action` | Campos | Saída |
|---|---|---|
| `notify` | `message`, `severity`, `channels` (`center`·`push`) | `delivered` |
| `email.send` | `to` (só verificados — §14), `subject`, `body`, `includeContent?` | `messageId` |
| `webhook.call` | `url` (allowlist), `method`, `body` | `status` |
| `wait` | `for` (duração) ou `until` (condição, com timeout) | — |
| `workflow.run` | `workflow`, `inputs` — sub-rotina; conta na profundidade | as saídas da execução filha |

`foreach` e `repeat` são **sequenciais** na v1. Paralelismo fica para depois (D-10). Laços de
correção (implementar → verificar → corrigir → verificar) se escrevem com `goto` para trás e
`maxVisits`, e o `onExhausted` diz o que acontece quando as tentativas acabam.

### 6.6 Templates

Interpolação `{{ expressão }}`, sem lógica:

- caminhos: `trigger.*`, `inputs.*`, `steps.<id>.output.*`, `item` e `item.index` (dentro de
  `foreach`), `iteration` (dentro de `repeat`), `run.id`, `run.handoffs`, `workflow.name`, `now`;
- filtros fechados: `bullets`, `json`, `truncate(n)`, `lower`, `upper`, `default("x")`,
  `date("…")`, `summaries` (de uma lista de notas de passagem, só os resumos), `last`;
- caminho inexistente é **erro de validação** quando é detectável no arquivo e **erro do passo**
  em execução — nunca string vazia silenciosa;
- nada de `if`, laço ou função. Precisou de lógica, é um passo com `next` e `when`.

Texto vindo de outra sessão entra **delimitado** (`<<< … >>>`) e rotulado como dado (§15.2).

### 6.7 Condições

Usadas em `trigger.where`, `next[].when` e `repeat.until`: mapa *caminho → operador*, com `all`,
`any` e `not`.

```yaml
when:
  any:
    - { steps.check.output.passed: { equals: true } }
    - all:
        - { trigger.reason: { in: [completed, idleTimeout] } }
        - { trigger.turn.costUsd: { lessThan: 1.5 } }
        - not: { lastMessage: { contains: "erro" } }
```

Operadores: `equals`, `notEquals`, `in`, `contains`, `startsWith`, `matches`, `exists`, `isEmpty`,
`lessThan`, `greaterThan`. O primeiro `when` verdadeiro, na ordem do arquivo, decide; um `next` sem
`when` é o "senão" e só pode ser o último. `matches` depende da D-09.

### 6.8 Saída estruturada

`output.schema` descreve num dialeto curto (`text`, `number`, `boolean`, `enum`, `list`, `object`)
o que o passo tem de devolver. O backend converte em JSON Schema e passa ao SDK como
`outputFormat`. Saída que não valida falha o passo. `output: handoff` é o atalho para o schema da
nota de passagem (§9.3).

### 6.9 Limites

| Campo | Padrão | Teto da instalação |
|---|---|---|
| `maxDepth` (cadeia de execuções) | 3 | 5 |
| `maxRunsPerHour` | 10 | 60 |
| `timeout` (da execução) | 30m; **12h** nos modelos de trabalho | 48h |
| `maxCostUsd` (soma das sessões) | 2.00; **definido no disparo** nos modelos de trabalho | configurável |
| `maxSessions` (abertas pela execução) | 10 | 200 |
| `maxIterations` (de um `repeat`) | 10 | 50 |
| `concurrency` | `skip` | `skip`·`queue`·`parallel` |
| `maxVisits` (por passo) | 1 | 10 |

Estourar um teto **não apaga trabalho**: a execução para no ponto seguro seguinte (§11.2), fica
`failed` com o erro `limitExceeded`, e a remediação oferece continuar com um teto maior. **O teto
da instalação vale mesmo que o arquivo peça mais.** Ao atingir 80 % do custo, um aviso.

### 6.10 Esquema e validação

**Um JSON Schema por formato** — o do workflow e o da execução —, gerados de uma fonte só (como o
contrato do WebSocket). O do workflow valida no backend (`400` com `details[]`), no Monaco (sublinha
a linha) e no canvas (marca o nó). Mais uma **validação semântica** no backend: `goto` para passo
inexistente, passo inalcançável, ação incompatível com o gatilho, template que referencia passo que
não roda antes, ciclo sem `maxVisits`, `repeat` sem `until`, teto acima do da instalação,
`email.send` sem email configurado.

---

## 7. O formato da execução

Cada execução é **um arquivo** — `<workflow>/<data>-<hora>-<id>.run.yaml` (§7.5) —, escrito pelo
motor a cada transição, e lido pela ferramenta para desenhar o acompanhamento. É o registro do que
aconteceu, para ser lido por gente: agora, enquanto roda, e daqui a três meses.

### 7.1 Exemplo (UC-01, terminada com erro e remediada)

```yaml
# ───────────────────────────────────────────────────────────────────────────
# Execução de "Implementar spec em lotes"
# Disparada por Ricardo, pelo celular, em 03/10/2026 14:02.
# Lotes 1 e 2 concluídos. O lote 3 falhou na verificação; remediado com uma
# orientação às 16:05, concluído às 16:31. Lote 4 concluído. Sucesso.
#
# Este arquivo é escrito pelo remote-claude. Não o edite: a ferramenta não
# relê mudanças feitas à mão, e a próxima transição as sobrescreveria.
# ───────────────────────────────────────────────────────────────────────────
format: remote-claude/run@1
id: run_7Kq2
workflow:
  name: Implementar spec em lotes
  file: .remote-claude/workflows/implementar-spec.yaml
  version: sha256:3f9a1c…            # a versão exata que rodou
trigger:
  on: manual
  by: Ricardo
  from: mobile
  at: 2026-10-03T14:02:11-03:00
inputs:
  spec: specs/001-anexos/
  batches: ["fase 1 e 2", "fase 3 e 4", "fase 5", "fase 6"]
  budget: 30
autonomy: balanced
git: { branch: workflow/implementar-spec-7Kq2, commits: 4 }

status: succeeded                    # queued · running · waiting · paused · succeeded · failed · stopped · interrupted
position: null                       # enquanto roda: { step: implement, item: 3, attempt: 2, since: … }
started: 2026-10-03T14:02:11-03:00
finished: 2026-10-03T17:10:48-03:00
duration: 3h08m
cost: { usd: 21.40, budget: 30 }
sessions: 9
counts: { items: 4, done: 4, skipped: 0, failed: 0, decisions: 2, remediations: 1 }

summary: |
  Os quatro lotes da spec 001-anexos foram implementados e verificados (npm test).
  O lote 3 ("fase 5") falhou três vezes no teste de compressão; o diagnóstico
  apontou que a implementação gerava JPEG e a spec pede WebP. Com a orientação
  "use WebP, como a spec pede em 3.2", passou na tentativa seguinte.

steps:                               # cada passo executado, NA ORDEM em que rodou
  - step: preflight
    status: succeeded
    at: 14:02:12 → 14:03:40 (1m28s)
    result: |
      Árvore de trabalho limpa. Branch workflow/implementar-spec-7Kq2 criado.
      `npm test` já autorizado por regra do projeto.
      A revisão da spec levantou 1 ambiguidade → decisão d1.

  - step: implement
    item: { index: 1, value: "fase 1 e 2" }
    attempt: 1
    status: succeeded
    at: 14:09:02 → 14:41:30 (32m28s)
    cost: 4.10
    session: { id: ses_a1, conversation: 6e0c…, title: "Implementar fase 1 e 2" }
    prompt: |
      Implemente a fase 1 e 2 de specs/001-anexos/, e só elas.
    handoff:
      summary: Upload de anexos e validação de tipo, com testes.
      filesChanged: [src/upload/upload.ts, src/upload/upload.test.ts, …]
      decisionsTaken: ["limite de 5 anexos por mensagem, como a spec sugere"]
      remaining: ["fase 3 e 4", "fase 5", "fase 6"]

  - step: check
    item: { index: 1, value: "fase 1 e 2" }
    status: succeeded
    at: 14:41:31 → 14:43:02 (1m31s)
    verification: { command: npm test, exitCode: 0, summary: "112 testes, 0 falhas" }
    commit: 9b1e2d4 "fase 1 e 2 de 001-anexos"

  # … lote 2 …

  - step: implement
    item: { index: 3, value: "fase 5" }
    attempt: 1
    status: succeeded
    # …

  - step: check
    item: { index: 3, value: "fase 5" }
    visit: 1
    status: failed
    at: 15:20:10 → 15:21:44
    verification:
      command: npm test
      exitCode: 1
      summary: |
        FAIL src/upload/compress.test.ts
          ✕ comprime imagem acima de 2 MB para WebP
      log: run_7Kq2/check-3-1.log

  - step: fix
    item: { index: 3, value: "fase 5" }
    visit: 1
    status: succeeded
    # … mais duas correções e duas verificações que falharam …

  - step: ask-human
    item: { index: 3, value: "fase 5" }
    status: succeeded
    at: 15:58:00 → 16:05:12 (7m12s, esperando você)
    error:
      kind: verificationFailed
      message: "npm test saiu com código 1 em 3 tentativas seguidas"
      details: |
        FAIL src/upload/compress.test.ts
          ✕ comprime imagem acima de 2 MB para WebP
          Expected: "image/webp"   Received: "image/jpeg"
      log: run_7Kq2/check-3-3.log
      diagnosis:
        probableCause: A compressão usa o encoder JPEG padrão; a spec (3.2) pede WebP.
        confidence: high
        suggestedRemediation: retryWithGuidance
        guidance: "Use WebP, como a spec pede em 3.2."
      remediations:                  # o que foi oferecido
        - retryWithGuidance
        - resumeFrom
        - skipItem
        - takeOver
        - stop
    decision: d2

  - step: fix
    item: { index: 3, value: "fase 5" }
    visit: 4
    status: succeeded
    guidance: "Use WebP, como a spec pede em 3.2."   # veio da remediação
    # …

decisions:
  - id: d1
    step: preflight
    question: "A spec não diz o tamanho máximo do anexo. Qual usar?"
    options: ["5 MB", "10 MB", "25 MB"]
    recommended: { option: "10 MB", why: "o SDK aceita até 10 MB por imagem" }
    answer: "10 MB"
    by: Ricardo
    from: mobile
    at: 14:08:40 (5m depois da pergunta)

  - id: d2
    step: ask-human
    item: 3
    question: "Lote 3 não passa na verificação depois de 3 tentativas. O que fazer?"
    answer: retryWithGuidance
    note: "Use WebP, como a spec pede em 3.2."
    by: Ricardo
    from: web
    at: 16:05:12

remediations:
  - at: 16:05:12
    error: { step: check, item: 3 }
    action: retryWithGuidance
    by: Ricardo
    from: web
    outcome: succeeded               # a verificação seguinte passou
```

### 7.2 Regras do formato

- **Os nomes de passo são os do workflow.** Quem abre os dois lado a lado acha cada passo
  executado no lugar onde ele foi escrito.
- **`steps` é cronológico**, uma entrada por execução de passo — com `item` dentro de um `foreach`
  ou `repeat`, `attempt`/`visit` quando o passo rodou mais de uma vez. Ler de cima para baixo é ler
  a história.
- **O cabeçalho em comentário é um resumo em português** (ou no idioma do usuário), regenerado a
  cada transição: quem abre o arquivo entende o essencial nas primeiras linhas, sem rolar.
- **`status` e `position` sempre no topo**: enquanto roda, o arquivo diz onde o fluxo está.
- **Todo erro tem a mesma forma** (`kind`, `message`, `details`, `log`, `diagnosis`,
  `remediations`), em qualquer passo (§11.3).
- **Horários legíveis** (`14:09:02 → 14:41:30 (32m28s)`) no corpo; o instante completo, com fuso,
  no topo. O schema aceita os dois e a ferramenta mostra no fuso de quem olha.
- **O que é grande vai para arquivo ao lado**: logs de verificação e de diagnóstico ficam em
  `<id>/…log`, referenciados por caminho relativo, com limite de tamanho por arquivo. O arquivo da
  execução continua legível mesmo quando o `npm test` cuspiu 20 mil linhas.
- **O que não entra**: a conversa inteira das sessões (fica no store do Claude, referenciada por
  `session.conversation`, e abre no painel), tokens, credenciais e conteúdo de arquivos.
- **`format: remote-claude/run@1`**, versionado como o do workflow.

### 7.3 Quem escreve, e quando

- **Só o motor escreve.** A cada transição de execução, passo, decisão ou remediação, ele regrava o
  arquivo de forma atômica (escreve num temporário e renomeia), depois de registrar a transição no
  banco (§17). Uma leitura no meio de uma escrita nunca vê meio arquivo.
- **O arquivo não é relido pelo motor como entrada.** Editá-lo à mão não muda nada na execução, e
  o cabeçalho diz isso. Se o motor encontra o arquivo diferente do que escreveu por último (hash),
  registra um `warn`, guarda a versão alterada ao lado (`.edited`) e segue.
- **Em execução, o banco coordena; o arquivo registra.** Concorrência, idempotência, espera e
  decisões abertas precisam de transação, e isso é banco. O arquivo é a projeção legível, escrita
  logo depois. **Terminada a execução, o arquivo é o registro completo**, e o banco guarda só o
  índice para listar e buscar (§17). Um índice perdido se reconstrói lendo os arquivos.

### 7.4 Como a ferramenta usa o arquivo

O arquivo da execução é a mesma coisa que a tela mostra, em outra forma:

- o **painel da execução** (§11.1) é o arquivo renderizado;
- o **desenho do workflow com o estado de cada nó** (§16.4) cruza o arquivo do workflow com o da
  execução pelos nomes de passo;
- **"abrir como texto"** abre o `.run.yaml` no editor de arquivos que já existe, somente leitura;
- **exportar** gera um Markdown do mesmo conteúdo (cabeçalho, resumo, linha do tempo, erros,
  decisões) para colar num PR, numa issue, num email — a ação `email.send` com o resumo final usa
  essa mesma renderização.

### 7.5 Onde fica, e por quanto tempo

| Campo (`runs:` no workflow) | Valores | Padrão |
|---|---|---|
| `runs.location` | `project` (`.remote-claude/runs/<workflow>/`) · `user` (pasta de dados do usuário) | `project`, ao lado do workflow (D-30) |
| `runs.keep` | quantas execuções guardar por workflow, ou por quantos dias | 50 execuções |
| `runs.commit` | `false` · `true` — versionar as execuções no git | `false`: a ferramenta cria um `.gitignore` em `.remote-claude/runs/` |

O arquivo contém prompts, resumos e saídas de comando — conteúdo do projeto. Por isso o padrão
**não** versiona as execuções: quem quiser o histórico no git liga `runs.commit` sabendo o que
entra. A retenção é um job, como as outras da instalação, e apaga o arquivo e a pasta de logs
juntos.

---

## 8. O motor de execução

### 8.1 Onde mora

Um **módulo novo `workflow`** no backend, no padrão dos outros (domain ← application ← adapter):

```
   session ──(barramento)──► workflow ──porta──► session       (abrir, retomar, prompt, interromper)
permission ──porta─────────► workflow ──porta──► notification  (push, central)
     audit ◄────────────────  workflow ──porta──► mail          (email, porta nova)
                                       ──porta──► command       (verificação, §9.4)
                                       ──porta──► run-record    (o arquivo da execução, §7)
```

- `workflow` **escuta** o barramento e **chama** os outros por portas em
  `application/workflow/ports/`.
- `session` **não importa** `workflow`. Publica fatos.
- `permission` declara uma porta `QuestionResponder` que `workflow` implementa num adapter, e
  `workflow` nunca chama `permission` de volta — devolve a resposta pelo retorno da porta. É o que
  evita o ciclo `permission → workflow → session → permission`.
- **A escrita do arquivo da execução é uma porta** (`RunRecordWriter`), com um adapter de sistema de
  arquivos. O domínio monta o registro; o adapter o serializa em YAML e grava.
- As regras novas entram no `dependency-cruiser` na mesma mudança.

### 8.2 Do evento à execução

1. `session` publica no barramento os fatos-gatilho, com payload **do domínio**, não o evento WS.
2. O motor mantém um índice dos workflows **ativos** por tipo de gatilho e casa o `where`.
3. Para cada workflow que casou: aplica `concurrency` e `maxRunsPerHour`, calcula a profundidade da
   cadeia e cria a execução em `queued`, **na mesma transação** que grava a chave de idempotência
   `(workflowId, eventId)`; em seguida, o primeiro arquivo da execução.
4. Um executor tira a execução da fila, roda passo a passo e **grava cada transição antes de agir**
   — no banco, depois no arquivo.

### 8.3 Estados

```
execução:  queued ──► running ─────────┬──► succeeded
                       │  ▲  │  ▲      ├──► failed  ──(remediação)──► running
                       │  │  │  │      ├──► stopped       (humano parou — o feito fica)
                       ▼  │  ▼  │      └──► interrupted   (o backend caiu no meio — §8.5)
                   waiting  paused
             (sessão, decisão,  (humano pausou)
              tempo)

lote:      pending ──► running ──► verifying ──┬──► done
                         ▲            │        ├──► skipped     (decisão humana)
                         └── fixing ◄─┘        ├──► blocked     (esperando decisão)
                                               └──► failed

passo:     pending ──► running ──► waiting ──► succeeded | failed | skipped | cancelled
```

**`failed` não é o fim obrigatório**: uma remediação (§11.3) leva a execução de volta a `running`,
**no mesmo arquivo**. A história de um erro e de como ele foi resolvido fica num lugar só, que é o
que se quer ler depois (UC-05).

`waiting` não ocupa thread: a execução vira um registro de "o que eu espero", e o evento esperado a
acorda.

### 8.4 Concorrência e idempotência

- `concurrency: skip` → uma execução por vez por workflow; `queue` → fila.
- O mesmo evento reentregue não cria segunda execução (`(workflowId, eventId)`).
- Humano e workflow respondendo a mesma pergunta → vale a primeira resposta que chega ao
  `PermissionRegistry`, como hoje entre dois clientes.
- **Duas execuções de trabalho na mesma pasta** brigariam pelo mesmo working tree: o motor recusa a
  segunda, ou a põe em fila, a menos que use worktree própria (§9.8).
- Sessões abertas por workflow contam no limite de sessões da instalação.

### 8.5 Reinício do backend

As sessões morrem com o processo, **as conversas não**: ficam no store do Claude. No boot:

- execuções esperando tempo, decisão ou agendamento **retomam** — o que esperam está no banco;
- a execução cuja sessão morreu fica `interrupted`, com o erro `interrupted` e as remediações
  **retomar a conversa** (reabre com `resumeSessionId` e o prompt "o processo foi reiniciado;
  confira o estado e continue"), **refazer o lote do zero** ou **parar**. Com perfil `autonomous`,
  retoma sozinha uma vez.

### 8.6 Custo

Cada passo que usa sessão soma o `costUsd` dos turnos dela na execução e no lote. Passar de
`maxCostUsd` interrompe a sessão em andamento e para a execução no estado em que está. O total
alimenta o [plano 16 — uso e custo](../plans/16-usage-and-cost/README.md).

---

## 9. Trabalho encadeado

O caso central (UC-01 a UC-04): levar um trabalho até o fim em lotes, uma sessão por lote, com o
mínimo de interrupções e todas elas estruturadas.

### 9.1 O fluxo

```
 disparo (formulário: spec, lotes, verificação, autonomia, orçamento)
    │
    ▼
 PRÉ-VOO ── regras faltando? árvore suja? ambiguidades na spec? ──► decisões ANTECIPADAS (§9.6)
    │
    ▼
 ┌─ para cada lote (lista dada) — ou até não faltar nada (repeat) ──────────────────────┐
 │                                                                                       │
 │   SESSÃO NOVA recebe o prompt do lote  ◄── resumos das notas dos lotes anteriores     │
 │      │  (perguntas e planos dela → perfil de autonomia → decisão, se preciso)         │
 │      ▼                                                                                │
 │   NOTA DE PASSAGEM (estruturada: o que fez, o que falta, o que precisa de decisão)    │
 │      │                                                                                │
 │      ▼                                                                                │
 │   VERIFICA (o comando do projeto) ── passou ──► commit (se configurado) ──► aviso     │
 │      │                                                         ──► próximo lote       │
 │      └─ falhou ──► SESSÃO DE CORREÇÃO (com a saída da falha) ──► verifica             │
 │                       │                                                               │
 │                       └─ 3 tentativas ──► DIAGNÓSTICO ──► DECISÃO com remediações     │
 └───────────────────────────────────────────────────────────────────────────────────────┘
    │
    ▼
 VERIFICAÇÃO FINAL (opcional, outro comando) ──► RESUMO no arquivo da execução ──► aviso (+ email)
```

### 9.2 O motor não conhece o formato do trabalho

O motor nunca abre a spec. O que ele sabe de um lote é **um texto** — "fase 1 e 2", "task 3",
"US-04", "o próximo pendente" — que entra num template de prompt. Quem sabe o que "fase 1 e 2"
significa é a sessão, que lê a spec, o plano ou a lista do jeito que o projeto escreveu, com as
instruções que o projeto já dá ao Claude (`CLAUDE.md`, `AGENTS.md`, slash commands do projeto).

Isso dá três maneiras de dizer quais são os lotes, todas sem o motor interpretar nada:

| Maneira | Como | Quando usar |
|---|---|---|
| **Lista explícita** (`foreach`) | os lotes vêm escritos no YAML ou no formulário de disparo: `["fase 1 e 2", "fase 3 e 4", "fase 5"]` | o usuário sabe como quer fatiar (UC-01) |
| **Até concluir** (`repeat`) | o prompt pede "o próximo lote pendente, de N fases/tasks"; a nota de passagem diz o que falta (`remaining`); o workflow repete até `remaining` ficar vazio, ou até `maxIterations` | o usuário quer que o Claude conduza o fatiamento (UC-02) |
| **Planejador** | uma sessão planejadora lê o material e devolve a lista de lotes em saída estruturada; a lista vira uma **decisão de aprovação** (editar, tirar, reordenar, aprovar) antes de qualquer execução; segue como lista explícita | work items, ou quando o fatiamento precisa de julgamento (UC-03) |

O material pode ser qualquer coisa que a sessão saiba ler: uma pasta de spec de uma ferramenta de
SDD, um plano em Markdown, um checklist, um arquivo de requisitos, ou um item de um rastreador lido
pelo MCP que a instalação do Claude já tiver configurado. Integração nativa com rastreadores fica
fora (§23).

### 9.3 Uma sessão por lote, e a nota de passagem

**Cada lote roda numa sessão nova** (D-20). Contexto limpo por lote é o que mantém a qualidade num
trabalho longo, e é o que torna cada lote auditável sozinho, retomável sozinho e assistível ao vivo.

A memória entre sessões tem duas partes:

1. **o repositório** — o código, a spec, as marcas de progresso que o formato do projeto tiver. É a
   memória de verdade; a sessão a atualiza seguindo as instruções do projeto, como faria um humano.
   O motor não toca nela;
2. **a nota de passagem** — a saída estruturada (`output: handoff`) que toda sessão de lote devolve,
   com **forma fixa**, independente do formato do trabalho:

```yaml
status: done | partial | blocked
summary: "Upload de anexos e validação de tipo, com testes."
filesChanged: [src/upload/upload.ts, …]
decisionsTaken:                       # decisões que a sessão tomou sozinha, para o humano rever
  - "limite de 5 anexos por mensagem, como a spec sugere"
remaining: ["fase 3 e 4", "fase 5"]   # o que falta, no vocabulário da própria spec — usado pelo `repeat`
openIssues: ["teste de arrastar ainda instável"]
needsDecision:                        # vira decisão estruturada (§10.1)
  - question: "Comprimir imagens acima de 2 MB no cliente?"
    options: [{ label: Sim, description: … }, { label: Não, description: … }]
    recommended: Sim
    why: "…"
```

A próxima sessão recebe no prompt os **resumos** das notas anteriores (filtro `summaries`), não a
conversa delas. A nota inteira vai para o arquivo da execução (§7), onde é também o relatório de
progresso que o humano lê.

### 9.4 Verificação pela evidência — `verify`

O critério de um lote é **um comando do projeto**, escrito no workflow (`verify: npm test`) ou no
formulário de disparo — o motor não sabe nem precisa saber que portões o projeto tem. Ele:

1. roda o comando por uma porta `CommandRunner`, **só se uma regra de permissão concedida pelo
   humano o autoriza** (o pré-voo propõe essa regra — §9.6). Comando sem regra não roda: vira uma
   decisão ("autorizar `npm test` neste projeto durante a execução?");
2. lê o **código de saída** — é ele que decide `passed`, não o texto;
3. guarda o log inteiro ao lado do arquivo da execução e um `summary` com as últimas linhas
   relevantes (as linhas de falha, quando o formato do runner de teste é reconhecível; as últimas N
   linhas, senão).

Um lote sem `verify` é aceito pela nota de passagem (`status: done`), e o arquivo da execução diz
isso com todas as letras: "não verificado". É escolha do usuário, nunca o padrão dos modelos.

A alternativa de uma sessão rodar o comando e o motor conferir na trilha (D-21) fica registrada; a
recomendação é o motor, porque é determinística e não gasta tokens.

### 9.5 Correção e escalonamento

- Falhou a verificação → **sessão de correção**, nova, com a saída da falha e a nota do lote.
- Até `maxVisits` tentativas (padrão **3**).
- **Sem progresso** também conta: duas falhas seguidas com a mesma saída escalam antes da terceira.
- Esgotou → **diagnóstico** (§11.3) e uma **decisão com as remediações**: orientar e tentar de novo,
  retomar de outro ponto, pular o lote, assumir na sessão, parar.

### 9.6 Pré-voo — antecipar as decisões

A maior inimiga da autonomia é a decisão que aparece às 3h da manhã no lote 7. O pré-voo procura
antes o que vai travar e transforma tudo numa **única rodada de decisões** no começo:

| Checagem | O que encontra | Vira |
|---|---|---|
| `rulesForCommands` | o comando de verificação e os `commands` declarados sem regra que os autorize | uma decisão: autorizar durante a execução · sempre neste projeto · não |
| `workspaceClean` | árvore de trabalho com mudanças não commitadas | continuar assim · usar worktree · cancelar |
| `branch` | o branch da execução já existe | reusar · criar com sufixo · cancelar |
| `budget` | estimativa grosseira (lotes × custo médio por lote do histórico do workflow) acima do orçamento | aumentar · seguir · cancelar |
| `sessionsAvailable` | vagas de sessão da instalação | aviso |
| `review` (opcional) | uma sessão curta, só leitura, lê o material (a spec) e aponta **ambiguidades e decisões em aberto** que travariam a implementação, em saída estruturada | uma decisão por ambiguidade, com as opções e a recomendação da própria sessão |

O `review` é a versão agnóstica de "ler as decisões em aberto do plano": em vez de o motor saber
onde um formato guarda as decisões, uma sessão lê o material e pergunta. As respostas entram no
prompt de todos os lotes ("decisões tomadas antes de começar: …") e no arquivo da execução.

### 9.7 Perfis de autonomia

Quem decide cada tipo de coisa. Escolhido no disparo; cada linha pode ser sobrescrita no YAML
(`autonomy: { profile: balanced, plans: human }`).

| O quê | `supervised` | `balanced` (padrão) | `autonomous` |
|---|---|---|---|
| Lista de lotes do planejador | humano aprova | humano aprova | humano aprova |
| `AskUserQuestion` das sessões | humano | respondedor; humano se ele não souber | respondedor; humano se ele não souber |
| `ExitPlanMode` das sessões | humano | sessão revisora; humano se ela recusar duas vezes | sessão revisora |
| `needsDecision` das notas | humano | humano, **sem parar a execução** se o lote seguinte não depende (D-27) | respondedor com a recomendação; humano se ele discordar |
| Verificação falhou | humano na hora | 3 correções, diagnóstico, humano | 3 correções, diagnóstico, **uma** nova tentativa com a orientação do diagnóstico, humano |
| Permissão de ferramenta fora das regras | humano | humano | humano — **nunca automático** (§12) |
| Retomar após reinício do backend | humano | humano | automático, uma vez |
| Limite de custo atingido | humano | humano | humano |

As linhas que **nunca saem do humano** — permissão de ferramenta, aprovar a lista de lotes de um
planejador, estourar o orçamento — são deliberadas: são onde um erro custa dinheiro ou executa algo
que ninguém pediu.

### 9.8 Git, e exemplo — lotes explícitos (UC-01)

| Campo | Valores | Padrão |
|---|---|---|
| `git.branch` | template do nome | `workflow/<nome-do-workflow>-<id curto>` |
| `git.worktree` | a execução trabalha numa worktree própria, e a pasta do usuário fica intocada | `false` (D-22) |
| `git.commit` | `perItem` · `atEnd` · `never` | `perItem` |
| `git.push` | — | **nunca**: push, PR e merge são do humano, a partir do resumo |

Commit por lote, com o lote na mensagem, dá ao humano um desfazer por lote e um histórico legível.
Ativar um workflow com `commit` é o consentimento explícito para ele commitar.

```yaml
format: remote-claude/workflow@1
name: Implementar spec em lotes
description: Uma sessão por lote, verificação pelo comando do projeto, decisões só quando preciso.

trigger:
  on: manual

inputs:
  spec:    { type: path, label: Spec ou plano, example: specs/001-anexos/ }
  batches: { type: list, label: Lotes, example: ["fase 1 e 2", "fase 3 e 4"] }
  verify:  { type: text, label: Comando de verificação, default: npm test }
  budget:  { type: number, label: Orçamento em US$, default: 30 }

autonomy: balanced
verify: "{{ inputs.verify }}"
limits: { timeout: 12h, maxCostUsd: "{{ inputs.budget }}", maxSessions: 60 }
git: { commit: perItem }
notifyOn: [itemDone, itemFailed, decision, budget80, runFinished]

steps:
  preflight:
    action: preflight
    checks: [rulesForCommands, workspaceClean, branch, budget, review]

  each-batch:
    action: foreach
    items: "{{ inputs.batches }}"
    as: batch
    onItemFailure: escalate
    steps:
      implement:
        action: session.start
        permissions: rules-then-human
        prompt: |
          Implemente {{ batch }} de {{ inputs.spec }}, e só isso.
          Decisões tomadas antes de começar:
          <<<
          {{ steps.preflight.output.decisions | bullets }}
          >>>
          O que os lotes anteriores deixaram:
          <<<
          {{ run.handoffs | summaries | bullets }}
          >>>
        output: handoff
        closeAfter: true

      check:
        action: verify
        next:
          - when: { steps.check.output.passed: { equals: true } }
            goto: end-of-batch
          - goto: fix

      fix:
        action: session.start
        permissions: rules-then-human
        maxVisits: 3
        onExhausted: { goto: diagnose }
        prompt: |
          A verificação de "{{ batch }}" falhou:
          <<<
          {{ steps.check.output.summary }}
          >>>
          Corrija sem sair do escopo do lote.
          {{ remediation.guidance | default("") }}
        output: handoff
        closeAfter: true
        next: check

      diagnose:
        action: diagnose
        next: ask-human

      ask-human:
        action: decision.request
        title: "\"{{ batch }}\" não passa na verificação depois de 3 tentativas"
        remediations: [retryWithGuidance, skipItem, takeOver, stop]   # §11.3
        blocks: run

      end-of-batch:
        notes: o commit do lote acontece aqui, pela política `git.commit`
        next: end
```

### 9.9 Exemplo — até concluir (UC-02)

```yaml
format: remote-claude/workflow@1
name: Implementar spec até concluir
trigger: { on: manual }
inputs:
  spec:      { type: path, label: Spec ou plano }
  batchSize: { type: text, label: Tamanho do lote, default: "2 fases" }
  verify:    { type: text, label: Comando de verificação, default: npm test }
verify: "{{ inputs.verify }}"

steps:
  preflight:
    action: preflight
    checks: [rulesForCommands, workspaceClean, review]

  loop:
    action: repeat
    maxIterations: 15
    until: { steps.implement.output.remaining: { isEmpty: true } }
    steps:
      implement:
        action: session.start
        permissions: rules-then-human
        prompt: |
          Leia {{ inputs.spec }}. Implemente o PRÓXIMO trecho pendente, de no máximo
          {{ inputs.batchSize }}, e só ele. Na nota, diga em `remaining` o que ainda falta,
          com os nomes que a spec usa.
          Já feito nesta execução:
          <<<
          {{ run.handoffs | summaries | bullets }}
          >>>
        output: handoff
        closeAfter: true
      check:
        action: verify
        onError: { goto: fix }
      # … fix / diagnose / ask-human como no §9.8 …
```

O `until` olha o que **a sessão** disse que falta; a verificação garante que o que ela disse que
fez passa. Um `remaining` que não diminui em duas iterações seguidas é tratado como falta de
progresso e escala (§9.5).

### 9.10 Modelos — executar sem escrever YAML

Para o caso central, o usuário **não escreve nem abre** o YAML. A tela **Executar** oferece os
modelos que vêm com o produto — "Implementar em lotes", "Implementar até concluir", "Executar work
item" — e cada um é um formulário gerado dos `inputs`:

```
┌─ Implementar em lotes ─────────────────────────────────────────┐
│ Pasta       [ ~/projects/meu-app                 ▾ ]           │
│ Spec        [ specs/001-anexos/                  📁 ]           │
│ Lotes       [ fase 1 e 2 ] [ fase 3 e 4 ] [ fase 5 ] [ + ]     │
│ Verificação [ npm test                              ]          │
│ Autonomia   ( ) supervisionado (•) equilibrado ( ) autônomo (?)│
│ Orçamento   [ 30 ] US$      Tempo máximo [ 12h ]               │
│ Git         [x] branch próprio  [x] commit por lote            │
│                                  [ Cancelar ]  [ Executar ▶ ]  │
└────────────────────────────────────────────────────────────────┘
```

O seletor de spec é o seletor de arquivo/pasta que já existe. "Personalizar" copia o modelo para um
arquivo do usuário, que abre no editor (§16) — o caminho de quem quer mudar o fluxo, não o de quem
quer executá-lo. O app também dispara modelos: o formulário cabe no celular.

---

## 10. Decisões humanas

### 10.1 De onde vêm

Tudo o que precisa do humano, de qualquer origem, vira **o mesmo objeto**:

| Origem | Exemplo |
|---|---|
| `AskUserQuestion` de uma sessão da execução (que o perfil não respondeu) | "Qual biblioteca de datas?" |
| `ExitPlanMode` de uma sessão da execução | o plano proposto |
| `needsDecision` de uma nota de passagem | "Comprimir imagens no cliente?" |
| Permissão de ferramenta fora das regras | "o lote 'fase 3 e 4' quer rodar `rm -rf build/`" |
| Erro com remediações (§11.3) | "o lote 3 não passa depois de 3 tentativas" |
| Pré-voo | regras, branch, orçamento, ambiguidades da spec |
| `decision.request` explícito | o portão humano do UC-12 |
| Limites | orçamento a 100 %, tempo esgotado |
| Reinício do backend | retomar · refazer · parar |
| Lista de lotes do planejador | aprovar, editar, reordenar |

Uma caixa só, uma forma de responder só, uma notificação só.

### 10.2 O objeto decisão

```yaml
id: dec_…
run: run_7Kq2
workflow: Implementar spec em lotes
step: ask-human
item: { index: 3, value: "fase 5" }
session: ses_…                        # a sessão de origem, para "ver a conversa"
source: question | plan | handoff | permission | error | preflight | explicit | limit | restart | batchList
title: "\"fase 5\" não passa na verificação depois de 3 tentativas"
context: |                            # curto; o "por que estou perguntando"
  O teste de compressão espera WebP e recebe JPEG…
questions:                            # 1..4, como o AskUserQuestion
  - id: next
    prompt: O que fazer?
    kind: single | multi | confirm | text | list | plan | remediation
    options:
      - id: retryWithGuidance
        label: Tentar de novo com uma orientação
        description: Uma nova sessão de correção recebe o seu texto.
        consequence: "+1 sessão; ~US$ 1,50"
        needsText: true
        prefill: "Use WebP, como a spec pede em 3.2."   # do diagnóstico
      - id: skipItem
        label: Pular este lote
        consequence: "os lotes seguintes rodam sem a fase 5"
    allowOther: true
recommendation:
  option: retryWithGuidance
  why: "o diagnóstico encontrou a causa com confiança alta"
  confidence: high | medium | low
evidence:
  - { kind: verification, ref: run_7Kq2/check-3-3.log }
  - { kind: diff,         ref: … }
  - { kind: session,      ref: ses_… }
  - { kind: file,         ref: specs/001-anexos/spec.md }
blocks: item | run
createdAt: …
remindAt: …
deadline: null                        # padrão: sem prazo (§10.5)
onDeadline: recommended | stop
status: open | answered | superseded | cancelled
answer: { next: retryWithGuidance, text: "Use WebP…" }
answeredBy: …
answeredFrom: web | mobile
```

Tudo o que a UI precisa para ser **estruturada e fácil** está no objeto: opções com descrição e
consequência, a recomendação com o porquê e a confiança, o texto pré-preenchido pelo diagnóstico,
a evidência a um toque. Nenhuma decisão chega como "a sessão está esperando", sem dizer o quê. A
decisão respondida vai, resumida, para o arquivo da execução (§7.1, `decisions`).

### 10.3 A caixa de decisões

Uma tela, no web e no app, com **todas** as decisões abertas do usuário, de todas as execuções:

```
┌─ Decisões (2) ─────────────────────────────────────────────────────────────┐
│ ● Implementar spec em lotes · lote 3 "fase 5"     bloqueia a execução · 4m │
│   "fase 5" não passa na verificação depois de 3 tentativas                 │
│   Diagnóstico: a compressão gera JPEG; a spec (3.2) pede WebP.  confiança ▲ │
│   ┌─────────────────────────────────────┐ ┌──────────────┐ ┌──────────┐    │
│   │ ★ Tentar de novo com orientação     │ │ Pular o lote │ │ Assumir  │ …  │
│   │ [Use WebP, como a spec pede em 3.2.]│ └──────────────┘ └──────────┘    │
│   └─────────────────────────────────────┘                                  │
│   Ver log ▸   Ver diff ▸   Ver conversa ▸   Ver no fluxo ▸                 │
│                                                        [ Responder ]       │
├────────────────────────────────────────────────────────────────────────────┤
│ ○ Implementar spec até concluir · pré-voo           bloqueia a execução · 1h│
│   Autorizar `npm test` neste projeto durante a execução?                   │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Ordem**: primeiro o que bloqueia uma execução inteira, depois o que bloqueia um lote; dentro de
  cada grupo, a mais antiga primeiro.
- **Um toque** responde com a opção recomendada destacada; o texto pré-preenchido é editável.
- **Atalhos de teclado** no web (números para as opções, `Enter` para responder).
- **Decisão de plano** mostra o plano renderizado: aprovar · rejeitar com motivo · pedir ajuste.
- **Decisão de lista** (lotes do planejador) mostra a lista editável: tirar, reordenar, renomear.
- **Responder num lugar fecha nos outros**: a primeira resposta vale; a outra tela mostra
  "respondida por você, no celular, há 10 s".
- **Respostas em lote** no pré-voo, com "aceitar todas as recomendações" (com confirmação da lista).
- **"Ver no fluxo"** abre o desenho da execução (§16.4) com o nó da decisão em destaque.

### 10.4 Notificação

O usuário é avisado **das execuções**, não só das decisões. O que avisa é escolhido em `notifyOn`:

| Evento | Padrão nos modelos de trabalho | Prioridade do push |
|---|---|---|
| `decision` — decisão aberta | sim (sempre, não dá para desligar) | alta |
| `runStarted` | não | baixa |
| `itemDone` — lote concluído e verificado | sim | baixa, agrupável |
| `itemFailed` — lote escalado com erro | sim | alta |
| `budget80` | sim | média |
| `runPaused` · `runStopped` | sim | média |
| `runFinished` — com o resumo de uma linha ("4/4 lotes, US$ 21,40, 3h08") | sim | média |
| `runFailed` | sim | alta |

- O push vai para todos os aparelhos aprovados e para a central do web, com **deep link** para a
  decisão ou para a execução.
- O push leva **workflow, lote e o tipo do evento**, nunca conteúdo de conversa (D-03); a tela,
  autenticada, mostra o resto.
- **Lembrete** de decisão que bloqueia a execução: 30 min, 2 h e 8 h (configurável).
- **Agrupamento**: eventos de baixa prioridade da mesma execução em menos de um minuto viram um push.
- **Silêncio quando alguém está olhando**: se uma tela do usuário está com a execução aberta, não
  vai push — a regra do módulo de notificação.

### 10.5 Prazos e espera longa

Uma decisão de um workflow **não tem prazo por padrão**: a execução espera. Negar sozinho, como faz
o prazo de permissão de hoje, é certo para quem está na frente da tela e errado para um trabalho de
horas com o dono fora de casa.

O problema é o `canUseTool`, que **segura o loop do agente**. Segurar por horas um subprocesso, um
socket e uma vaga de sessão não é razoável. A espera tem dois tempos (D-23):

1. **espera curta** (`holdFor`, padrão 10 min): a sessão fica viva segurando o `canUseTool`, como
   hoje;
2. **estacionamento**: passado o `holdFor`, o motor **interrompe e fecha a sessão**, guardando o id
   da conversa; o lote fica `blocked` e a vaga é liberada. Quando a resposta chega, o motor
   **reabre a conversa** (`resumeSessionId`) com o prompt: *"Resposta à sua pergunta «pergunta»:
   «resposta». Continue."*

O estacionamento perde a chamada de ferramenta pendente — a resposta chega como prompt, não como
resultado da ferramenta. **Gap: spike** para confirmar como o CLI retoma uma conversa interrompida
no meio de um `tool_use` antes de fechar o desenho (§21).

Prazo explícito existe para quem quiser (`deadline` + `onDeadline: recommended | stop`): "se eu não
responder em 2 h, siga a recomendação". Escolha do usuário, nunca o padrão.

### 10.6 O resto da execução enquanto espera

- `blocks: item` → o motor segue com os **lotes que não dependem** do bloqueado e volta a ele quando
  a resposta chega (D-27). A dependência entre lotes é declarada no workflow (`dependsOn`) ou pelo
  planejador; **sem declaração, o lote seguinte depende do anterior** — errar para o lado seguro
  custa tempo; errar para o outro custa retrabalho.
- `blocks: run` → a execução fica `waiting`.

---

## 11. Acompanhar, controlar e remediar

### 11.1 O painel da execução

É o arquivo da execução (§7) renderizado, ao vivo:

```
┌─ Implementar spec em lotes · specs/001-anexos ──────────────── ● rodando ─┐
│ ████████████░░░░░░░░  2/4 lotes   ⏱ 1h52   US$ 11,40 de 30   🧑 1 decisão │
│ [⏸ Pausar] [■ Parar] [✎ Orientar] [⋯]                                      │
├────────────────────────────────────────────────────────────────────────────┤
│ ✅ 1 fase 1 e 2    32 min · US$ 4,10 · verificado (112 testes) · 9b1e2d4   │
│ ✅ 2 fase 3 e 4    41 min · US$ 5,02 · 2 tentativas · verificado · 4c7a01e │
│ ❌ 3 fase 5        verificação falhou 3× · diagnóstico pronto [Remediar ▸] │
│ 🔲 4 fase 6                                                                 │
├────────────────────────────────────────────────────────────────────────────┤
│ Fluxo   Linha do tempo   Notas   Decisões   Erros   Commits   Custo  Texto │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Cabeçalho**: progresso, tempo, custo contra o orçamento, decisões abertas, estado.
- **Uma linha por lote**: estado, duração, custo, tentativas, resultado da verificação, commit;
  expandir mostra a nota de passagem, a saída da verificação, o diff do lote, as decisões e as
  sessões dele.
- **Assistir ao vivo** à sessão do lote corrente, no painel do Claude que já existe
  (`session.attach`).
- **Abas**:
  - **Fluxo** — o desenho do workflow com o estado de cada nó (§16.4);
  - **Linha do tempo** — cada passo executado, na ordem, como no arquivo;
  - **Notas** — as notas de passagem: o relatório legível do que foi feito;
  - **Decisões** — abertas e respondidas, com quem e de onde;
  - **Erros** — todos os erros da execução, os resolvidos inclusive, com diagnóstico e remediação
    aplicada;
  - **Commits**, **Custo** por lote;
  - **Texto** — o `.run.yaml`, somente leitura, e o botão de exportar Markdown.
- **Resumo final**: terminada a execução, o painel vira o relatório — o que foi feito, pulado e
  por quê, decisões (do humano e do agente, separadas), erros e como foram resolvidos, custo,
  commits, e o diff do branch inteiro.

A tela **Execuções** lista todas, com filtro por workflow, estado e período, as ativas no topo. A
barra de status mostra um indicador de "workflow rodando" com o progresso.

### 11.2 Controles

| Controle | O que faz | Ponto seguro |
|---|---|---|
| **Pausar** | não começa o próximo lote nem o próximo passo; a sessão corrente termina o turno | fim do turno corrente |
| **Retomar** | continua de onde pausou | — |
| **Parar** | pausa, e fecha a execução como `stopped`. O feito fica: commits, arquivos, notas. Pode ser **continuada** depois (os lotes `done` são pulados) | fim do turno corrente |
| **Abortar** | interrompe a sessão corrente **agora** e para. O lote corrente fica `pending`, com o que escreveu no disco (e o desfazer de arquivos que já existe disponível) | imediato |
| **Orientar** | um texto que entra como prompt na sessão corrente (na fila, se ela estiver no meio de um turno) **ou** fica guardado para o próximo lote — a pessoa escolhe | — |
| **Pular lote** | marca como `skipped` (e diz quais dependentes também) | antes de começar, ou abortando |
| **Repetir lote** | volta um lote `done`, `skipped` ou `failed` para `pending`, com opção de reverter o commit dele | execução pausada ou parada |
| **Assumir** | pausa e abre a sessão do lote para o humano continuar à mão; "devolver" faz o motor verificar e seguir | — |
| **Mudar orçamento / tempo** | ajusta os tetos em andamento, dentro do teto da instalação | — |
| **Pausar tudo** | o interruptor global: pausa todas as execuções e para os gatilhos automáticos | fim do turno de cada uma |

**Todos estão no app**, com confirmação nos destrutivos. Cada controle é um comando idempotente,
com `ack` e evento de resultado, e cada um aplicado vira uma linha no arquivo da execução (quem, de
onde, quando).

### 11.3 Erros e remediação

Todo erro, de qualquer passo, tem a mesma forma no arquivo e na tela:

```yaml
error:
  kind: verificationFailed           # do catálogo abaixo
  message: "npm test saiu com código 1 em 3 tentativas seguidas"   # uma linha, para a lista
  details: |                          # o trecho que explica: a falha, a exceção, o motivo
    FAIL src/upload/compress.test.ts …
  log: run_7Kq2/check-3-3.log         # o resto, ao lado
  diagnosis:                          # quando há diagnóstico (passo `diagnose` ou automático)
    probableCause: …
    confidence: high | medium | low
    suggestedRemediation: retryWithGuidance
    guidance: "Use WebP, como a spec pede em 3.2."
  remediations: [retryWithGuidance, resumeFrom, skipItem, takeOver, stop]
```

**Catálogo de erros**, com as remediações oferecidas por padrão:

| `kind` | Quando | Remediações |
|---|---|---|
| `verificationFailed` | o comando de verificação saiu ≠ 0, depois das correções | `retryWithGuidance` · `skipItem` · `takeOver` · `stop` |
| `sessionFailed` | a sessão encerrou com falha ou caiu | `retry` · `resumeConversation` · `takeOver` · `stop` |
| `invalidOutput` | a saída estruturada (nota de passagem, veredito) não validou | `retry` · `retryWithGuidance` · ver a saída crua |
| `permissionDenied` | uma ferramenta foi negada (por regra, `rules-only` ou humano) e a sessão não conseguiu seguir | `grantRuleAndRetry` · `retryWithGuidance` · `skipItem` |
| `noProgress` | duas tentativas com a mesma falha, ou `remaining` que não diminui | `retryWithGuidance` · `takeOver` · `stop` |
| `limitExceeded` | custo, tempo, sessões, iterações ou visitas | `raiseLimitAndContinue` · `stop` |
| `timeout` | um passo passou do `timeout` dele | `retry` (com prazo maior) · `skipItem` · `stop` |
| `interrupted` | o backend reiniciou no meio | `resumeConversation` · `retry` · `stop` |
| `noCapacity` | sem vaga de sessão na instalação | esperar · `retry` |
| `deliveryFailed` | email, webhook ou push não entregou | `retry` · ignorar |
| `definitionChanged` | o workflow mudou ou ficou inválido durante uma pausa | `resumeWithOldVersion` · `editAndResume` · `stop` |

**As remediações** — os verbos que a tela oferece como botões, e que o YAML pode restringir:

| Remediação | O que faz |
|---|---|
| `retry` | roda o passo que falhou de novo, igual |
| `retryWithGuidance` | roda de novo com um texto do humano no prompt (pré-preenchido pelo diagnóstico, quando há) |
| `resumeConversation` | reabre a conversa da sessão que caiu, em vez de começar outra |
| `resumeFrom` | retoma a execução a partir de um passo e lote escolhidos no desenho (§16.4) |
| `skipItem` | pula o lote e segue |
| `takeOver` | o humano assume a sessão; ao devolver, o motor verifica e segue |
| `grantRuleAndRetry` | abre a concessão de regra já preenchida com o que foi negado; concedida, tenta de novo |
| `raiseLimitAndContinue` | aumenta o teto que estourou e segue de onde parou |
| `editAndResume` | abre o workflow no editor; salvo e reativado, a execução segue **na versão nova** a partir do passo escolhido — o arquivo da execução registra as duas versões e o ponto da troca |
| `stop` | encerra como `stopped`, guardando o feito |

**O diagnóstico** é o que transforma "falhou" em "falhou por isto, e isto resolve". Um passo
`diagnose` — ou o diagnóstico automático que os modelos de trabalho ligam em todo erro escalado —
abre uma sessão curta, **só leitura** (`permissions: plan`), com o erro, o trecho do log, a nota do
lote e o diff, e pede saída estruturada: causa provável, evidência, confiança, remediação sugerida e
o texto da orientação. Ele **não corrige nada** — quem corrige é a remediação, escolhida pelo humano
(ou, no perfil `autonomous`, aplicada uma vez sozinha quando a confiança é alta).

Toda remediação aplicada vira uma entrada em `remediations` no arquivo da execução, com o resultado
(`outcome`), e a execução volta a `running` no mesmo arquivo (§8.3).

### 11.4 No celular

O app é **onde o humano está** quando o trabalho roda sozinho, então tem o necessário para operá-lo
de ponta a ponta (D-05):

- a **caixa de decisões**, com a mesma estrutura: opções em botões grandes, recomendação
  destacada, texto pré-preenchido, evidência a um toque (log e diff com visualização para tela
  pequena);
- o **painel da execução** em versão vertical, com os **erros e as remediações** como botões;
- o **desenho do fluxo** com o estado de cada nó (somente leitura, com zoom e toque no nó);
- **assistir à sessão** do lote corrente (o chat do app que já existe);
- **disparar um modelo** (o formulário do §9.10);
- o **interruptor global**.

O que **não** está no app: editar o workflow e ativar uma versão nova (que pede ler um diff —
§15.1). A remediação `editAndResume`, por isso, aparece no app como "abrir no web".

---

## 12. Permissões das sessões abertas por workflow

Cada `session.start` declara `permissions`:

| Valor | Comportamento | Quando usar |
|---|---|---|
| `ask-human` | como uma sessão normal: pedido para as telas e push | sessões soltas, fora de trabalho |
| `rules-then-human` | o que as regras autorizam roda; o resto vira **decisão** (§10), com a espera longa do §10.5 | **padrão dos modelos de trabalho** |
| `rules-only` | o que as regras não autorizam é **negado na hora**, com um motivo que o Claude lê | revisores, verificadores, respondedores |
| `plan` | modo plan: lê, não escreve | análise, diagnóstico, pré-voo |

**Um workflow nunca aprova permissão de ferramenta** (Bash, Edit, Write, MCP) — nem diretamente,
nem por uma sessão respondedora, em perfil de autonomia nenhum. Autorização antecipada é assunto
das regras do [plano 15](../plans/15-rules-management/README.md), e o pré-voo (§9.6) existe para
concedê-las **antes**, de uma vez, com o humano olhando a lista. O que o workflow decide sozinho
são **perguntas** e **planos**: conversa, não execução (D-01).

---

## 13. Respostas automáticas e a sessão respondedora

### 13.1 A ordem no `canUseTool`

Para `AskUserQuestion` e `ExitPlanMode`, os passos da [RequestPermissionUseCase](../../backend/src/application/permission/request-permission.use-case.ts)
passam a ser:

1. idempotência (igual a hoje);
2. **um workflow quer responder?** A porta `QuestionResponder` diz `sim, com a execução X` ou
   `não`. Com sim, o pedido é publicado normalmente, marcado como "sendo respondido pelo workflow
   X", e o humano pode responder antes;
3. o resto como hoje.

Se a execução não responder, ou o respondedor não souber, a pergunta **vira decisão** (§10) —
nunca é respondida por padrão. A resolução sai com `auto: true` e
`resolvedBy: { kind: 'workflow', workflowId, runId }`, vai para a trilha e para o arquivo da
execução.

### 13.2 Resposta fixa (UC-07)

```yaml
trigger:
  on: session.questionAsked
  where:
    questions[*].header: { equals: "Pacotes" }
steps:
  answer:
    action: question.answer
    answers:
      Pacotes: pnpm
```

A resposta é **validada contra as opções** da pergunta; rótulo fora delas falha o passo, e a
pergunta vira decisão.

### 13.3 A sessão respondedora (UC-08, UC-10 e os perfis do §9.7)

```yaml
steps:
  ask-architect:
    action: question.answer
    responder:
      session: persistent           # uma por workflow, reaproveitada (D-15)
      workspace: ~/projects/meu-app
      permissions: plan
      role: |
        Você é o arquiteto deste repositório. Responda com base na spec e nas decisões
        já registradas. Se não tiver certeza, diga que não sabe.
      allowUnsure: true
```

1. o prompt leva o papel, a pergunta, as opções e o contexto mínimo (lote, título da sessão,
   pasta) — **não** a conversa inteira da sessão de origem;
2. saída estruturada: um enum com os rótulos válidos por pergunta, mais `unsure`, a justificativa e
   a confiança;
3. `unsure`, confiança baixa ou saída inválida → **decisão** para o humano, com a resposta do
   respondedor como **recomendação** (§10.2). O respondedor ajuda mesmo quando não decide;
4. resposta aceita → `updatedInput.answers`, e a nota do lote registra "respondido pelo
   respondedor: X, porque Y" em `decisionsTaken`, para o humano rever no resumo.

Os perfis do §9.7 são, por baixo, respondedores pré-configurados.

---

## 14. Notificações e email

### Notificação

Reusa a central e o push (§10.4). Duas tensões com a regra atual:

- **O catálogo de chaves é fechado** ([backend/03 §notification](../architecture/backend/03-modules.md#notification)).
  Entram chaves novas — `workflow.decisionOpened`, `workflow.decisionReminder`,
  `workflow.itemDone`, `workflow.itemFailed`, `workflow.budgetWarning`, `workflow.runPaused`,
  `workflow.runFinished`, `workflow.runFailed`, `workflow.notify` —, com parâmetros de **metadado**
  (nome do workflow, rótulo do lote, contagens, custo, duração). `workflow.notify` aceita a
  mensagem do usuário (o texto do arquivo dele), com limite de tamanho.
- **O push nunca leva conteúdo de conversa.** O título de uma decisão vinda de um
  `AskUserQuestion` **é** texto do Claude: o push leva workflow + lote + "precisa de uma decisão",
  e o título aparece depois de abrir (D-03). Em `notify`, a validação recusa interpolar campos de
  conteúdo (`text`, `lastMessage`, `summary`, `details`).

O rótulo do lote ("fase 1 e 2") é texto **do usuário**, escrito no workflow ou no formulário — não
do Claude — e por isso pode ir no push. O de um lote vindo do planejador ou do `remaining` é do
Claude, e não vai.

### Email

- Porta nova `MailSender`, adapter **SMTP genérico** (host, porta, credencial em arquivo), como o
  push: nenhum nome de provedor no código, e a falta de configuração **não derruba o boot**.
- **Destinatário restrito** aos emails verificados do próprio usuário. O mesmo para `webhook.call`,
  com allowlist de URLs.
- **Conteúdo no corpo**: só com `includeContent: true` (D-03). O **resumo final** de uma execução —
  a exportação em Markdown do arquivo da execução (§7.4) — é o caso que justifica a opção.
- Retry com o mesmo desenho do push.

---

## 15. Segurança

### 15.1 O arquivo de workflow é código que roda depois

Se o arquivo mora no projeto (D-04), **o próprio Claude pode escrevê-lo** — e uma execução de
trabalho tem sessões escrevendo no projeto por horas. Por isso:

- o caminho dos workflows entra em [sensitive-files.ts](../../backend/src/domain/files/services/sensitive-files.ts):
  escrita do Claude nele **sempre** pede permissão, inclusive com regra larga;
- **ativação por hash**: um workflow só roda depois que um humano o ativa pela UI, e a ativação
  grava o hash do conteúdo. **Qualquer** mudança desativa o workflow até alguém revisar o diff e
  ativar de novo. "Salvar e reativar" num gesto só, no editor da ferramenta;
- **uma execução roda a versão do hash com que começou**, mesmo que o arquivo mude no meio — a não
  ser pela remediação `editAndResume`, que é explícita e fica registrada;
- os **modelos que vêm com o produto** são confiáveis por construção (não moram no projeto);
- os **arquivos de execução** também entram na lista de sensíveis: uma sessão não reescreve o
  registro do que ela mesma fez.

### 15.2 Injeção de prompt entre sessões

A saída de uma sessão vira entrada de outra, e num trabalho encadeado isso acontece dezenas de vezes.

- decisões automáticas passam por **saída estruturada validada** (enum), não por texto livre;
- **nenhuma resposta automática aprova ferramenta** (§12);
- email e webhook só para destinos verificados ou na allowlist;
- texto de outra sessão entra **delimitado e rotulado** como dado;
- as notas de passagem levam só os **resumos** adiante;
- a verificação é do motor e decide pelo código de saída (§9.4): uma sessão manipulada não
  consegue se declarar pronta.

### 15.3 Laços

- toda sessão tem `origin` (`human`·`workflow`), a execução e a profundidade da cadeia;
- gatilhos ignoram sessões de `origin: workflow` por padrão;
- `maxDepth`, `maxRunsPerHour`, `maxVisits`, `maxIterations`, `maxSessions`, `maxCostUsd`;
- o **interruptor global**, no web e no app.

### 15.4 Escopo de pasta

Toda ação passa pela allowlist de raízes. A worktree de uma execução (§9.8) é criada **dentro** de
uma raiz permitida, ou a execução não começa.

---

## 16. O editor visual e o acompanhamento visual

### 16.1 Layout do editor

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Implementar spec em lotes                     ● ativo   [Testar] [Salvar] │
├──────────────────────────────┬────────────────────────────────────────────┤
│  (manual)                    │ 1  format: remote-claude/workflow@1        │
│     │                        │ 2  name: Implementar spec em lotes         │
│     ▼                        │ …                                          │
│  preflight                   │ 22   each-batch:                           │
│     │                        │ 23     action: foreach                     │
│     ▼                        │ …                                          │
│ ┌ para cada lote ─────────┐  ├────────────────────────────────────────────┤
│ │ implement → check ─ok─► │  │ Passo "implement" · Abrir sessão       (?) │
│ │      ▲        │falhou   │  │ Prompt [ Implemente {{ batch }} de …  ]    │
│ │      └─ fix ◄─┘ (×3)    │  │ Permissões (•) regras, depois humano       │
│ │         └─► diagnose →🧑│  │ Saída      (•) nota de passagem            │
│ └─────────────────────────┘  │                                            │
└──────────────────────────────┴────────────────────────────────────────────┘
```

### 16.2 Comportamento do editor

- **Canvas** com React Flow (`@xyflow/react`, MIT) e auto-layout por `elkjs`. Um nó por passo, o
  gatilho como entrada, arestas rotuladas pela condição.
- **`foreach` e `repeat` são grupos**: um nó que contém o sub-fluxo. Laços de correção aparecem
  como arestas de volta, com o `maxVisits` no rótulo.
- **Decisões são nós próprios** (forma e cor de "humano"); o nó de sessão mostra quem responde as
  perguntas dela, pelo perfil de autonomia.
- **YAML no Monaco**, lado a lado, sincronizado nos dois sentidos sobre o `Document` da lib `yaml`,
  o que preserva comentários e ordem.
- **Formulário do nó** gerado do schema da ação, com ajuda na tela.
- **Paleta de ações** para arrastar; ligar dois nós escreve o `next`.
- **Erros** no nó, na linha do YAML e numa lista.
- **Posição manual** vai para o bloco `layout`; "reorganizar" volta ao auto-layout.
- **Testar** (*dry-run*): com inputs de exemplo, mostra o caminho que o fluxo faria, os lotes que
  rodaria e os prompts já interpolados, sem abrir sessão nem notificar.
- **Edição concorrente**: `If-Match` na gravação; `409` com o diff se o arquivo mudou no disco.

### 16.3 Telas

| Tela | Web | App |
|---|---|---|
| **Executar** — os modelos, com o formulário de disparo | ✔ | ✔ |
| **Decisões** — a caixa (§10.3) | ✔ | ✔ |
| **Execuções** — lista e painel (§11.1), com o fluxo, os erros e as remediações | ✔ | ✔ (vertical) |
| **Workflows** — lista, estado de ativação, interruptor global | ✔ | ✔ (ligar/desligar) |
| **Editor** — canvas + YAML | ✔ | — |
| Selo na sessão — "aberta pelo workflow X, lote 3" com link para a execução | ✔ | ✔ |

### 16.4 O fluxo com o estado da execução

A aba **Fluxo** do painel (e a tela do celular) é o desenho do workflow **na versão que rodou**,
colorido pelo arquivo da execução — os dois cruzados pelo nome do passo:

```
  (manual) ──► preflight ✅ ──► ┌ para cada lote ─────────────────────────────┐
                                │  lote: [1 ✅] [2 ✅] [3 ❌] [4 🔲]            │
                                │                                             │
                                │  implement ✅ ──► check ❌ ──► fix ✅ ×3     │
                                │                     │                       │
                                │                     └──► diagnose ✅ ──► 🧑 ● │  ← está aqui
                                └─────────────────────────────────────────────┘
```

- **Cor por estado**: concluído, em andamento (pulsando), esperando humano, falhou, pulado, não
  executado. **Arestas percorridas** em destaque, com a contagem de vezes.
- **Seletor de lote** no grupo `foreach`/`repeat`: o desenho mostra o caminho daquele lote.
- **Clicar num nó** abre as execuções dele, como estão no arquivo: horário, duração, custo, prompt
  enviado, nota de passagem, verificação, erro com diagnóstico — e, se falhou, **as remediações
  como botões**, ali mesmo.
- **"Retomar daqui"** (`resumeFrom`) num nó qualquer: a remediação mais direta para quem olha o
  desenho e sabe onde quer recomeçar.
- **Ao vivo**: a cor muda conforme as transições chegam pelo WebSocket.
- O mesmo desenho, sem estado, é o que o editor mostra: quem desenhou o fluxo reconhece a execução.

---

## 17. Persistência

| O quê | Onde | Por quê |
|---|---|---|
| Definição do workflow | arquivo `.yaml` (D-04) | é o texto que o humano lê e edita |
| Modelos do produto | no código | confiáveis por construção |
| **Registro da execução** | arquivo `.run.yaml` + pasta de logs (§7) | é o que o humano lê depois |
| Estado vivo e coordenação | banco | transação, idempotência, espera, concorrência |

No banco, só o que precisa de transação ou de consulta:

| Tabela | Conteúdo |
|---|---|
| `workflow_activations` | `user_id`, arquivo, `content_hash`, ativado em/por, desativado em, motivo |
| `workflow_runs` | o **índice** das execuções: id, workflow, hash, gatilho, estado, posição, profundidade, execução pai, custo, começo, fim, caminho do arquivo |
| `workflow_run_state` | o estado vivo da execução em andamento (passo, lote, visita, saídas que os próximos passos usam); apagado quando ela termina — daí em diante, o arquivo é o registro |
| `workflow_decisions` | decisões **abertas** e o histórico recente (a caixa precisa consultar entre execuções) |
| `workflow_trigger_keys` | `(workflow, event_id)` — idempotência |
| `workflow_waits` | o que uma execução em `waiting` espera, e até quando |

Um índice perdido se reconstrói lendo os arquivos de execução. O log de I/O nunca leva conteúdo: diz
ids, estados e tamanhos. Migration versionada ([backend/05](../architecture/backend/05-persistence.md)).

---

## 18. Contrato

### REST

| Rota | Resposta |
|---|---|
| `GET /workflows` · `GET /workflows/:id` | lista; `{ yaml, revision, parsed, errors[], activation }` |
| `PUT /workflows/:id` `If-Match` | salva; `409` se mudou no disco; inválido é salvo e marcado (D-16) |
| `POST /workflows/validate` | valida sem salvar |
| `POST /workflows/:id/activation` `{ contentHash }` · `DELETE …/activation` | ativa a versão lida; `409` se o hash não é o atual |
| `GET /workflow-templates` | os modelos do produto, com o schema dos `inputs` |
| `POST /workflows/:id/runs` · `POST /workflow-templates/:id/runs` `{ inputs, autonomy, limits }` | dispara; `202` com o id |
| `POST /workflows/:id/dry-run` `{ inputs \| eventRef }` | simulação |
| `GET /workflow-runs?workflow=&status=&cursor=` | o índice |
| `GET /workflow-runs/:id` | o arquivo da execução, já parseado, mais o estado vivo |
| `GET /workflow-runs/:id/record` · `GET /workflow-runs/:id/logs/:name` · `GET /workflow-runs/:id/export.md` | o `.run.yaml` cru, um log, a exportação |
| `POST /workflow-runs/:id/{pause,resume,stop,abort,continue}` | `202`; idempotente |
| `POST /workflow-runs/:id/guidance` `{ text, target: current \| nextItem }` | orientar |
| `POST /workflow-runs/:id/items/:index/{skip,retry,takeover,handback}` | controles por lote |
| `POST /workflow-runs/:id/remediations` `{ error, action, text?, from? }` | aplica uma remediação; `409` se o erro já foi remediado |
| `PATCH /workflow-runs/:id/limits` | mudar orçamento e tempo |
| `GET /decisions?status=open` · `POST /decisions/:id/answer` · `POST /decisions/answer-batch` | a caixa; `409` se já respondida, com quem e de onde |
| `PUT /workflows/pause` `{ paused }` | o interruptor global |

### WebSocket

Mudança de contrato — entra no [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md)
e nas três pontas na mesma mudança:

- comando `workflow.watch` `{ runId? }` / `workflow.unwatch` — uma **assinatura** (sem replay,
  `seq` próprio, como `workspace.watch`); sem `runId`, acompanha todas as execuções do usuário;
- eventos `workflow.runUpdated`, `workflow.itemUpdated`, `workflow.stepUpdated`,
  `workflow.errorRaised`, `workflow.remediationApplied`, `workflow.definitionChanged` — cada um
  carrega o trecho do registro que mudou, na mesma forma do arquivo (§7), para o cliente aplicar
  sem reler tudo;
- eventos `decision.opened`, `decision.answered`, `decision.superseded` — para **todas** as
  connections do usuário, porque a caixa é global;
- `session.started` e a lista de sessões ganham `origin`, `workflowRunId?` e `item?`;
- `permission.requested` ganha `handledBy?`; `permission.resolve` ganha as respostas de
  `AskUserQuestion` (lacuna 1 do §4).

O cliente reconecta e relê a execução pelo REST, como a central de notificações já faz.

### i18n

Toda mensagem de UI, de erro, de estado, de `kind` de erro e de remediação é `messageKey` +
`params`, nos dois idiomas. O que o usuário escreve (nomes, rótulos de lote, orientações) e o que o
Claude escreve (perguntas, resumos, diagnósticos) não é traduzido. O cabeçalho-resumo do arquivo
da execução é gerado no idioma do usuário que disparou.

---

## 19. Observabilidade

- log `debug` de cada borda nova: evento recebido, casamento de gatilho, transição de execução,
  lote, passo e decisão, escrita do arquivo da execução, chamada a cada porta — com ids e estados,
  sem conteúdo;
- trilha de auditoria: ativação, disparo, controles e remediações (quem, de onde), toda decisão
  respondida (pelo humano ou pelo agente), toda verificação, todo commit, todo email;
- o diagnóstico do [plano 18](../plans/18-logs-and-diagnostics/README.md) ganha as execuções ativas,
  as decisões abertas, as conversas estacionadas e os arquivos de execução que não puderam ser
  escritos.

---

## 20. Matriz de cenários — semente

Ponto de partida para os planos derivados, que enumeram a sua matriz antes de escrever código.

| Dimensão | Cenários |
|---|---|
| **Equivalência** | cada gatilho e cada ação; as três maneiras de dizer os lotes (lista, `repeat`, planejador); os três perfis × cada origem de decisão (a tabela do §9.7 inteira); cada `kind` de erro × cada remediação oferecida; cada controle do §11.2; cada tipo de pergunta de decisão; resposta pelo web e pelo app; o mesmo modelo com specs de formatos diferentes (o motor não muda de comportamento) |
| **Fronteira** | 0, 1 e muitos lotes; `remaining` vazio na primeira iteração; `maxIterations` e `maxVisits` no teto e um acima; custo cruzando 80 % e 100 % no meio de um turno; `holdFor` vencendo um instante antes e um depois da resposta; 4 perguntas × 4 opções; log de verificação acima do limite; arquivo de execução com centenas de passos |
| **Erro** | YAML e schema inválidos; sessão que falha no meio; nota de passagem inválida; verificação sem regra; comando que não existe; respondedor fora das opções; diagnóstico que falha; SMTP fora do ar; pasta fora da allowlist; sem vaga de sessão; branch já existe; árvore suja; conversa estacionada que não reabre; disco cheio ao escrever o arquivo da execução; pasta de execuções sem permissão de escrita |
| **Transição de estado** | todas as setas do §8.3 (execução, lote, passo), inclusive `failed → running` por remediação; pausar/parar/abortar em cada estado; arquivo do workflow alterado com execução em andamento; `editAndResume`; reinício do backend em cada estado; estacionar e reabrir; assumir e devolver; continuar uma execução parada; pular lote com dependentes |
| **Concorrência** | duas execuções de trabalho na mesma pasta; humano e respondedor respondendo a mesma pergunta; a mesma decisão respondida no web e no app no mesmo instante; a mesma remediação aplicada em duas telas; "parar" em duas telas; leitura do arquivo da execução no meio de uma escrita; edição à mão do arquivo da execução durante a execução |
| **Idempotência** | o mesmo evento reentregue; o mesmo controle, a mesma resposta, a mesma remediação repetidos; a mesma verificação reexecutada após reinício; `email.send` e commit não duplicam (chave por `execução + lote + passo + visita`); regravar o arquivo da execução sem transição nova não muda o conteúdo; reconstruir o índice a partir dos arquivos duas vezes |

---

## 21. Fatiamento sugerido em planos

A ordem é de dependência. Cada um é um plano no formato normativo, criado por `pnpm plan new`.

| Plano | Escopo | Depende de |
|---|---|---|
| **A — Decisões estruturadas** | o objeto decisão, a caixa no web e no app, push e central para decisão; `AskUserQuestion` respondida pela UI (o veredito com `updatedInput`); `ExitPlanMode` migrado para a caixa. Útil sozinho: hoje o Claude pergunta e ninguém consegue responder direito | — |
| **B — Motor e os dois formatos** | módulo `workflow`; formato do workflow v1 com schema e validação semântica; **formato da execução v1**, escrita atômica, índice e reconstrução; ativação por hash e arquivos sensíveis; fatos da sessão no barramento; gatilhos de sessão, `manual`, `workflow.runFinished`; ações de sessão, `notify`, `decision.request`, `wait`; estados, limites, controles básicos, interruptor global; REST e eventos WS; telas de lista e do painel da execução (sem o desenho) | A |
| **C — Trabalho encadeado** | `foreach`, `repeat`, planejador; nota de passagem; `verify` com a porta `CommandRunner` e as regras; correção, `noProgress`, **erros, diagnóstico e remediações**; pré-voo (com `review`); perfis de autonomia; git; espera longa (depois do spike); lotes independentes durante a espera; os modelos; o painel completo e os controles por lote, no web e no app | B |
| **D — Respostas automáticas** | `question.answer` e `plan.decide`, resposta fixa e respondedor, a porta `QuestionResponder` no `permission` | B (e C para os perfis) |
| **E — Editor e fluxo visual** | canvas + Monaco sincronizados, formulário do nó, grupos, erros no nó, layout, dry-run; **o fluxo com o estado da execução** (§16.4), com "retomar daqui", no web e (somente leitura) no app | B |
| **F — Email, webhook e agendamento** | `MailSender` (SMTP), `email.send` com a exportação da execução, `webhook.call`, gatilho `schedule` | B |

**A ordem C antes de E é uma recomendação** (D-26): o caso central se dispara por modelo, sem
desenhar nada, e o acompanhamento já existe no painel da execução (lista de lotes, linha do tempo,
erros e remediações). O desenho do fluxo — editor e acompanhamento visual — vem em seguida e reusa
o mesmo arquivo. Se o acompanhamento **visual** for o que mais pesa, a parte de §16.4 pode subir
para dentro de C.

Antes de C, um **spike** de uma fase só, sem código de produto: estacionar e reabrir uma conversa no
meio de um `tool_use` (§10.5). O resultado entra na [discovery](../discovery/01-descoberta-claude-agent-sdk.md).

---

## 22. Decisões em aberto

Cada uma vira entrada no `decisions.md` do plano que a precisar. **Recomendação** é a proposta deste
documento, não decisão tomada.

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-01 | Um workflow pode aprovar **permissão de ferramenta**? | sim · por respondedor · não | **não**, em perfil nenhum; o pré-voo propõe as regras antes (§12) |
| D-02 | Quem aprova as permissões de uma sessão aberta por workflow? | humano · só regras · respondedor | **por passo**; `rules-then-human` nos modelos de trabalho |
| D-03 | **Conteúdo de conversa** em push, central e email? | nunca · só email, opt-in · sempre | push e central só com metadado e texto do usuário (rótulo do lote); email com conteúdo só com `includeContent` e destinatário verificado |
| D-04 | **Onde mora** o arquivo de workflow? | projeto · pasta do usuário · banco | **projeto** (`.remote-claude/workflows/`) **e** pasta do usuário, com ativação por hash |
| D-05 | O que o **app** faz? | tudo · operar e decidir · só notificação | **operar, decidir e remediar**, com o fluxo em somente leitura; sem editar (§11.4) |
| D-06 | **Email** por qual meio? | SMTP genérico · API de provedor | **SMTP genérico** |
| D-07 | **Libs do editor** | React Flow + elkjs · outra · própria | **React Flow + elkjs**, com ADR; `monaco-yaml` ou equivalente |
| D-08 | **Linguagem de template e condição** | própria · Handlebars · CEL · JSONata | **própria e mínima**; reavaliar CEL se crescer |
| D-09 | **Regex** em `matches` | RE2 · JS com limite · fora da v1 | **fora da v1**, ou RE2 se a dependência nativa couber na distribuição |
| D-10 | **Paralelismo** | v1 · depois | **depois**: duas sessões escrevendo no mesmo working tree é o problema mais caro deste desenho |
| D-11 | **Agendamento** com o backend desligado | catch-up · pular | **pular**, e registrar o horário perdido |
| D-12 | **Retenção** das execuções | N por workflow · dias · para sempre | **50 por workflow**, configurável (`runs.keep`) |
| D-13 | **Webhook** entra? | sim, com allowlist · não | **sim, no plano F** |
| D-14 | `concurrency` padrão | `skip` · `queue` · `parallel` | **`skip`**; nos modelos de trabalho, **recusar** a segunda execução na mesma pasta sem worktree |
| D-15 | **Respondedor** por workflow ou por pergunta? | `persistent` · `perQuestion` | os dois; **`persistent`** como padrão |
| D-16 | **Salvar workflow inválido** | recusar · salvar e marcar | **salvar e marcar**; inválido nunca ativa |
| D-17 | **Dois workflows** querendo responder a mesma pergunta | o primeiro · erro · nenhum | **nenhum**: vira decisão, e a UI aponta o conflito |
| D-18 | **Nome do diretório** | `.remote-claude/` · `.claude/workflows/` | **`.remote-claude/`** — `.claude/` é da instalação do Claude Code |
| D-19 | **Como o motor sabe os lotes** | parser de formatos conhecidos · lista, `repeat` e planejador | **lista, `repeat` e planejador**, sem parser nenhum: o motor é agnóstico de formato (§9.2) |
| D-20 | **Unidade de sessão** | uma por lote · uma para tudo | **uma por lote**; o tamanho do lote é escolha do usuário |
| D-21 | **Como verificar** | o motor roda o comando sob as regras · uma sessão roda e a trilha confirma · confiar no relato | **o motor**, sob as regras, pelo código de saída (§9.4); relato nunca |
| D-22 | **Git** padrão | branch + commit por lote · worktree · nada | **branch próprio + commit por lote, sem push**; worktree opcional, desligada até medir o custo |
| D-23 | **Espera longa** | segurar o `canUseTool` · estacionar e reabrir · negar | **segurar 10 min, depois estacionar**, condicionado ao spike (§10.5) |
| D-24 | **Prazo de decisão** padrão | nenhum · seguir a recomendação após X · parar após X | **nenhum**, com lembretes |
| D-25 | **Perfil de autonomia** padrão | `supervised` · `balanced` · `autonomous` | **`balanced`** |
| D-26 | **Ordem dos planos** | editor antes · trabalho encadeado antes | **trabalho encadeado (C) antes do editor (E)**, com a opção de subir o fluxo visual (§21) |
| D-27 | **Seguir com lotes independentes** enquanto um espera | sim · não | **sim**, com a regra conservadora de dependência (§10.6) |
| D-28 | **Quem pode responder** uma decisão | só o dono da execução · qualquer usuário com acesso à pasta | **só o dono** na v1 |
| D-29 | **Formato do arquivo da execução** | YAML · Markdown com front matter · JSON | **YAML** (o mesmo do workflow, legível e parseável para o desenho), com exportação para Markdown (§7.4) |
| D-30 | **Onde ficam as execuções** | no projeto, ignoradas pelo git · no projeto, versionadas · na pasta do usuário | **no projeto, ao lado do workflow, com `.gitignore`**; versionar é opt-in (`runs.commit`) |
| D-31 | **Fonte da verdade** da execução | o arquivo · o banco · o banco em execução e o arquivo depois | **o banco coordena enquanto roda; o arquivo é o registro**, escrito a cada transição e completo ao fim (§7.3) |
| D-32 | **Diagnóstico automático** em todo erro escalado | sim · só com o passo `diagnose` · não | **sim nos modelos de trabalho**; nos workflows do usuário, só com o passo explícito |

---

## 23. Fora do escopo desta proposta

- **qualquer parser de formato de trabalho** (spec, plano, checklist): o motor encadeia, a sessão
  interpreta (D-19);
- execução em paralelo (D-10);
- integração nativa com rastreadores (Jira, Linear, GitHub Issues) — o work item entra como texto,
  arquivo ou pelo MCP que a instalação já tiver (§9.2);
- gatilhos de fontes externas (webhook de entrada, email recebido) — dependem do backend exposto, e
  quem decide isso é o [plano 20](../plans/20-dev-public/README.md);
- **comando de shell arbitrário** como passo: o motor só executa o comando de verificação, e só o
  que uma regra concedida pelo humano autoriza (D-21);
- `git push`, pull request, merge — são do humano, a partir do resumo;
- editar o arquivo da execução à mão como forma de controlar a execução (§7.3);
- marketplace ou compartilhamento de workflows entre usuários;
- versionamento de workflows dentro da ferramenta: quem versiona é o git (D-04).
