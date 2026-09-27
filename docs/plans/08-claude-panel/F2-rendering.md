# F2 — Renderização

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-sessions.md).
**Entrega:** a conversa se lê como na extensão do Claude para o VS Code — markdown seguro, código
com realce, caminhos que abrem no editor, tools compactas e legíveis, saída viva do `Bash`, thinking,
a lista de tarefas, subagents aninhados, o card de aprovação de plano, o status e o resumo de cada
turno, e copiar/buscar na conversa.

**Decisões que precisam estar fechadas para começar:** D-04 e D-17
([decisions.md](decisions.md#f2--renderização)), e a D-15 da F0 para a B-21.

---

## Por que a renderização é uma fase

Hoje a `Conversation` mostra `whitespace-pre-wrap` e o `ToolCard` despeja o input. Trocar isso é
trocar **o redutor de eventos e os componentes que os desenham**, e é o que as fases de diff (F3) e de
painel (F4) vão usar. E há uma razão de segurança para isolar: o markdown vem do modelo, que leu
arquivos e páginas que ninguém revisou — ele é **conteúdo não confiável**, e a regra de como
desenhá-lo precisa estar pronta e testada antes de tudo que o exibe.

O histórico (`GET /transcripts/:id/messages`) sai das **mesmas** funções do mapper que o stream
([backend/03](../../architecture/backend/03-modules.md#transcript)); então thinking, tarefas e
subagent aparecem iguais vivos e recarregados, com um redutor só.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — Markdown seguro, incremental 🔲

Pela D-04: sem HTML cru (escapado, nunca elemento), URL só `http`, `https`, `mailto` e caminho
relativo, **imagem remota nunca carregada** — vira link com o endereço à vista, porque uma imagem é o
jeito mais barato de uma injeção de prompt exfiltrar dado por URL (R-01). Link externo em nova aba com
`rel="noopener noreferrer"`. Markdown incompleto do delta (bloco aberto) renderiza sem quebrar; só a
mensagem em voo re-renderiza, com orçamento por quadro, e o `message.completed` substitui o acumulado
([o store de stream](../../architecture/web/04-state-and-data.md#o-store-de-stream)). Carregado sob
demanda, com o bundle medido no celular.

### B-15 — Bloco de código: realce, copiar, inserir no editor 🔲

Realce pela D-04 (o do editor do [plano 07](../07-explorer-and-editor/README.md), se ele o oferecer);
linguagem ausente ou desconhecida cai em monoespaçado. Copiar copia o conteúdo exato, e a confirmação
é anunciada. "Inserir no editor" escreve no cursor do editor **ativo da mesma aba de pasta**, deixando
a aba suja — nunca grava no disco; sem editor aberto, o botão fica desabilitado com a razão no tooltip.

### B-16 — Caminhos de arquivo viram links 🔲

Caminho relativo ou absoluto no texto e no código inline, com ou sem `:linha`, que resolve **dentro da
pasta aberta**, vira link que abre o arquivo no editor na linha. Fora da pasta, URL ou prosa com barra
fica texto. A detecção é do cliente; abrir passa pela API de arquivos do plano 07, então arquivo que
sumiu responde o `FILE_NOT_FOUND` dele, traduzido, sem derrubar o painel.

### B-17 — Tools compactas, no estilo da extensão 🔲

Uma linha por tool, com rótulo traduzido e o sujeito relativo à pasta: "Read src/x.ts", "Edit
src/x.ts (+3 −1)", "Bash: pnpm test", "Grep 'foo' em src/", "WebFetch exemplo.com"; tool MCP
(`mcp__srv__tool`) mostra servidor e tool; tool desconhecida mostra o nome. Expandir mostra o **input
exato**, sem truncar — o título compacto pode elidir visualmente, mas o comando inteiro está no nome
acessível e a um clique. Estado vivo por ícone e texto (`started`, `succeeded`, `failed`, `denied` com o
motivo). O card de **permissão nunca é compactado**: ali a pessoa autoriza execução na própria máquina
([permissão](../../architecture/web/03-ui-system.md#permissão--a-tela-mais-importante)). "Ver na
trilha" leva à entrada da tool em `/audit`.

### B-18 — Saída viva do `Bash`, com ANSI seguro 🔲

`tool.progress` acumula por `toolUseId`, descartando chunk reentregue (seq). ANSI vira cor por token
pelos tokens de tema — nunca HTML —, e OSC 8, título de janela e sequência desconhecida são
descartados. Teto de exibição: acima dele, mostra o fim e "mostrar tudo". Rolagem segue a regra do
stream: acompanha só quem está no fim. É esta saída que o painel "Saída" do
[plano 10](../10-integrated-terminal/README.md) reaproveita.

### B-19 — Thinking 🔲

O mapper deixa de descartar os thinking deltas (a decisão escrita no código muda na B-02) e passa a
emiti-los com `blockType: 'thinking'`; o bloco completo vai no `content[]`. Na tela, pela D-17:
recolhido por padrão, com "pensou por *n* s"; thinking redigido mostra que existiu, sem inventar
conteúdo. No log, só o tamanho.

### B-20 — A lista de tarefas do `TodoWrite`, viva 🔲

Cada `tool.started` de `TodoWrite` traz a lista inteira (`todos` com conteúdo, estado e forma ativa).
O painel mostra a lista mais recente fixada no topo da conversa — pendente, em andamento, concluída —,
com a transição visível e a contagem; o histórico a reconstrói pela última chamada. Lista vazia limpa;
input fora do formato cai na tool genérica, sem quebrar. Não há contrato novo: é leitura do input.

### B-21 — Subagents aninhados 🔲

Pela D-15: com `parentToolUseId` nos eventos, texto, thinking e tools de um subagent aparecem
**dentro** do `Task` que o abriu, recolhidos, com o tipo do agente e o status; dois subagents em
paralelo não se misturam. No histórico, o conteúdo do subagent é carregado ao expandir, por
`GET /transcripts/:sessionId/subagents/:agentId/messages` — pelas funções do SDK
(`listSubagents`/`getSubagentMessages`), com as mesmas regras de leitura do `transcript` (cerca,
`404` para o que o chamador não lê, cache).

### B-22 — Modo plan: aprovar o plano 🔲

Em `permissionMode: plan`, o `ExitPlanMode` chega como pedido de permissão com o plano no input. O
card vira "aprovar plano": o plano em markdown (pela B-14), e duas saídas — **aprovar**, que resolve
`allow` e troca o modo para o escolhido (padrão ou aceitar edições, por `session.setPermissionMode`),
e **continuar planejando**, que resolve `deny` com o comentário como motivo, que volta ao Claude. É o
mesmo `permission.resolve`, com a mesma idempotência e "primeira resposta vence"
([regras](../../architecture/shared/05-websocket-protocol.md#regras-não-negociáveis)). Que o
`ExitPlanMode` passa pelo `canUseTool` é verificado na fixture da B-06; se não passar, a task fica ⛔ e
vira decisão.

### B-23 — Status, resumo do turno e custo da sessão 🔲

Indicador vivo pelo `session.statusChanged` (pensando, executando, esperando permissão — este leva ao
card). Ao fim de cada turno, o resumo do `turn.completed`: custo, duração e tokens de entrada, saída e
cache, formatados pelo idioma; turno interrompido sem `usage` mostra o que há. O custo **da sessão**
soma os turnos que esta sessão viu, sem contar replay duas vezes, e diz que é desde que a sessão abriu.
Agregados por dia, pasta e modelo são do [plano 14](../14-usage-and-cost/README.md).

### B-24 — Copiar mensagem e buscar na conversa 🔲

Copiar uma mensagem copia o markdown de origem. Buscar (Ctrl/Cmd+F com o foco no painel) destaca e
navega entre ocorrências no que está carregado; "buscar em toda a conversa" carrega as páginas antigas
do transcript. Busca durante o streaming inclui o que chega. Ações da mensagem também no menu de
contexto.

---

## Cenários cobertos

S-58…S-102.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
