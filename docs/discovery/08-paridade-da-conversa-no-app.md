# Proposta: Paridade da conversa no app, com o plano 13 e markdown nas mensagens

**Estado:** virou o [plano 26 — Paridade da conversa no app](../plans/26-mobile-conversation-parity/README.md) em 2026-10-09, rodado antes da F2 do [plano 13](../plans/13-claude-settings/README.md), que foi parada para isso. As decisões do §13 estão lá ([decisions.md](../plans/26-mobile-conversation-parity/decisions.md)), com os mesmos IDs, mais D-12 e D-13. Em 2026-10-09 o usuário decidiu as abertas: as perdas do backend (§7, D-04…D-06) saíram do plano para uma discovery própria; o link da trilha entra (D-11, lista filtrada); o indicador de MCP entra no app como chip só leitura pelo plano 13 (D-07). Nenhum código escrito.
**Criada em:** 2026-10-09, a partir de duas perguntas do usuário. A primeira: o
[plano 13 — Configuração do Claude](../plans/13-claude-settings/README.md) muda a renderização das
mensagens entre o usuário e o Claude? Ele quer saber disso sem entrar nas features do plano, porque
"não quero que o mobile perca informação e mensagens". A segunda, logo depois: "que o mobile renderize
mensagens que são MD". E a regra que fecha as duas: "que o mobile não perdesse mensagens renderizadas
no web, tanto no conteúdo quanto no formato".
**Destino:** servir de insumo para um plano em [docs/plans/](../plans/README.md), ou para uma fase
nova do plano 13 (§13, D-01). Esta proposta **não** é um plano: não tem tarefas com ID nem critério
de conclusão por comando.
**Relação com outros documentos:**

