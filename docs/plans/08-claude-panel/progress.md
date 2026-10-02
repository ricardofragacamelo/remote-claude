# Plano 08 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0, F1 e F2 concluídas (implementadas juntas, a pedido do usuário, com o portão completo só ao fim da F2) — a F3 é a próxima
**Última atualização:** 2026-10-02
**Validação:** `pnpm verify:full` de 2026-10-01 com os onze portões verdes (saída 0; e2e 88/88), depois dos ciclos 8–10; `pnpm test:e2e:mobile` 15/15 com o Dart regenerado
**Bloqueios:** nenhum — a D-25 foi decidida pelo usuário (as duas formas da lista)

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-06 | 6/6 | ✅ |
| [F1](F1-sessions.md) | B-07…B-13 | 7/7 | ✅ |
| [F2](F2-rendering.md) | B-14…B-24 | 11/11 | ✅ |
| [F3](F3-diffs.md) | B-25…B-31 | 0/7 | 🔲 |
| [F4](F4-chat-panel.md) | B-32…B-43 | 0/12 | 🔲 |
| [F5](F5-composer-and-context.md) | B-44…B-52 | 0/9 | 🔲 |
| [F6](F6-e2e.md) | B-53…B-58 | 0/6 | 🔲 |
| **Total** | **B-01…B-58** | **24/58** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 272 | 170 | 0 | 102 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 25 | 0 | 0 | 25 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-01 | F0, F1 | lint (portão 1) | `react/jsx-no-literals` no separador `·`; `no-restricted-imports` de `AppError` em componente; `set-state-in-effect` no `useResumeSession`; complexidade acima de 10 no gravador de fixtures | separador virou chave de i18n; o tipo do erro passou a vir do hook; `useResumer` sem efeito que muda estado; o gravador partido em funções | verde |
| 2 | 2026-10-01 | F1 | `i18n:check` | chaves do web com profundidade diferente de três segmentos (`sessions.group.running.title`) | grupos e origens em `sessionsGroup.*`, `sessions.openedFrom.*`, `sessions.rowOrigin.*` | verde |
| 3 | 2026-10-01 | F1 | integração do web | o `PanelLocation` navegava sem necessidade e derrubava o S-102 do plano 06 (`FolderTabs`) | só navega quando o painel difere do endereço | verde |
| 4 | 2026-10-01 | F2 | unit + integração do web | 18 testes do redutor antigo (cartão de tool, `session.screen.turn`) | testes reescritos para a linha compacta de tool e o resumo do turno; o redutor juntando blocos do mesmo `messageId` corrigiu texto perdido quando um `tool_use` chegava depois | verde |
| 5 | 2026-10-01 | F2 | cobertura (web) | 23 arquivos abaixo de 90 % — ramos inalcançáveis (`?? ''` em `split`, `isValidElement` no `<pre>`) e ações sem teste | ramos inalcançáveis removidos por desenho; testes das ações da view, do bloco colorido, da busca por teclado, do menu de contexto; `scripts/coverage-gaps.mjs` para ler as lacunas | verde |
| 6 | 2026-10-01 | F2 | lint (portão 1) | complexidade 11 no `fromSystem` do mapper e no `main` do `coverage-gaps` | subtipos silenciosos num `Set`; impressão separada | verde |
| 7 | 2026-10-01 | F2 | duplicação | 13 clones (redutor, linhas da view, rótulos de tool, `folded`, casos de uso do transcript, geradores de contrato) | `withMessage`/`aboutMessage` no redutor, `ActionRow`/`rowAction`, `subagentLabel`, `shared/lib/folded`, `TranscriptAudience` (cerca + atividade comuns à listagem e à leitura), `boundedFields` nos geradores | verde |
| 8 | 2026-10-01 | F2 (B-20) | formatação (portão 1 do `verify:full`) | `task-list.ts` e `tool-labels.ts` escritos depois da última passada do Prettier | `prettier --write` nos dois; `verify:full` de novo do portão 1 | verde |
| 9 | 2026-10-01 | F2 (B-20) | cobertura (portão 7 do `verify:full`) — S-58 do `run-e2e-local` | containers e volume parados de `remote-claude-e2e-*` e `remote-claude-spec-*`, deixados pelo `verify:full` anterior, interrompido no meio dos testes de integração dos scripts | os dois projetos órfãos removidos (containers, volumes, redes); nenhum código mudou; `verify:full` de novo do portão 1 | verde |
| 10 | 2026-10-01 | F2 | e2e (portão 9) — 07·S-283, S-284, S-355; 04·S-46, S-47 | helpers do e2e descreviam a tela antiga: `claudeWrites` (fixture) esperava `Last turn cost`; `messagesOn` contava todo item da conversa, que agora lista também as tools e o fim de cada turno; o "Opened here" casava primeiro com a opção escondida do filtro da view | `claudeWrites` espera mais um resumo de turno; `messagesOn` conta só `li[data-message-id]` e `messagesIn` conta mensagens por id; a S-46 confere a descrição do leitor, que só ele tem (o "Opened here" aparece também na linha e no filtro da view, no mesmo painel). De passagem, a 02·S-53 comparava as duas linhas do tempo antes do `session.statusChanged` que segue o fim do turno chegar ao telefone — corrida antiga, agora espera as duas terem o mesmo tamanho | verde (`pnpm test:e2e` 88/88) |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-01 | O `tool.completed` das `Task*` leva o `taskId` estruturado | o `TaskCreate` só tem `id` no resultado; o `summary` é texto do CLI cortado em 200 caracteres, e a numeração continua entre sessões — nem o texto nem a ordem servem | B-20; [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) quando a B-20 for feita |
| 2026-10-01 | D-25 revista e fechada: a lista de tarefas existe, escondida pelo CLI 2.1.268+ para modelos depois do Opus 4.7; `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` a liga, e o painel lê `TodoWrite` e `Task*` | o spike da F0 tinha gravado só com `claude-opus-5`; três fixtures novas mostram as duas formas e que o modelo não escolhe entre elas | B-20, S-85…S-87; [discovery §10.8](../../discovery/01-descoberta-claude-agent-sdk.md) |
| 2026-10-01 | O padrão da lista de tarefas é a forma atual do CLI, as `Task*`: o backend não define `CLAUDE_CODE_ENABLE_TASKS`, e o `.env.example` documenta, comentada, a única troca possível (`0` → `TodoWrite`); o `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` fica fixo no código | pedido do usuário: usar a forma mais nova como padrão e deixar documentado o que for preciso | B-20, D-25, `.env.example` |
| 2026-10-01 | No histórico, o `taskId` de um `TaskCreate` sai do **texto** completo do resultado (`Task #N created successfully`), e ao vivo do resultado estruturado | medido: `getSessionMessages` devolve só `type, uuid, session_id, message, parent_tool_use_id, parent_agent_id, timestamp` — sem `tool_use_result` —, e sem o id a lista não se reconstrói na recarga (S-87). A leitura é uma expressão só, no mapper, testada contra a gravação `task-tools-turn`; um CLI que mude a frase faz o histórico das `Task*` cair na tool genérica, nunca quebrar | B-20, [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#a-lista-de-tarefas--todowrite-e-task) |
| 2026-10-01 | Clicar numa conversa do histórico a abre **para ler** no painel, e "Continuar" (ou "Copiar e continuar") retoma — em vez de retomar no clique | retomar no clique gasta uma das 10 sessões da instalação para quem só queria ler, e o fork de uma externa precisa da confirmação da S-42 de qualquer forma | B-10, S-39…S-42 |
| 2026-10-01 | O subagent do histórico é lido por `GET /transcripts/:sessionId/subagents/:toolUseId/messages`, pelo `toolUseId` do `Agent` — não pelo `agentId` | o painel tem o `toolUseId`; o `agentId` só o SDK conhece, e o backend o resolve com `listSubagents` + `getSubagentMessages` (casando `parent_tool_use_id`) | B-03, B-21; [03-modules](../../architecture/backend/03-modules.md) |
| 2026-10-01 | A "saída viva" do `Bash` (B-18) é o tempo decorrido enquanto roda, e a saída colorida é o `summary` do `tool.completed` | medido: o `tool_progress` do SDK traz `elapsed_time_seconds`, não a saída; o `tool.progress` substitui o anterior em vez de acumular | B-18, S-77…S-81 |
| 2026-10-01 | A duração do thinking ("pensou por *n* s") existe só ao vivo; do histórico, "pensou" | o transcript não guarda instante por bloco | B-19, S-82, S-84 |
| 2026-10-01 | O esforço vai no `session.start.effort`; não há `session.setEffort` | D-16 medida: `applyFlagSettings` no meio da sessão reinicia a query e perde os hooks — o `PreToolUse` deixaria de valer | B-02; [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) |
| 2026-10-01 | O SDK é aberto com `thinking: {type: 'adaptive', display: 'summarized'}` e `forwardSubagentText: true` | sem eles o thinking vem vazio e o subagent não manda texto (discovery §10) | B-19, B-21 |
| 2026-10-01 | O gravador de fixtures limpa as variáveis de sessão do Claude Code pai (`CLAUDE_CODE_*`, `CLAUDECODE`, `CLAUDE_PID`…) | gravado de dentro do VSCode, o CLI filho herdava o entrypoint e as ferramentas da extensão. **O `claudeEnvironment` do backend tem o mesmo risco e não foi mudado** — fica para o plano de endurecimento | B-06 |
| 2026-10-01 | S-31, S-50 e S-80 passaram de integração para unit | S-31: duas requisições HTTP não se sobrepõem de forma determinística — o single-flight é provado no adapter; S-50 e S-80 são regras de função pura (dedupe de linha, `tool.progress` que substitui) | [scenarios](scenarios.md) |
| 2026-10-01 | S-12 verificado regravando: as 15 fixtures do painel foram regravadas nesta fase, depois da limpeza do ambiente, e os testes não mudaram | regravar exige o Claude real e não roda no CI | B-06, S-12 |
| 2026-10-01 | A busca destaca a **mensagem** da ocorrência, não o trecho; "buscar em toda a conversa" existe no leitor do histórico, que pagina | marcar dentro do markdown renderizado reescreveria a árvore do renderizador seguro | B-24, S-101 |
| 2026-09-28 | As 23 decisões em aberto respondidas pelo usuário, uma a uma; todas seguem a recomendação | as fases dependiam delas para começar | [decisions.md](decisions.md) D-01…D-24; nenhuma tarefa ou cenário mudou. Provisórios até o spike ou a medida: a sintaxe da referência (D-01), a imagem entrar (D-02), a fila segurada (D-14), o esforço no meio da sessão (D-16), a janela de 120 s (D-06), o encaminhamento de subagent (D-15) e o limiar de 25 % (D-23) |
| 2026-09-28 | D-11 fechada pela D-11 do plano 06 (sessões das abas inativas continuam anexadas); B-12 reescrita e D-24 aberta, porque o 06 removeu `/sessions/$id` e `/history…` sem deep link (06 · D-07); a B-12 e a B-56 recebem de volta os cenários de e2e de histórico e retomada que o 06 tirou do web | decisões do usuário no plano 06, em 2026-09-28 | [decisions.md](decisions.md) D-11, D-24; B-12, B-56; S-52…S-54, S-266 |
| 2026-09-26 | O composer e o contexto viraram fase própria (F5), e o e2e passou a F6 (`F5-e2e.md` → `F6-e2e.md`) | pedido explícito do usuário: escolher o contexto do prompt como no plugin do Claude (`@`, arrastar, `/` para comando ou skill, autocomplete) — uma fase é a unidade de validação, e o composer é uma fronteira de segurança | as fases F5 e F6, as tasks B-44…B-58 e os cenários S-197…S-272 |
| 2026-09-26 | Skills carregam de projeto, usuário e sistema; as de usuário e sistema pelo plugin local do plano 11 | decisão do usuário; mantém o `settingSources: ['project']` do ADR-011 | B-50, S-241…S-243, S-272 |
| 2026-09-26 | O `@problemas` saiu, e nada aqui depende de inteligência de linguagem, depuração ou git | decisão do usuário: esses planos foram removidos | B-48, "Não entra" |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-01 | `MultiEdit` das fixtures (S-11) | o CLI 2.1.277 não tem a tool; `Edit` e `Write` cobrem as edições | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Markdown do modelo como vetor de exfiltração (imagem remota, link perigoso) | 🔲 aberto | mitigado por desenho na B-14 |
| R-02 | "Ativa em outro lugar" é heurística | 🔲 aberto | D-06 mede o intervalo real de escrita |
| R-03 | Subpastas no histórico custam a varredura do store inteiro | 🔲 aberto | D-05 |
| R-04 | Teto de 10 sessões da instalação esgotado por abas e conversas | 🔲 aberto | D-07, D-09, D-13 |
| R-05 | A referência lê o disco, não o buffer sujo | 🔲 aberto | aviso no chip (B-51) |
| R-06 | A prévia do diff na permissão pode ficar velha | 🔲 aberto | relida ao focar (B-29) |
| R-07 | Interfaces dos planos 06, 07 e 09 ainda não existem em código | 🔲 aberto | divergência vira decisão registrada |
| R-08 | Imagem pelo streaming input não medida; frame de 64 KB | 🔲 aberto | D-02 |
| R-09 | Peso de markdown, realce, ANSI e composer no bundle | 🔲 aberto | medir na B-14 |
| R-10 | `@caminho` expandido pelo CLI sem `PreToolUse` | 🔲 aberto | **confirmado pelo spike (discovery §10)**: um `@arquivo` no texto do prompt é lido pelo CLI sem `Read` e sem auditoria — isso já vale hoje. A B-44 o neutraliza; até lá, é um buraco conhecido |
| R-11 | Rejeitar trecho escreve no disco com três versões em jogo | 🔲 aberto | D-08 |
| R-12 | Subagents encaminhados enchem o ring buffer | 🔲 aberto | D-15 |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
