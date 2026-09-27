# F4 — Painel de chat

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-diffs.md), e da secondary side bar, da activity bar, da status bar e das abas de
pasta do [plano 06](../06-workbench/README.md).
**Entrega:** o painel do Claude **dentro** da aba de pasta, ao lado do explorer e do editor: conversas
em abas, a sessão que nasce no primeiro prompt, a fila de prompts, editar e reenviar, os seletores de
modelo, modo e esforço, o medidor de contexto com `/compact`, o status dos MCPs da sessão, exportar, os
atalhos, a status bar, os badges e as notificações de permissão, e a ajuda.

**Decisões que precisam estar fechadas para começar:** D-07, D-09, D-11, D-13, D-20 e D-21
([decisions.md](decisions.md#f4--painel-de-chat)), e as D-14, D-16 e D-19 da F0.

---

## O chat, o explorer e o editor na mesma aba

O usuário confirmou: **o chat do Claude, o sistema de arquivos e o editor ficam na mesma aba**. O painel
não é uma tela: é a secondary side bar da aba de pasta, visível ao mesmo tempo que a árvore e o editor a
partir de `md` — e, em tela pequena, uma das views da barra de abas do plano 06. É isso que faz "abrir
diff", "inserir no editor", "adicionar seleção ao chat" e os caminhos clicáveis serem um gesto, não uma
navegação.

E por isso o estado do painel é **da aba de pasta**: store chaveado pela pasta, nunca global
([web/04](../../architecture/web/04-state-and-data.md#websocket--o-stream-ao-vivo), atualizado na B-05).
A `SessionScreen` de hoje se desmonta em peças do painel; `CommandMenu`, `UndoPanel` e a carga de
histórico (`useConversationHistory`) são reaproveitados, não reescritos.

O composer e o conjunto de contexto são a [F5](F5-composer-and-context.md) — aqui o painel usa o
`PromptComposer` de hoje, que a F5 substitui.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-32 — O painel na aba de pasta, e as conversas em abas 🔲

Painel na secondary side bar, redimensionável, que abre e fecha sem perder estado. Conversas da pasta
em abas do painel (abrir, alternar, reordenar, fechar); a lista completa é a view da F1. Fechar a aba de
conversa **não** encerra a sessão, e diz isso; encerrar é ação separada, do dono
([multi-cliente](../../architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão)).
Fechar a **aba de pasta** também não encerra — as sessões vivem no backend — e reabrir a pasta as mostra
em "em execução aqui". A mesma sessão aberta em duas abas de pasta (pasta e subpasta) usa **um**
`session.attach` do `wsClient`, com as duas views coerentes; fechar uma não desanexa a outra.

### B-33 — A sessão nasce no primeiro prompt 🔲

Pela D-07: "nova conversa" é rascunho do cliente, sem subprocesso (~222 MB cada,
[§8.5](../../discovery/01-descoberta-claude-agent-sdk.md#85--custo-de-recurso-por-sessão)). O primeiro
envio faz `session.start` na pasta da aba, com o modelo, o modo e o esforço escolhidos no rascunho, e no
`session.started` manda o `session.prompt` com o contexto. Recusa (`SESSION_LIMIT_REACHED`, com o que a
D-09 manda dizer) mantém texto e contexto no rascunho. Enter repetido abre uma sessão só; fechar o
rascunho não deixa nada no backend.

### B-34 — A fila de prompts, visível e cancelável 🔲

Pela D-14: o prompt que chega durante um turno fica na fila **do backend**, em ordem de chegada, de
qualquer cliente; `prompt.queued`/`prompt.dequeued` chegam a todos os observadores, e o painel mostra a
fila acima do composer com posição e autor. Cancelar (`session.cancelQueuedPrompt`) tira o prompt antes
de chegar ao Claude; cancelar o que acabou de começar → `CONFLICT` (`session.error.queuedPromptStarted`);
cancelar de novo → `ack` sem efeito; id desconhecido → `QUEUED_PROMPT_NOT_FOUND`. A fila é da sessão: o
desfazer em curso continua recusando prompt com `SESSION_LOCKED`
([desfazer](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos)).

### B-35 — Editar e reenviar a partir de uma mensagem 🔲

Pela D-19: "editar" num prompt anterior abre o texto no composer; enviar faz `session.start {
resumeSessionId, forkAt }`, que o backend traduz para `resume` + `resumeSessionAt` + `forkSession` +
`resumeDropsTurn`, resolvendo o ponto pelas funções do SDK. A conversa bifurca num id novo e a original
continua legível no histórico. O reenviar oferece também desfazer os arquivos para antes daquele turno
(o desfazer do plano 04), desligado por padrão, porque o fork não leva o histórico de undo. Ponto que não
é da conversa → `INVALID_INPUT` (`session.error.forkPointUnknown`); recusa do CLI →
`SESSION_FORK_REJECTED`, com a retomada simples oferecida e sem repetir o fork — o SDK avisa que a
recusa é determinística. "Bifurcar daqui" (sem editar) está no menu de contexto da mensagem.

### B-36 — Modelo, modo e esforço da sessão 🔲

No cabeçalho do composer:

- **Modelo** — a lista vem do `supportedModels()` **da instalação**, nunca de uma constante
  (`GET /sessions/:sessionId/models`, pelo catálogo do plano 04 chaveado por versão do CLI e workspace;
  duas sessões juntas, uma chamada). `displayName` e `description` são dado da instalação, como a
  descrição de slash command. Trocar manda `session.setModel`. Lista indisponível → mostra o modelo
  atual e o composer segue. No rascunho, pela D-13.
- **Modo** — padrão, aceitar edições e plan, com o que cada um significa por extenso; **nunca**
  `bypassPermissions`: ele existe no contrato, mas `allowDangerouslySkipPermissions` é `false` sempre
  ([options](../../architecture/backend/04-claude-integration.md#options--o-que-amarramos)), então
  oferecê-lo seria prometer o que não existe. "Aceitar edições" avisa que Edit/Write deixarão de pedir
  aprovação — e de mostrar a prévia da B-29. Troca por `session.setPermissionMode`.
- **Esforço** — pela D-16, só para modelo com `supportsEffort`, com os níveis dele; nível fora da lista
  → `INVALID_INPUT` (`session.error.effortUnsupported`).

Os **padrões** (modelo, modo e esforço de uma sessão nova) são do
[plano 11](../11-claude-settings/README.md); o seletor daqui é o da sessão.

### B-37 — Medidor de contexto e `/compact` 🔲

`GET /sessions/:sessionId/context` (o `getContextUsage()` da sessão viva) alimenta um medidor compacto
no painel — uso da janela por categoria (sistema, ferramentas, mensagens, memória), aviso perto do
limite —, relido a cada `turn.completed`. "Compactar" manda `/compact` como prompt (o comando da
instalação, pelo fluxo normal), e a conversa mostra o marco do `session.compacted`. Uso indisponível →
o medidor some com o motivo no tooltip.

### B-38 — Status dos MCPs da sessão 🔲

`GET /sessions/:sessionId/mcp-servers` reduz o `mcpServerStatus()` a nome, status (conectado, falhou,
precisa auth, pendente, desligado) e contagem de tools — **nunca** `config` (pode ter URL com token) nem
`error` cru. O indicador compacto mostra quantos estão bem e quais não; sem servidores, some. Configurar
servidor é do [plano 11](../11-claude-settings/README.md): o indicador leva à tela dele quando ela
existir, e até lá não oferece link morto.

### B-39 — Exportar a conversa 🔲

Pela D-20: gerado **no cliente**, a partir das páginas do transcript que a pessoa já lê — todas, com a
barra de progresso —, em markdown: mensagens, thinking recolhido, tools compactas com o input; saída de
tool só com a opção ligada (desligada por padrão). Falha no meio não baixa arquivo pela metade.

### B-40 — Teclado e atalhos 🔲

Esc no composer com turno em execução manda `session.interrupt` — mas com menu, autocomplete ou diálogo
aberto, Esc fecha o que está aberto e não interrompe. Esc repetido manda um interrupt só. Atalhos
registrados no registro de comandos do plano 06, visíveis na command palette: abrir/fechar o painel,
nova conversa, focar o composer, interromper, próxima/anterior conversa, abrir "Alterações".

### B-41 — Status bar 🔲

Item da status bar da aba ativa: status da sessão ativa, modelo e custo da sessão (B-23); clicar foca o
painel. Troca com a aba e com a conversa; sem conversa ativa, some.

### B-42 — Permissão nunca se perde: badges e notificações 🔲

Pedido de permissão com o painel escondido → badge na activity bar e aviso anunciado (`aria-live`).
Pedido de sessão de **aba inativa** → badge **na aba de pasta** e aviso global; clicar leva à aba, à
conversa e ao card. Resolvido noutro dispositivo, o badge sai. Pela D-11, as sessões vivas das abas
inativas continuam anexadas — é o que faz o pedido chegar —, e as dez que a instalação comporta cabem no
`maxAttachedSessions` ([limites por connection](../../architecture/shared/05-websocket-protocol.md#limites-por-connection)).

Notificação do navegador pela D-21: ligada por ação explícita, só com a página escondida, quando um turno
termina ou uma permissão é pedida, dizendo a pasta e o tipo — nunca o comando. Permissão do navegador
negada → o painel explica como reativar e segue com o badge.

### B-43 — Usabilidade e ajuda do painel e da view "Alterações" 🔲

A gaveta de ajuda (screen frame do plano 06), em en e pt-BR, para quem nunca viu o produto: os modos e o
que cada um deixa de perguntar; a fila; editar e reenviar (e que os arquivos não voltam sozinhos);
aceitar × rejeitar e o que rejeitar preserva; o medidor e o `/compact`; o que não é gravado (conteúdo de
arquivo, mensagens — a trilha guarda a tool e o input). Estado vazio que ensina a primeira conversa, o
`@`, o `/`, o arrastar e o atalho. Tooltip e nome acessível em todo controle de ícone; foco e teclado
percorrem painel, cards e diff; axe sem violação; `i18n:check` verde.

---

## Cenários cobertos

S-145…S-196.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