- Reabre duas exclusões:
  - o markdown no chat do app, adiado na [discovery 04 §4.9](04-historico-ao-vivo-e-fiel.md#49-outras-divergências-entre-web-e-mobile-e-a-relação-com-o-plano-10), no [plano 24 · D-21](../plans/24-structured-questions/decisions.md#f4--mobile) e no [plano 25](../plans/25-mobile-file-browser/README.md);
  - o subagent aninhado no app, que o [plano 10 · D-01](../plans/10-mobile-chat-layout/decisions.md#f0--normas) deixou fora por decisão do usuário.
- Não mexe em nada do que o plano 13 decide para a tela de configuração no web.

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [A resposta curta](#2-a-resposta-curta)
3. [Princípios](#3-princípios)
4. [Estado atual: a conversa nas três pontas](#4-estado-atual-a-conversa-nas-três-pontas)
5. [O que o plano 13 muda no que chega à conversa](#5-o-que-o-plano-13-muda-no-que-chega-à-conversa)
6. [Perdas só do app](#6-perdas-só-do-app)
7. [Perdas das duas pontas (backend)](#7-perdas-das-duas-pontas-backend)
8. [Markdown nas mensagens do app](#8-markdown-nas-mensagens-do-app)
9. [Mudanças por ponta](#9-mudanças-por-ponta)
10. [Contrato](#10-contrato)
11. [Testes](#11-testes)
12. [Fora do escopo](#12-fora-do-escopo)
13. [Decisões em aberto](#13-decisões-em-aberto)
14. [Riscos](#14-riscos)
15. [Matriz de cenários (semente)](#15-matriz-de-cenários-semente)
16. [Fatiamento sugerido](#16-fatiamento-sugerido)
17. [Referências](#17-referências)

---

## 1. O pedido

| # | Requisito | Onde é tratado |
|---|---|---|
| R1 | saber se o plano 13 muda o que aparece na conversa (mensagens do usuário e do Claude, tools, pensamento) | §2, §5 |
| R2 | o app **não perde** mensagem nem informação que o web mostra | §4, §6, §7 |
| R3 | o app **renderiza markdown** nas mensagens | §8 |
| R4 | o que o web **renderiza** numa mensagem, o app também renderiza, **no conteúdo e no formato** | §3, §6, §9, §11 |

## 2. A resposta curta

**Sim, muda.** O plano 13 não altera o contrato das mensagens: `message.delta`, `message.completed`,
`tool.*` e `turn.completed` continuam iguais. O que ele muda é o **conteúdo** que passa por esse
contrato. A partir das F2 e F3, a sessão passa a ter:

- tools MCP;
- skills de três origens;
- slash commands e subagents do projeto;
- hooks do projeto rodando;
- output styles que escrevem com mais formatação.

Cada um desses tipos cai num ponto em que o app **já** perde informação hoje:

- texto de subagent descartado;
- markdown mostrado como texto cru;
- rótulo de tool genérico.

Ou cai num ponto em que o **backend** descarta a informação para as duas pontas: mensagem de sistema,
saída de slash command, imagem em resultado de tool.

Quanto ao app, o plano 13 só promete compatibilidade de contrato
([README · Não entra](../plans/13-claude-settings/README.md#não-entra), [F4 · B-46](../plans/13-claude-settings/F4-e2e.md#b-46--smoke-live-e-compatibilidade-do-app-)).
O `pnpm test:e2e:mobile` verde prova que o app **não quebra**. Não prova que ele **mostra** o que o
web mostra. Do jeito que está escrito, o plano 13 termina verde e o app fica para trás.

**O que já está feito (F0 e F1) é seguro:**

- `session.mcpStatusChanged` chega ao app como `UnreadEvent` e o `seq` avança, então não abre buraco
  falso de replay. O teste está em [session_event_mapper_test.dart](../../mobile/test/unit/features/session/data/mappers/session_event_mapper_test.dart).
- Os campos novos de `session.started` (`effort`, `outputStyle`, `defaultsFrom`) são ignorados sem
  efeito na conversa.

## 3. Princípios

1. **Paridade de conteúdo e de formato (R4).** O app é um cliente da mesma conversa, não um resumo
   dela. Cada elemento que o web desenha numa mensagem tem um equivalente no app:
   - o texto e a estrutura do markdown;
   - o código com realce;
   - o diagrama;
   - o diff;
   - a saída colorida;
   - o rótulo da tool;
   - o aninhamento do subagent;
   - o autor;
   - os tokens do turno.

   O que se adapta é só o **layout**: largura, rolagem horizontal dentro da caixa, toque no lugar de
   hover, toque longo no lugar de menu de contexto. O que fica dobrado ou aberto por padrão é o mesmo
   do web.
2. **Divergência é bug, não escopo.** Um elemento que o web desenha e o app não só pode faltar com
   uma decisão registrada, que nomeia o elemento. Hoje não há nenhuma (§13). Não basta um comentário
   no mapper.
3. **Uma correção no backend vale para as duas pontas.** O que se perde antes do WS se corrige no
   mapper do backend, uma vez. Duplicar a correção nos dois clientes não resolve.
4. **O conteúdo do modelo não é confiável.** O markdown do chat segue as regras do `Markdown` do web
   e do leitor do plano 25:
   - HTML vira texto;
   - link só `http`, `https` ou `mailto`, com confirmação;
   - imagem remota nunca é carregada.
5. **Paridade verificada por máquina.** Um tipo de mensagem novo entra com a fixture do SDK
   roteirizado **e** com o teste do app que a desenha. Sem isso, o portão reprova (§11).

## 4. Estado atual: a conversa nas três pontas

Levantado em 2026-10-09 lendo o código: o mapper do backend, os redutores e os widgets das duas
pontas. As referências de linha estão no §17.

| Tipo | Backend emite? | Web | App | Lacuna |
|---|---|---|---|---|
| Texto do prompt | sim | markdown, rótulo "Você", copiar, editar/bifurcar/desfazer | `Text` puro, editar/bifurcar/desfazer | app: sem markdown, sem copiar |
| Imagem do prompt | marcador | na ordem dos blocos | depois do texto | app perde a ordem |
| Texto do Claude | delta + completed | `ChatMarkdown`: código com botões, nome de arquivo vira link, Mermaid | `Text` puro; vários blocos de texto colados com `''` | **a maior lacuna do app** |
| Pensamento | sim | dobra com duração | dobra com duração | paridade |
| Tool (nível de topo) | `tool.started` | rótulo por tool (caminho do Read, +/− do Edit, comando do Bash, `servidor · tool` do MCP…), cores ANSI, diff, link para a trilha | nome, ou "nome · título"; ANSI removido; sem diff; sem link | app: rótulo genérico |
| `tool.progress` | o tempo decorrido (`"Bash · 3s"`) | substitui, mostra na linha | **concatena** no OUT: `Bash · 1sBash · 2s…` | **bug do app** |
| Texto e pensamento de subagent | sim, com `parentToolUseId` | aninhado sob o `Agent`/`Task` | **descartado** (`UnreadEvent`) | **perda de mensagem** |
| Tool de subagent | sim | aninhada | solta na lista principal, sem dizer de quem é | app: contexto perdido |
| Histórico de subagent | rota `/transcripts/:id/subagents/:toolUseId/messages` | carregado ao abrir | nunca chamado | app |
| `turn.completed` | uso, custo, duração | custo, segundos, tokens | custo e segundos | app descarta `usage` |
| Permissão, pergunta, plano | sim | card inline | card inline | paridade |
| Compactação | só ao vivo | linha | linha | some do histórico **nas duas** |
| Desfazer, buraco de replay | sim | linha | linha | paridade |
| Saída de slash command, hook, aviso de sistema, erro do resultado, rate limit | **descartados** | — | — | perda das duas (§7) |
| Imagem em resultado de tool | **descartada** | — | — | perda das duas |
| Bloco de tipo desconhecido | passa | descartado | descartado | nenhuma das duas tem um bloco genérico |

## 5. O que o plano 13 muda no que chega à conversa

Por fase. "Hoje" é o comportamento do código em 2026-10-09.

### 5.1 F0 e F1, concluídas

| Mudança | O que chega à conversa | Web | App hoje | Risco |
|---|---|---|---|---|
| `session.mcpStatusChanged` | evento de sessão com `seq`, sem texto | (indicador da B-22, ainda por fazer) | `UnreadEvent`, `seq` avança | nenhum: testado |
| `session.started` ganha `effort`, `outputStyle`, `defaultsFrom` | nada no transcript | — | ignorados | nenhum na conversa; o app não diz com que padrão a sessão abriu |
| esforço e thinking padrão | mais ou menos blocos de pensamento | dobra | dobra | paridade |
| **output style padrão** ([B-15](../plans/13-claude-settings/F1-models-and-modes.md#b-15--aplicar-no-sessionstart-)) | o Claude escreve **com mais formatação**: o `Explanatory` intercala blocos `★ Insight` com crases e listas; o `Learning` pede trechos ao humano | renderizado | **markdown cru** | **cresce com o plano**: o padrão vale para toda sessão, inclusive as abertas pelo celular |
| modelo reserva (`fallbackModel`) | a troca de modelo vira uma mensagem de sistema do CLI | descartada | descartada | perda das duas: o usuário não fica sabendo que a resposta veio de outro modelo. **Medir** qual subtipo o CLI emite (§13, D-05) |
| `disableSkillShellExecution` ([D-24](../plans/13-claude-settings/decisions.md#d-24--shell-inline-desligado-pela-camada-de-flag)) | o bloco `!` vira um marcador **dentro do texto expandido** | depende de D-04 | depende de D-04 | ver skills (§5.3) |

### 5.2 F2: servidores MCP e plugins

| Mudança | O que chega à conversa | Web | App hoje | Risco |
|---|---|---|---|---|
| tool `mcp__srv__tool` | `tool.started` normal | `srv · tool` sempre | `srv · tool · título` só **com** título. Sem título (o caso comum: tool MCP não tem `description`), o nome cru `mcp__srv__tool` | rótulo ilegível no celular |
| resultado de tool MCP com **imagem** (captura de tela, gráfico) | `tool_result` com bloco `image` | `resultText` só lê texto: **perdida** | perdida | perda das duas, que passa a ser comum com MCP |
| resultado com `resource` ou `resource_link` | bloco que não é texto | perdido | perdido | idem. **Medir** a forma em que o CLI entrega (D-05) |
| `tool_use_result` estruturado (a saída MCP com forma própria) | ignorado pelo backend | — | — | aceitável, porque o texto basta. Registrar |
| permissão de tool MCP com risco destrutivo ([D-13](../plans/13-claude-settings/decisions.md#d-13--risco-de-tool-mcp-e-annotations)) | `permission.requested` | card | card | paridade |
| **indicador de MCP da sessão** ([B-22](../plans/13-claude-settings/F2-mcp-servers.md#b-22--status-vivo-e-comandos-da-sessão-)) | `session.mcpStatusChanged` | chip no painel, com ligar/desligar/reconectar | nada | no celular, ninguém fica sabendo que um servidor caiu e que por isso o Claude "não achou a tool" |
| `needs-auth` | status | explicado | nada | idem |

### 5.3 F3: configuração de projeto e skills

| Mudança | O que chega à conversa | Web | App hoje | Risco |
|---|---|---|---|---|
| **skills** de projeto, usuário e sistema ([B-34](../plans/13-claude-settings/F3-project-config.md#b-34--skills-lista-origem-e-preferências-), [B-35](../plans/13-claude-settings/F3-project-config.md#b-35--o-plugin-sintético-das-skills-de-usuário-e-de-sistema-)) | `tool.started` do `Skill`. Depois, o CLI injeta o corpo do `SKILL.md` como **mensagem de usuário sintética** (`isSynthetic`) | **a medir**: o backend não lê `isSynthetic`. Se o CLI emite essa mensagem no stream, ela vira um balão "Você" com o arquivo inteiro | idem | **mensagem fantasma** nas duas pontas, ou perda, se o CLI não emitir. **Medir** (D-04) |
| slash commands do projeto ([B-33](../plans/13-claude-settings/F3-project-config.md#b-33--slash-commands-do-projeto-)) | o prompt `/cmd`. A expansão vai no transcript com `<command-name>`/`<command-message>`, e a saída de comando local é `local_command_output` | a saída é descartada; no histórico, as tags podem aparecer cruas | idem | perda das duas, e lixo no histórico. **Medir** (D-04) |
| **subagents** do projeto ([B-36](../plans/13-claude-settings/F3-project-config.md#b-36--subagents-do-projeto-)) | `Agent`/`Task`, com mensagens e tools de `parentToolUseId` | aninhado | **texto descartado**, tools soltas | **o pior caso**: com o plano 13, o usuário escreve os próprios subagents, e eles passam a ser comuns |
| subagent com `permissionMode` próprio volta a perguntar ([D-23](../plans/13-claude-settings/decisions.md#d-23--modo-próprio-de-subagent-volta-a-perguntar)) | `permission.requested` de uma tool do subagent | card dentro do subagent aninhado | card solto, sem dizer que é do subagent | no celular, a pessoa aprova uma escrita sem saber quem pediu |
| hooks do projeto rodam ([R-03](../plans/13-claude-settings/README.md#riscos-e-decisões-em-aberto)) | `hook_started`/`hook_response`, e o `systemMessage` que um hook manda mostrar ao usuário | descartado | descartado | perda das duas: o hook roda sem que nenhuma das telas mostre |

### 5.4 F4

O critério do app é `pnpm test:e2e:mobile` verde. Esse teste roda os fluxos que já existem; nenhum
deles tem tool MCP, skill, subagent do projeto nem output style. **Nada no critério de conclusão do
plano 13 impede as perdas acima.** Esta proposta acrescenta isso (§11, §16).

## 6. Perdas só do app

Em ordem de gravidade. Os itens 1 a 4 perdem **conteúdo**; os demais, **formato**. Pela R4, todos
entram.

1. **Texto e pensamento de subagent descartados.**
   [session_event_mapper.dart:204-231](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L204-L231)
   lê `parentToolUseId` e devolve `UnreadEvent`. O comentário explica por quê: lido como resposta, o
   texto do subagent se misturaria com ela. Não há outro lugar para ele, porque o app não aninha.
2. **Markdown cru.** [conversation_view.dart:544](../../mobile/lib/features/session/presentation/widgets/conversation_view.dart#L544)
   desenha `Text(message.text)`. Tabela, lista, código e diagrama chegam como sinais. O texto também
   não é selecionável nem copiável. É o assunto do §8.
3. **Blocos de texto colados.** Os blocos `text` de uma mensagem são juntados com `''`
   ([:243-246](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L243-L246)).
   O fim de um parágrafo encosta no começo do próximo; com markdown, uma lista termina dentro de um
   título.
4. **`usage` do turno descartado.** `TurnSummary` só tem custo e duração. O web mostra os tokens de
   entrada, saída e cache.
5. **`tool.progress` concatenado.** O backend manda o tempo decorrido, não a saída
   ([sdk-message.mapper.ts:69-79](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L69-L79)).
   O app faz `output + chunk` ([conversation.dart:316-319](../../mobile/lib/features/session/domain/entities/conversation.dart#L316-L319))
   e mostra o resultado como OUT de um Bash em andamento ([tool_card.dart:294](../../mobile/lib/features/session/presentation/widgets/tool_card.dart#L294)).
   É um bug, à parte da paridade.
6. **Tool de subagent sem dono, e histórico de subagent nunca lido.**
7. **Rótulo de tool genérico:** sem o caminho do `Read`, o +/− do `Edit` nem o servidor da tool MCP sem título.
8. **Ordem entre texto e imagem perdida** no prompt.
9. **Cores ANSI removidas** da saída ([tool_output_view.dart](../../mobile/lib/features/session/presentation/widgets/tool_output_view.dart)).
   O web as desenha com `AnsiText`.
10. **Sem diff** de `Edit`/`MultiEdit`/`Write` no card da tool. O web desenha com `ToolDiffView`. O
    [plano 10 · D-01](../plans/10-mobile-chat-layout/decisions.md#f0--normas) deixou "os diffs e a view
    Alterações" fora. A R4 reverte a parte do diff **dentro da mensagem**; a view "Alterações" não é
    mensagem e continua fora (D-09).
11. **Sem realce de sintaxe** no bloco de código. O `CodeBlock` do web colore pelo `colorizeCode`
    do editor e tem botão de copiar. No app, nem o bloco existe (é texto puro).
12. **Sem rótulo de autor.** O web escreve "Você"/"Claude" no começo de cada sequência de mensagens
    do mesmo autor ([plano 22 · D-16](../plans/22-live-history/decisions.md)). O app distingue só
    pela cor e pelo alinhamento.
13. **Copiar a mensagem do Claude** não existe no app. O web tem botão e menu de contexto, e copia o
    markdown original.

## 7. Perdas das duas pontas (backend)

O mapper ([sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts)) e
a leitura do histórico (`transcript.adapter.ts`) descartam, antes do WS:

| O quê | Onde | Fica pior com o plano 13? |
|---|---|---|
| `system` de subtipo não mapeado: `local_command_output`, `hook_*`, `informational`, `notification`, `permission_denied`, `model_refusal_*`… (vai para `default`, com `warn`) | mapper, `default` | **sim**: hooks e slash commands do projeto |
| mensagem de usuário sintética **tratada como prompt** (se o CLI a emitir) | mapper, `fromUser`, que não lê `isSynthetic` | **sim**: skills |
| blocos que não são `tool_result` numa mensagem que tem `tool_result` | mapper, `fromUser` | sim |
| imagem e recurso dentro de `tool_result` (`resultText` só lê texto) | mapper, `resultText` | **sim**: MCP |
| `server_tool_use`, `web_search_tool_result`, `document`: passam como bloco, sem `tool.started` | mapper, filtro `=== 'tool_use'` | não |
| `denied` nunca emitido: a recusa chega como `failed` | mapper, `fromUser` | não |
| `is_error`, subtipo e texto do `result` | mapper, `fromResult` | não |
| compactação no histórico (`system` → `[]`) | `historicalEvents` | não |
| `rate_limit_event` | mapper | não |

Essas perdas **não** são do app. Ficam aqui porque o pedido é "o mobile não perder", e o mobile
perde por herança. A correção é no backend, com evento novo ou campo novo no contrato (§10). O que
entra é a D-06.

## 8. Markdown nas mensagens do app

### 8.1 O que já existe

- **No app:** o plano 25 trouxe `flutter_markdown_plus` e `markdown`
  ([pubspec.yaml:45-48](../../mobile/pubspec.yaml#L45-L48)), as sintaxes próprias (HTML como código,
  cerca `mermaid`), o desenho de Mermaid pelo mesmo `mermaid.js` do web num WebView fora da tela
  ([ADR-024](../architecture/shared/00-decisions.md)), a regra de link e a pinça. Tudo isso mora em
  `features/files/presentation/widgets/viewers/`, e o `MarkdownViewer` está **preso a arquivo**: ele
  recebe `folder`, `path` e controllers do leitor e é uma lista preguiçosa da tela inteira.
- **No web:** o `ChatMarkdown` ([ChatMarkdown.tsx](../../web/src/features/session/components/conversation/ChatMarkdown.tsx))
  passa pelo `Markdown` seguro compartilhado (que já desenha Mermaid) e acrescenta o bloco de código
  com botões e o nome de arquivo da pasta como link para o editor. O prompt do usuário também é
  markdown.

### 8.2 Arquitetura alvo

```
core/widgets/markdown/                    ← sai de features/files (regra: widget usado por duas features)
  ├─ safe_markdown.dart                   o renderizador: sintaxes, regra de link, imagem remota como link
  ├─ markdown_syntaxes.dart               (movido)
  ├─ mermaid_block.dart                   (movido; o DiagramEngine continua um só)
  └─ code_block.dart                      rolagem horizontal própria, copiar, linguagem
features/files/…/markdown_viewer.dart     passa a usar o core, com pinça, lista preguiçosa e imagem relativa
features/session/…/message_bubble.dart    passa a usar o core, com nome de arquivo → leitor do plano 25
```

A [mobile/02-folder-structure](../architecture/mobile/02-folder-structure.md) manda o widget
reutilizável entre features para `core/widgets/`, e proíbe importar `presentation/` de outra feature
a não ser pelo barril. Mover é parte do trabalho, não opcional.

### 8.3 Comportamento

| Assunto | Proposta | Alternativa |
|---|---|---|
| Durante o streaming | markdown **a cada delta, com limite de frequência** (p. ex. a cada 100 ms), porque re-parsear um texto de alguns KB é barato e o web faz igual. Uma cerca de código aberta é fechada provisoriamente | texto puro durante o streaming e markdown só no `message.completed`, mais simples, mas o balão "pula" ao terminar (D-02) |
| Prompt do usuário | markdown também, como no web | só o do Claude |
| Bloco de código | caixa com rolagem horizontal própria (nunca a página, S-83 do plano 25), botão copiar, rótulo da linguagem e **realce de sintaxe**, com as mesmas linguagens e as cores dos mesmos tokens de tema do `colorizeCode` do web (R4). O "inserir no editor" do web não existe no app (é só leitura) | — (a R4 tira o "sem realce" das alternativas; a escolha do motor é a D-10) |
| Autor | "Você"/"Claude" no começo de cada sequência, como no web | — |
| Mermaid | desenhado sob demanda, como no leitor; tocar abre em tela cheia | código, com "ver diagrama" |
| Tabela larga | rolagem horizontal na própria caixa | — |
| Nome de arquivo da pasta (`src/x.ts:42`) | link que abre o **leitor do plano 25** naquele arquivo (o app não tem editor) | texto |
| Link externo | confirmação, só `http`/`https`/`mailto` | — |
| Imagem remota | nunca carregada; texto alternativo e endereço no lugar | — |
| Selecionar e copiar | `SelectionArea` no balão, mais "Copiar mensagem" no toque longo (hoje só existe para o prompt) | — |
| Pinça | **não** no chat: a escala é a do sistema (acessibilidade) | a pinça do leitor |
| Vários blocos de texto | separados por quebra de parágrafo, não colados (§6 item 3) | — |
| Preview da pergunta estruturada ([24 · D-21](../plans/24-structured-questions/decisions.md#f4--mobile)) | passa a usar o mesmo renderizador | fica em `SelectableText` |

### 8.4 O que custa

- **Desempenho numa conversa longa:** o `ListView` da conversa já é preguiçoso, e um balão fora da
  tela não é construído. Medir o tempo de construção de um balão com 20 KB de markdown e 3 diagramas
  num aparelho modesto (spike, F0).
- **Pacotes:** nenhum novo para o markdown, que já está no `pubspec` pelo plano 25. O **realce de
  sintaxe** precisa de um motor (D-10). O tamanho do APK é medido no spike.
- **i18n:** "Copiar mensagem", "Copiar código", os rótulos do bloco de código e a confirmação de link
  (já existem no leitor). Os pares novos entram no mapa [i18n-shared.json](../../scripts/i18n-shared.json),
  para o `i18n:check` comparar com o web.

## 9. Mudanças por ponta

### Backend (vale para as duas pontas)

- `fromUser` passa a ler `isSynthetic` (ou o marcador que a medição mostrar) e **não** publica a
  mensagem sintética como prompt. O que ela vira é decidido na D-04.
- `resultText` deixa de jogar fora bloco que não é texto: imagem vira marcador com `blockId`, que
  passa pela mesma rota de imagem do transcript; recurso vira texto com o URI.
- Os subtipos de `system` que a D-06 escolher passam a ter um evento.
- O histórico emite a compactação (`system:compact_boundary` → `session.compacted`).

### Web

- Os mesmos eventos novos da D-06 desenhados.
- Nada mais: o web já é a referência de paridade.

### App

- **Markdown** no balão (§8), com o renderizador movido para `core/widgets/markdown/`.
- **Subagent:** o mapper para de descartar e passa a guardar `parentToolUseId`. A conversa ganha o
  aninhamento: as tools e mensagens do subagent sob o card do `Agent`/`Task`, dobrado por padrão no
  celular. O histórico do subagent é lido pela rota que já existe. O card de permissão de uma tool de
  subagent diz de qual subagent ela é. **Depende da D-03.**
- **Blocos de texto** separados, e a ordem entre texto e imagem preservada.
- **`usage`** no `TurnSummary`, e tokens na linha do turno.
- **`tool.progress`** substitui, não concatena, e aparece na linha do card como tempo decorrido (corrige o bug).
- **Rótulo de tool** pelo mesmo mapa do web (`tool-labels.ts`): o caminho do Read, o +/− do Edit, o
  `srv · tool` do MCP sem título, a descrição do Agent. Os rótulos entram no `i18n-shared.json`.
- **Indicador de MCP** (D-07): um chip de leitura no cabeçalho da sessão, com a lista ao tocar.
  Ligar/desligar/reconectar só se a D-07 decidir.
- **Cores ANSI** na saída, com a mesma paleta do `AnsiText`.
- **Diff** no card de `Edit`/`MultiEdit`/`Write`, como o `ToolDiffView`: linhas removidas e
  acrescentadas, contadores +/− no rótulo, rolagem horizontal dentro da caixa.
- **Rótulo de autor** e **copiar a mensagem** (markdown original), pelo toque longo e por um botão.
- **Link para a trilha** no card da tool: o web tem; o app não tem tela de trilha. É ação, não
  formato. Entra só se a D-11 decidir.

## 10. Contrato

- **Markdown, subagent, blocos, `usage`, `tool.progress`, rótulos:** nenhuma mudança. Tudo já trafega,
  e é o app que descarta.
- **Indicador de MCP no app:** nenhuma mudança. `session.mcpStatusChanged` já existe.
- **Perdas do backend (D-06):** cada uma é mudança de contrato, com schema, TS, Dart e o
  [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) na mesma entrega, sem subir
  `v`, como manda o versionamento:
  - um evento `session.notice { kind, messageKey?, text?, source }` para aviso de sistema, saída de hook e saída de slash command;
  - um tipo de bloco `resource` no conteúdo da tool, ou um marcador de imagem no `tool.completed`.
  Os nomes são sugestões.

## 11. Testes

Os três níveis, com cobertura de 90 % por arquivo, como sempre. O que é **novo** aqui é o portão de
paridade:

- **Fixtures do SDK roteirizado** para os tipos que o plano 13 traz: turno com tool MCP sem título e
  com imagem no resultado; turno com `Skill` e a mensagem sintética como o CLI emite; turno com
  subagent de projeto que pede permissão; turno com saída de hook; turno com output style
  `Explanatory`. Gravadas do Claude real por `scripts/record-agent-sdk-fixtures.mjs`, não escritas à mão.
- **Paridade de conteúdo, por fixture**, nas duas pontas: para cada fixture, o redutor do web e o do
  app produzem a mesma sequência de conteúdo (texto por mensagem, tools por dono, pensamento,
  `usage`). Um tipo descartado por um cliente e não pelo outro reprova, a não ser que esteja numa
  lista declarada de exclusões, com o ID da decisão que o excluiu (princípio 2).
- **Paridade de formato, por mapa declarado.** Um `render-parity.json`, no molde do
  [i18n-shared.json](../../scripts/i18n-shared.json), lista cada elemento que o web desenha numa
  mensagem e o widget do app que o desenha. Exemplos de elemento: tipo de bloco, nó de markdown
  (tabela, lista, código, citação, Mermaid…), rótulo de tool, linha de turno, diff, ANSI, autor,
  aninhamento.

  Um script de `scripts/` (`render:check`) confere três coisas:
  - todo componente da conversa do web está no mapa;
  - todo widget do mapa existe no app;
  - todo par tem um widget test do app que desenha a mesma fixture.

  Componente novo no web sem par no app reprova o `pnpm verify`. É assim que "formato" vira regra
  de máquina e não opinião (regra 9 do AGENTS).
- **Widget test** do balão com markdown: tabela larga, código, Mermaid, link perigoso, imagem remota,
  HTML, texto de 20 KB, cerca aberta durante o streaming.
- **E2E do app** (`test:e2e:mobile`) com uma conversa que tem subagent e markdown, conferindo que o
  texto do subagent está na tela.

## 12. Fora do escopo

- As **features** do plano 13 no app (tela de configuração, MCP, plugins, skills): o pedido é só a
  conversa. O web responde no celular.
- A **view "Alterações"** no app: não é mensagem; continua fora pelo [plano 10 · D-01](../plans/10-mobile-chat-layout/decisions.md#f0--normas).
  O diff **dentro** do card da tool entra (D-09).
- O que no web é **ação de editor**, não formato da mensagem: "inserir no editor" do bloco de código,
  e abrir o arquivo no editor (no app, o link abre o leitor do plano 25). O app é só leitura
  ([ADR-015](../architecture/shared/00-decisions.md)).
- A **busca na conversa**: é ferramenta da tela, não formato da mensagem; fora pelo plano 10 · D-01.

## 13. Decisões em aberto

| ID | Decisão | Recomendação |
|---|---|---|
| D-01 | **Onde isso mora:** plano próprio, ou fase nova do plano 13 | **Plano próprio**, executado **antes** da F2 do plano 13, mais uma linha no critério de conclusão do 13 (a B-46 passa a exigir o teste de paridade da §11 com as fixtures de MCP, skill e subagent). Assim o 13 não termina verde com o app para trás, e o markdown, que não depende do 13, não espera por ele |
| D-02 | Markdown durante o streaming | a cada delta, com limite de frequência (§8.3) |
| D-03 | **Subagent aninhado no app.** Reverte uma exclusão do plano 10 · D-01 | ✅ **decidida pelo usuário em 2026-10-09 pela R4:** aninhar, ao vivo e no histórico, com o mesmo estado padrão (dobrado ou aberto) do web. A alternativa mínima (só o texto, sem as tools aninhadas) perde formato e sai |
| D-04 | Mensagem sintética (corpo da skill, expansão de slash command) | **medir primeiro** (spike). Se o CLI a emite, ela não é prompt: vira uma linha dobrada "Skill `x` carregada" sob o card do `Skill`, com o texto ao abrir. As tags `<command-*>` no histórico viram o `/cmd` que a pessoa digitou |
| D-05 | O que o CLI emite para o modelo reserva e para o resultado MCP com recurso | medir no mesmo spike |
| D-06 | Quais perdas do backend (§7) entram | **entram:** sintética (D-04), imagem e recurso em resultado de tool, compactação no histórico, `hook_response` com `systemMessage`, troca para o modelo reserva. **Ficam:** `rate_limit_event`, `server_tool_use` e os demais |
| D-07 | Indicador de MCP no app | chip **só leitura**, com status e erro; ligar/desligar fica no web |
| D-08 | Cores ANSI na saída de tool do app | ✅ **sim, pela R4** (2026-10-09), com a paleta do `AnsiText` |
| D-09 | Diff de `Edit`/`MultiEdit`/`Write` no card da tool. Reverte em parte o plano 10 · D-01 | ✅ **entra, pela R4** (2026-10-09). A view "Alterações" continua fora |
| D-10 | Motor de realce de sintaxe no app | medir no spike um pacote Dart puro (p. ex. `highlight`/`re_highlight`) contra as linguagens do web. A cor sai dos mesmos tokens de tema. Critério: as linguagens do `LANGUAGES` do web, o custo de APK e o tempo num bloco de 500 linhas |
| D-11 | Link do card da tool para a trilha | não entra: o app não tem tela de trilha, e é ação, não formato. Registrar como exclusão nomeada no `render-parity.json` |

## 14. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R-01 | Markdown malicioso no chat: link `javascript:`, imagem de rastreio, HTML | o renderizador do plano 25, com as mesmas regras e os mesmos testes |
| R-02 | Conversa longa com muito markdown e diagramas trava o app | lista preguiçosa, diagrama sob demanda e um por vez (o `DiagramEngine` do 25), limite de frequência no streaming, medição no spike |
| R-03 | Mover o renderizador para `core/` quebra o leitor de arquivos do plano 25 | os testes do leitor rodam sem mudança: o movimento é refatoração, com o comportamento coberto antes |
| R-04 | A forma da mensagem sintética muda numa versão do CLI | a fixture é gravada do Claude real, e o `smoke-live` a confere a cada versão |
| R-05 | O aninhamento de subagent no celular fica ilegível com subagents de subagents | profundidade máxima visível (p. ex. 2), com "abrir" para o resto |
| R-06 | O plano 13 avança para a F2 antes deste | a linha nova no critério da B-46 (D-01) segura o fim do 13, não o começo |

## 15. Matriz de cenários (semente)

Para o plano enumerar por inteiro, pelas seis dimensões do
[protocolo §Estágio 0](../architecture/shared/11-validation-protocol.md).

| Dimensão | Cenários |
|---|---|
| Equivalência | mensagem só texto; com lista, tabela, código, Mermaid; prompt com markdown; subagent com texto, pensamento e tool; tool MCP com e sem título; turno com `usage` |
| Fronteira | mensagem vazia; 1 caractere; 20 KB; 10 diagramas; tabela de 30 colunas; subagent de subagent; mensagem com 5 blocos de texto |
| Erro | Mermaid inválido (vira código com aviso); link `javascript:`; imagem remota; HTML; resultado de tool com imagem que não carrega; fixture com subtipo de `system` desconhecido |
| Transição de estado | cerca de código aberta e fechada durante o streaming; subagent em andamento e depois concluído; permissão de subagent pedida e resolvida no web enquanto o app mostra; histórico carregado por cima do ao vivo |
| Concorrência | deltas de texto do Claude e do subagent intercalados; duas tools de subagent em paralelo |
| Idempotência | o mesmo `message.completed` reaplicado pelo replay não duplica o balão nem o subagent; a mensagem sintética não vira dois balões ao vivo e no histórico |

## 16. Fatiamento sugerido

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | spike: a mensagem sintética da skill e do slash command, o modelo reserva, o resultado MCP com imagem e recurso, o custo do markdown num balão grande, o motor de realce (D-10). As fixtures gravadas | — |
| F1 | o `render-parity.json` com o inventário dos componentes da conversa do web e o `render:check`, que nasce **reprovando** com a lista do que falta. Cada fase seguinte tira linhas dela | F0 |
| F2 | o renderizador movido para `core/widgets/markdown/`, sem mudança de comportamento no leitor | — |
| F3 | markdown no balão, bloco de código com realce, autor, blocos separados, copiar e selecionar | F2 |
| F4 | o resto do card e da linha: `usage`, `tool.progress`, rótulos, ordem texto/imagem, ANSI, diff | — |
| F5 | subagent aninhado no app, ao vivo e no histórico, e o card de permissão com o dono | — |
| F6 | as perdas do backend da D-06, nas três pontas, com o contrato | F0 |
| F7 | `render:check` verde, e a linha nova no critério do plano 13 | F1…F6 |
| F8 | E2E | todas |

F2 a F5 não dependem do plano 13 e podem começar já. F5 e F6 são o que o plano 13 torna urgente.

## 17. Referências

**Plano 13:** [README](../plans/13-claude-settings/README.md) ·
[F1](../plans/13-claude-settings/F1-models-and-modes.md) ·
[F2](../plans/13-claude-settings/F2-mcp-servers.md) ·
[F3](../plans/13-claude-settings/F3-project-config.md) ·
[F4](../plans/13-claude-settings/F4-e2e.md) ·
[decisions](../plans/13-claude-settings/decisions.md) ·
[descoberta 01 §11](01-descoberta-claude-agent-sdk.md#11--quinta-rodada-de-spikes-2026-10-09)

**Backend:**

- [sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts):
  - `tool_progress`: 69-79;
  - `system:init`, `rate_limit_event`, `default`: 85-146;
  - subtipos quietos: 156-164;
  - `fromUser`: 363-394;
  - `resultText`: 423-427;
  - `fromResult`: 430-441;
  - histórico: 455-479.

**Contrato:** [protocol.ts](../../packages/contracts/src/protocol.ts):

- bloco de conteúdo: 441-455;
- `message.completed`: 458-469;
- `message.delta`: 472-481;
- `tool.*`: 670-720;
- `turn.completed`: 750-759.

**Web:**

- [conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts) (`BLOCK_KINDS` 332-337, leitores 690-705);
- [ChatMarkdown.tsx](../../web/src/features/session/components/conversation/ChatMarkdown.tsx);
- [tool-labels.ts](../../web/src/features/session/lib/tool-labels.ts);
- [Markdown.tsx](../../web/src/shared/components/markdown/Markdown.tsx).

**App:**

- [session_event_mapper.dart](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart):
  - leitores: 112-127;
  - subagent: 204-231;
  - texto colado: 243-246;
  - `turn.completed`: 345-358.
- [conversation.dart:316-319](../../mobile/lib/features/session/domain/entities/conversation.dart#L316-L319);
- [conversation_view.dart:523-558](../../mobile/lib/features/session/presentation/widgets/conversation_view.dart#L523-L558);
- [tool_card.dart](../../mobile/lib/features/session/presentation/widgets/tool_card.dart);
- [markdown_viewer.dart](../../mobile/lib/features/files/presentation/widgets/viewers/markdown_viewer.dart).

**SDK:** `sdk.d.ts` 0.3.277: `SDKUserMessage.isSynthetic` e `tool_use_result` (≈ 5875-5895), a
união `SDKMessage` (≈ 5025).
