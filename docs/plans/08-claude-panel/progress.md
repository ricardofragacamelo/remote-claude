# Plano 08 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F3 e F4 concluídas (implementadas juntas, a pedido do usuário, com o portão completo só ao fim da F4) — a F5 é a próxima
**Última atualização:** 2026-10-02
**Validação:** `pnpm verify:full` de 2026-10-02 com os onze portões verdes (saída 0; e2e 88/88), depois dos ciclos 11–14
**Bloqueios:** nenhum — a D-25 foi decidida pelo usuário (as duas formas da lista)

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
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
| [F3](F3-diffs.md) | B-25…B-31 | 7/7 | ✅ |
| [F4](F4-chat-panel.md) | B-32…B-43 | 12/12 | ✅ |
| [F5](F5-composer-and-context.md) | B-44…B-52 | 0/9 | 🔲 |
| [F6](F6-e2e.md) | B-53…B-58 | 0/6 | 🔲 |
| **Total** | **B-01…B-58** | **43/58** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 272 | 76 | 0 | 196 | 0 |

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
| 11 | 2026-10-02 | F3 | unit (portão 6 do `verify`) — `test/unit/contracts-guards.spec.mjs` | o teste que lista todo tipo de frame do contrato não tinha o `session.restoreChange`, comando novo da F3 | o tipo entrou na lista; nenhum código mudou; `verify` de novo do portão 1 | verde |
| 12 | 2026-10-02 | F3 | cobertura do backend (portão 7 do `verify`) | `node-undo.disk.ts` com 89,18 % dos ramos (os de `read`/`write`, novos da F3) e o `audit-tool-invocation.recorder.ts` com 85,71 % (a memória das tools, nova da F3) | testes de integração do disco para os ramos de leitura e escrita, e unit do recorder; nenhum código mudou; `verify` de novo do portão 1 | verde |
| 13 | 2026-10-02 | F4 | cobertura do backend (portão 7 do `verify:full`) | `installation-mapping.ts` e `transcript-module-conversation.source.ts` com 85,71 % dos ramos: o mapeamento só era exercido pelo runner, sem modelo sem níveis de esforço, categoria de tipo desconhecido nem servidor de status desconhecido; o `chainOf` de conversa que o store não tem não tinha teste | unit do mapeamento e o `chainOf` vazio; nenhum código mudou; `verify:full` de novo do portão 1 | verde |
| 14 | 2026-10-02 | F4 | e2e (portão 9) — 04·S-46 | o `send` do e2e procurava o botão `Send` por nome parcial, e o "Editar e enviar de novo" da B-35, novo em cada prompt, também casa; os outros 87 passaram, já com a sessão nascendo do primeiro prompt do rascunho | o nome do botão passou a ser exato em todo o e2e; nenhum código do produto mudou; `verify:full` de novo do portão 1 | verde |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-02 | Atalhos do painel: `Mod+Alt+N` nova conversa, `Mod+Alt+L` focar o prompt, `Mod+Alt+I` interromper, `Mod+Alt+]`/`Mod+Alt+[` próxima e anterior, `Mod+Alt+G` alterações; abrir e fechar o painel é o `Mod+Alt+B` do workbench (`workbench.toggleSecondarySideBar`). Ficam no `PanelCommands`, ao lado da casca da aba, e não dentro do painel | o navegador guarda `Ctrl+N`/`Ctrl+Tab` (06 · D-16); o `Mod+Alt` não colide com o editor nem com a paleta. Dentro do painel os comandos sumiam com ele fechado — e "focar o prompt" é justamente como um painel fechado abre (S-185) | B-40; [web/03](../../architecture/web/03-ui-system.md) |
| 2026-10-02 | O `ModelCatalog` (um `InstallationCache` por versão do CLI e workspace) responde o `GET …/models` **e** o `session.start` que traz `effort`: o esforço é recusado só quando o catálogo conhece o modelo e ele não aceita aquele nível; modelo que a lista não nomeia passa, e o CLI decide | a lista é descoberta, não fronteira (como o menu de comandos do plano 04); recusar um modelo por id completo que a lista nomeia só por alias seria recusar o que funciona | B-36, S-167, S-171 |
| 2026-10-02 | Reenviar a partir do **primeiro** prompt da conversa abre uma conversa nova, sem `resume` — não há o que manter antes dele | o `resumeSessionAt` precisa de uma mensagem para guardar; o fork do começo é uma conversa vazia com o mesmo prompt (S-165) | B-35 |
| 2026-10-02 | A fila de prompts vive no domínio (`PromptQueue` dentro de `Session`): `promptedBy` é o **tipo** de cliente (`web`·`mobile`), o `preview` tem 120 caracteres, e as últimas 200 saídas são lembradas para responder "cancelar de novo" com `ack` sem efeito | a fila é regra de negócio da sessão (D-14), testável sem Nest; lembrar todas as saídas cresceria sem fim | B-34, S-156…S-160; [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#a-fila-de-prompts) |
| 2026-10-02 | Os avisos de pergunta em aba que ninguém olha e as notificações do navegador ouvem o socket por um método novo do `wsClient`, `onSessionFrame`, e não pelo `observe` | o `observe` só ouve o que **não** pertence a sessão anexada — e o painel mantém toda sessão anexada (D-11): pelo `observe`, nenhum aviso chegaria nunca | B-42, S-188…S-193; [web/04](../../architecture/web/04-state-and-data.md#wsclient--dono-do-socket-um-por-app) |
| 2026-10-02 | A notificação do navegador guarda o "ligado" no armazenamento do visitante (`session.browserNotifications`), e qualquer valor que não seja `true` é desligado | ligar é ação explícita da pessoa (D-21); um valor estranho não pode ligar por ela | B-42, S-192 |
| 2026-10-02 | O rascunho que o teto recusa recebe o texto de volta e remonta a caixa de prompt; o texto do rascunho mora no store do painel (`drafts`, por aba do painel), não mais no `draft` da aba de pasta, que saiu | o composer limpa ao enviar; sem devolver, a S-153 perdia o prompt. E um rascunho por conversa do painel substitui o único rascunho da aba | B-33, S-147, S-153 |
| 2026-10-02 | O `SessionStarter` (o botão "Abrir sessão") e o `useSessionStarter` saíram; o e2e abre sessão pelo primeiro prompt do rascunho (`sendFirstPrompt`/`openFromDraft`), com uma gravação que só responde (`image-turn`) | a D-07 tirou o botão: a sessão nasce no primeiro prompt. A gravação de abertura não chama tool nem escreve arquivo, e responde uma palavra que nenhum cenário procura; os testes que contavam turnos passaram a contar o de abertura | B-33; `e2e/fixtures/workbench.ts` |
| 2026-10-02 | A fixture `installation.json` (modelos, MCP e uso de contexto) foi gravada do CLI real pelo gravador estendido, sem gastar turno | o fake responde `supportedModels`/`getContextUsage`/`mcpServerStatus` com o que a instalação de verdade respondeu, como as outras gravações | B-36…B-38; `scripts/record-agent-sdk-fixtures.mjs` |
| 2026-10-02 | S-191 verificado contra a configuração que o repositório traz: `RC_WS_MAX_ATTACHED_SESSIONS` do `.env.example` (16) cobre `RC_SESSION_MAX_CONCURRENT` (10), num teste do backend | uma regra no schema derrubaria a integração dos limites, que de propósito anexa menos do que roda; o que a S-191 pede é que a instalação padrão comporte as dez | B-42, S-191 |
| 2026-10-02 | F3 e F4 implementadas juntas, a pedido do usuário: entre as fases só os portões básicos (`verify`, integração do que mudou), e o `verify:full` uma vez, ao fim da F4 | pedido explícito do usuário ("só rodar quality gate full depois que finalizar a F4") | F3, F4 |
| 2026-10-02 | **Comando novo `session.restoreChange { sessionId, path }`** — o desfazer da rejeição (de trecho ou de arquivo) | a D-08 pede "desfazer em vez de confirmar", e nenhum comando da F0 desfazia: pela API de arquivos do plano 07, o arquivo voltaria mas a linha de base da sessão não, e ele passaria a aparecer como `modifiedOutside` — os trechos dele deixariam de se rejeitar. O backend guarda em memória, com a sessão viva, o que a última rejeição de cada arquivo substituiu, e devolve byte a byte enquanto o arquivo ainda é o que a rejeição deixou (`SESSION_CHANGE_STALE` se não; `NOT_FOUND` sem rejeição). Contrato nas três pontas (schema, TS e Dart gerados), o app não usa | B-31, S-142; [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos) |
| 2026-10-02 | Os caminhos das alterações (`changes`, `changes/file`, `rewindFiles.paths`, `rejectChange`, `restoreChange`, o diff de tool) são **absolutos**, como os do desfazer do plano 04 | o desfazer, o `session.rewound` e o journal já nomeiam absoluto; relativo à pasta da sessão seria um segundo jeito de nomear o mesmo arquivo, e uma sessão de subpasta muda a base. O web converte para relativo à pasta da aba na hora de mostrar e de abrir no editor | B-25…B-31; [backend/03](../../architecture/backend/03-modules.md#session) |
| 2026-10-02 | O input das tools que o diff usa fica na `SessionChangeMemory` (aplicação, em memória, por objeto de sessão — some com ela), alimentada pelo recorder do `PreToolUse` depois que a trilha gravou | a trilha é só de escrita para os outros módulos (backend/03 · audit); um segundo store persistido seria o "depois" que a D-03 recusou. Teto de 2 000 invocações e 16 M caracteres de input por sessão: a que sai do teto responde `TOOL_USE_NOT_FOUND` | B-25 |
| 2026-10-02 | A lista de alterações leva `revision` por arquivo, e a marca de "aceito" é do par caminho + `revision` | sem a versão, aceitar um arquivo e o Claude mudá-lo de novo deixaria a mudança nova escondida como revisada | B-28, S-125 |
| 2026-10-02 | Arquivo que voltou a ser o que era antes da sessão sai da lista de alterações; `changes/file` dele responde com `kind: null` e sem trechos (não `404`) | o caminho continua sendo da sessão — o `404` é para o que ela nunca tocou | B-26 |
| 2026-10-02 | O editor ganhou um lado de diff `provided` e o registro `diffSources` | a aba de diff do plano 07 lia só disco, buffer e histórico; o antes de uma tool e o antes da sessão vêm do backend da sessão, e o editor não pode conhecer sessão. Uma aba com lado `provided` não sobrevive à recarga, como a com `buffer` | B-27, B-28; [web/03](../../architecture/web/03-ui-system.md) |
| 2026-10-02 | O `setup.ts` dos testes do web importa o store das sessões por caminho, não pelo barrel | o barrel da sessão passou a carregar o do editor, que registra a seção "Editor" das Configurações ao ser importado — todo teste do web a via, e o teste das seções padrão do plano 06 falhava | testes do web |
| 2026-10-02 | O fake roteirizado executa também `Edit` e `MultiEdit` (antes só `Write`) | o diff e o rejeitar são sobre o disco; um replay que não editava nada não tinha o que mostrar | `test/fakes/agent-sdk` |
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
