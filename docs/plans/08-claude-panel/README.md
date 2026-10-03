# Plano 08 — Painel do Claude

**Objetivo:** o Claude vive no workbench como na extensão do VS Code — dentro da aba de pasta, ao lado
do explorer e do editor, um painel de chat com as sessões que rodam ali, as que rodam em outro lugar e o
histórico da pasta; respostas em markdown, thinking, tarefas, subagents e tools legíveis; diffs do que
ele mudou, aceitos ou rejeitados por arquivo e por trecho; o contexto de cada prompt escolhido com `@`,
`/`, arrastar e soltar; e modelo, modo, contexto e custo à vista.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full       # portões 1-11, sai com código 0
pnpm test:e2e:mobile   # o contrato WS muda (anexos, stream, fila, rejeitar): o app continua verde
pnpm test:e2e:live     # smoke-live: menção, skills, modelos, MCP, contexto e imagem contra o Claude real
```

**Depende de:** [plano 07 — Explorer e editor](../07-explorer-and-editor/README.md) (o editor, a aba de
diff, a árvore e a API de arquivos) e, por ele, do [plano 06 — Workbench](../06-workbench/README.md) (as
abas de pasta, a secondary side bar, a activity bar, a status bar, a command palette e o screen frame
com ajuda) e do [plano 04 — Histórico e retomada](../04-transcript-and-resume/README.md) (histórico,
retomada, fork, `attach`, slash commands e desfazer). A F5 usa o localizador de arquivos do
[plano 11](../11-search/README.md) para o autocomplete do `@`
([D-12](decisions.md#d-12--o-autocomplete-do-)). **Nenhum** depende dos planos 05/06.
O [plano 09 — Layout do chat](../09-chat-layout/README.md) e o [plano 13 — Configuração do Claude](../13-claude-settings/README.md) dependem deste; o 09 rearranja o painel daqui no molde do plugin do VS Code, e a ordem dele em relação à F6 é a [09 · D-01](../09-chat-layout/decisions.md#f0--normas).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário abriu uma sessão e o Claude disse estar em `/tmp/remote-claude-workspaces`, "que não é git nem
nada". O plano 06 resolve **onde** a sessão nasce (a pasta escolhida da máquina); este plano resolve **o
que se vê e se faz** com o Claude ali. E o que ele pediu, com todas as letras, é ver na pasta aberta **as
sessões que estão executando e o histórico**, integrando com as que já existem — inclusive as do VS Code
—; escolher o contexto do prompt "da mesma forma que o plugin do Claude" (`@`, arrastar, `/` para comando
ou skill, autocomplete); e o chat do Claude, o sistema de arquivos e o editor **na mesma aba**.

Hoje isso não existe por faltas concretas, não por decisão:

| Falta | Onde | O que este plano faz |
|---|---|---|
| Não há endpoint que liste sessões **vivas** | o registro é um `Map` em memória, sem HTTP ([backend/04](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos)) | `GET /sessions?workspacePath=`, da pasta **e** das subpastas (F1) |
| O histórico casa o `cwd` **exato** | `listSessions({ dir })` não desce a subpastas ([backend/03](../../architecture/backend/03-modules.md#transcript)) | subpastas se a [D-05](decisions.md#d-05--a-lista-casa-subpastas) disser — o caso relatado (VS Code aberto na raiz do repositório) já casa exato |
| Não há como saber que uma conversa está aberta **agora** no editor | [descoberta §9.4](../../discovery/01-descoberta-claude-agent-sdk.md#94--não-há-como-saber-que-uma-sessão-está-aberta-no-editor) | "ativa em outro lugar" por **heurística declarada** — `lastModified` recente —, nunca por detecção ([D-06](decisions.md#d-06--ativa-em-outro-lugar-o-critério-e-o-que-se-permite)) |
| `session.prompt.attachments` existe no schema e ninguém o usa | o backend não o lê; o web não o envia | contexto de verdade: arquivo, pasta, trecho, anexo do desktop, terminal (F0, F5) |
| O mapper descarta thinking; subagent e compactação não chegam ao cliente | `sdk-message.mapper` | thinking, `parentToolUseId` e `session.compacted` no contrato (F0, F2) |

E o painel atual é uma coluna de texto cru: `whitespace-pre-wrap`, um `ToolCard` por tool com o input
despejado, um `PromptComposer` de uma linha; nenhum markdown, diff, contexto, seletor de modelo ou modo —
embora `session.setModel` e `session.setPermissionMode` já existam no contrato e no `useLiveSession`.

Quatro escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **Contrato pequeno e opcional.** O que muda no WS é campo opcional ou tipo novo — `v` não sobe —, e o resto é HTTP de leitura | cada comando é mudança nas três pontas; ler é pergunta com resposta ([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#slash-commands)) |
| **O contexto é referência, não conteúdo** ([D-01](decisions.md#d-01--como-a-menção-chega-ao-claude)) | o Claude lê o arquivo pelo `Read`, que o hook `PreToolUse` audita; conteúdo colado no prompt seria leitura de arquivo que a trilha nunca viu |
| **O diff e o rejeitar são nossos, sobre o que já guardamos** ([D-03](decisions.md#d-03--de-onde-vem-o-diff), [D-08](decisions.md#d-08--rejeitar-por-arquivo-e-por-trecho)) | o store do [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso) já tem o antes e o estado que a sessão deixou; rejeitar é restaurar com as garantias do desfazer |
| **Tudo é da aba de pasta** | o painel, as conversas, o rascunho, o conjunto de contexto e a rolagem são estado **da aba**, nunca global; as sessões vivem no backend, então fechar a aba não as encerra; a permissão pedida numa aba inativa vira badge **na aba**; o teto de sessões é da instalação, e a recusa diz isso |

Este plano **não** abre ADR: não muda escolha de arquitetura. Consome o ADR-011 (hook `PreToolUse` como
trilha, `settingSources: ['project']`), o ADR-013 (store do desfazer) e o que o plano 04 decidiu sobre
origem e retomada; o que muda em documento normativo é contrato e padrão de UI, e isso é a
[F0](F0-contract.md).

---

## Escopo

### Entra

| | |
|---|---|
| Contrato: anexos do prompt, thinking, subagents, compactação, fila, fork a partir de mensagem, esforço, rejeitar; endpoints de leitura; códigos novos; padrões de UI; fixtures gravadas | F0 |
| Sessões da pasta: **em execução aqui**, **ativas em outro lugar**, **histórico** — e integrar com elas (`attach`, retomar, fork); o link de sessão e de conversa no workbench | F1 |
| Renderização: markdown seguro, código, caminhos que abrem no editor, tools compactas, saída do `Bash`, thinking, lista de tarefas, subagents, aprovar plano, resumo do turno, copiar e buscar | F2 |
| Diffs: inline, aba de diff, view "Alterações", diff no card de permissão, aceitar, rejeitar por arquivo e por trecho, desfazer a rejeição | F3 |
| O painel na aba de pasta: conversas, sessão no primeiro prompt, fila, editar e reenviar, modelo/modo/esforço, contexto e `/compact`, MCP da sessão, exportar, atalhos, status bar, badges e notificações, ajuda | F4 |
| O composer e o contexto: chips com tamanho e tokens, `@` com autocomplete, arrastar e soltar, `/` com comandos e skills de todas as origens, do editor para o contexto, ajuda | F5 |
| E2E roteirizado, `test:e2e:mobile` e `smoke-live` | F6 |

### Não entra

Só o que é de outro plano ou o que a arquitetura impede:

- **Padrões do Claude e configuração de MCP e de skills** — modelo, modo e esforço **padrão**, servidores
  MCP (ligar, desligar, reconectar, acrescentar, remover), quais skills estão ligadas e o plugin local que
  traz as de usuário e sistema, a conta e a configuração de projeto — são do
  [plano 13](../13-claude-settings/README.md), numa tela própria. Aqui ficam os controles **da sessão** e
  um indicador de status dos MCPs dela.
- **Uso e custo agregados** (por dia, pasta, modelo, orçamento) — [plano 16](../16-usage-and-cost/README.md).
  Aqui, o custo do turno e o da sessão.
- **Alterações de conversa encerrada.** O store de snapshots é purgado quando nenhuma sessão viva o
  alcança ([backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)); a
  view prometeria o que o store não guarda. É a mesma política do desfazer (ADR-013).
- **Apagar conversa.** O store é do Claude e compartilhado com o VS Code
  ([backend/03](../../architecture/backend/03-modules.md#transcript)); apagar aqui apagaria lá. Renomear é
  o `/rename` da instalação, quando existir, pelo menu `/`.
- **O app Flutter ganhar o painel.** O app só acompanha o contrato (tipos Dart e `test:e2e:mobile` verde).
- Fora de todos os planos por decisão do usuário (2026-09-26): inteligência de linguagem e depuração, git,
  marketplace de extensões, notebooks, colaboração em tempo real, settings sync, multi-root numa árvore só.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério de
conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | o contrato do painel nas três pontas, os documentos normativos e as fixtures | B-01…B-06 | ✅ |
| F1 | [Sessões da pasta](F1-sessions.md) | a view com as vivas, as ativas em outro lugar e o histórico da pasta, e o `attach`/retomar/fork a partir dela | B-07…B-13 | ✅ |
| F2 | [Renderização](F2-rendering.md) | a conversa legível como na extensão: markdown, código, tools, thinking, tarefas, subagents, plano, turno | B-14…B-24 | ✅ |
| F3 | [Diffs](F3-diffs.md) | o que o Claude mudou, visto antes de aprovar, no chat, no editor e por sessão — aceito ou rejeitado por arquivo e por trecho | B-25…B-31 | ✅ |
| F4 | [Painel de chat](F4-chat-panel.md) | o painel dentro da aba de pasta, com conversas, fila, reenviar, seletores, contexto, MCP, atalhos, badges e ajuda | B-32…B-43 | ✅ |
| F5 | [Composer e contexto](F5-composer-and-context.md) | escolher o contexto do prompt com `@`, arrastar e `/`, com autocomplete, em chips | B-44…B-52 | ✅ |
| F6 | [E2E](F6-e2e.md) | o ciclo pela porta do usuário, o app verde e o `smoke-live` | B-53…B-58 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O prompt carrega arquivo, pasta, trecho, anexo e texto de provedor, nas três pontas, sem subir `v` | B-01 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#campo-obrigatório-por-condição) | S-01…S-06, S-09 |
| Thinking, subagent, compactação, fila, fork, esforço e rejeitar no contrato, opcionais | B-02 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-07…S-09 |
| Todo endpoint novo documentado com a sua tabela de status antes do código | B-03, B-07, B-25 | [backend/03-modules](../../architecture/backend/03-modules.md#session) | S-13…S-20, S-108…S-111 |
| Todo erro novo tem código, status e chave en/pt-BR antes de existir no código | B-04 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-10 |
| Padrões de UI do painel escritos antes das telas | B-05, B-13, B-43 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-55…S-57, S-194…S-196 |
| O fake roteirizado reproduz o que o Claude real gravou, para tudo que o painel desenha | B-06 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-11, S-12 |
| Listar as sessões **vivas** do usuário na pasta e nas subpastas, na mesma cerca da allowlist | B-07 | [backend/03-modules](../../architecture/backend/03-modules.md#session) | S-13…S-24 |
| O histórico da pasta diz o que está vivo aqui e o que parece ativo em outro lugar | B-08 | [backend/03-modules](../../architecture/backend/03-modules.md#transcript) | S-25…S-32 |
| A view de sessões da aba de pasta, com os três grupos, busca, filtro e os quatro estados | B-09 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-33…S-38 |
| Integrar com a sessão existente: viva → `attach`, nossa → retomar, externa → fork, externa ativa → aviso | B-10 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#retomada) | S-39…S-47 |
| A lista acompanha o mundo sem martelar o backend | B-11 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#o-histórico-é-dado-do-servidor) | S-48…S-51 |
| Sessão e conversa têm link no workbench, que abre a aba de pasta com a conversa no painel (as rotas antigas saíram no 06) | B-12 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-52…S-54, S-266 |
| Markdown do modelo é conteúdo não confiável: sem HTML cru, sem imagem remota, sem link perigoso | B-14 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-58…S-64 |
| Código com realce, copiar e inserir no editor sem tocar o disco | B-15 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-65…S-68 |
| Caminho de arquivo no texto abre no editor, só dentro da pasta | B-16 | [web/01-architecture](../../architecture/web/01-architecture.md#os-quatro-elos) | S-69…S-71 |
| Tools compactas, com o input exato a um clique e a permissão nunca compactada | B-17 | [web/03-ui-system](../../architecture/web/03-ui-system.md#permissão--a-tela-mais-importante) | S-72…S-76 |
| Saída viva do `Bash` com ANSI seguro e teto | B-18 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-77…S-81 |
| Thinking, lista de tarefas e subagents como na extensão, vivos e no histórico | B-19, B-20, B-21 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#o-mapper--a-tradução-que-protege-o-contrato) | S-82…S-91 |
| Modo plan com aprovação do plano | B-22 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-92…S-95 |
| Status do turno, resumo com custo, duração e tokens, e custo da sessão | B-23 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente) | S-96…S-99 |
| Copiar mensagem e buscar na conversa | B-24 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#o-histórico-é-dado-do-servidor) | S-100…S-102 |
| O diff de uma tool vem do input e do snapshot que já guardamos | B-25 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso) | S-103…S-112 |
| O que a sessão mudou, por arquivo e por trecho, contra antes da sessão | B-26 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai) | S-113…S-118 |
| Diff inline no chat e aba de diff no editor | B-27 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-119…S-121 |
| View "Alterações" da sessão, com aceitar | B-28 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#menu-de-comandos-e-desfazer) | S-122…S-126 |
| Aprovar Edit/Write vendo o diff contra o disco agora | B-29 | [web/03-ui-system](../../architecture/web/03-ui-system.md#permissão--a-tela-mais-importante) | S-127…S-131 |
| Rejeitar por arquivo e por trecho, com as garantias do desfazer, e desfazer a rejeição | B-30, B-31 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos) | S-132…S-144 |
| O painel fica dentro da aba de pasta, ao lado do explorer e do editor, sem vazar entre abas; fechar não encerra | B-32 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#websocket--o-stream-ao-vivo) | S-145…S-150 |
| A sessão nasce no primeiro prompt, e nada vive antes dele | B-33 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos) | S-151…S-155 |
| A fila de prompts visível a todos e cancelável | B-34 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão) | S-156…S-160 |
| Editar e reenviar bifurca a partir da mensagem, sem truncar a original | B-35 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro) | S-161…S-165 |
| Modelo da instalação, nunca hardcoded; modo que não promete o que não existe; esforço quando o modelo aceita | B-36 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#options--o-que-amarramos) | S-166…S-172 |
| Medidor de contexto e `/compact` | B-37 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-173…S-175 |
| Status dos MCPs da sessão à vista, sem segredo, sem configuração | B-38 | [backend/03-modules](../../architecture/backend/03-modules.md#session) | S-176…S-179 |
| Exportar a conversa no cliente, sem endpoint novo | B-39 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#o-histórico-é-dado-do-servidor) | S-180…S-182 |
| Esc interrompe sem roubar o Esc dos menus; atalhos na palette | B-40 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor) | S-183…S-185 |
| Status bar com status, modelo e custo da sessão ativa | B-41 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-186, S-187 |
| Permissão nunca se perde por estar noutra aba ou com o painel escondido; notificação sem o comando | B-42 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#a-fila-de-permissão) | S-188…S-193 |
| O contexto é validado na pasta da sessão, tudo ou nada, e o `Read` dele é auditado | B-44 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#a-trilha-de-auditoria-é-o-hook-não-o-canusetool) | S-197…S-205 |
| Anexo do desktop com teto, tipo e vida curta, fora do workspace, da trilha e do log | B-45 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-206…S-213 |
| O composer multilinha, com recusa traduzida e o texto preservado | B-46 | [web/01-architecture](../../architecture/web/01-architecture.md#componente--só-apresentação-e-interação) | S-214…S-217 |
| O conjunto de contexto em chips, com tamanho e tokens estimados, persistido no rascunho | B-47 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) | S-218…S-225 |
| `@` com autocomplete fuzzy, teclado e provedores | B-48 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-226…S-232 |
| Arrastar do explorer, das abas e do desktop para o contexto, nunca gravando na pasta em silêncio | B-49 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-233…S-240 |
| `/` com comandos e skills de projeto, usuário e sistema, com selo, também antes da sessão | B-50 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#slash-commands) | S-241…S-248 |
| Do editor para o contexto, avisando o buffer sujo | B-51 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-249…S-251 |
| O composer operável só por teclado, com ajuda e sem literal | B-52 | [shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas) | S-252…S-254 |
| O ciclo pela porta do usuário, com o app verde e o Claude real no `smoke-live` | B-53…B-58 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-255…S-272 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── commands/  session-prompt (attachments: kind · path · range · attachmentId · text)
│              session-start (forkAt) · session-rewind-files (paths)
│              session-cancel-queued-prompt · session-reject-change · session-set-effort (D-16)
└── events/    message-delta (blockType) · message-completed / tool-* (parentToolUseId)
               session-compacted · prompt-queued · prompt-dequeued

backend/src/
├── domain/session/            live-session-listing · prompt-attachment · tool-diff · change-hunks
│                              slash-commands (origem e colisão)
├── application/session/       list-live-sessions · session-changes · reject-change · compose-prompt
│   │                          prompt-queue · fork-point · installation-catalog
│   └── ports/                 prompt-file-reference · attachment-store
├── application/transcript/    atividade da conversa · subagents
├── adapter/
│   ├── inbound/http/session/  GET /sessions · changes · tools/:id/diff · models · mcp-servers · context
│   │                          attachments · GET /catalog
│   └── outbound/claude/       mapper (thinking, subagent, compactação) · supportedModels ·
│                              mcpServerStatus · getContextUsage · resumeSessionAt
└── …

web/src/features/
├── session/    ChatPanel · ConversationTabs · SessionsView · ChangesView · DiffView · ToolRow
│               TodoList · PlanApproval · ContextMeter · McpIndicator
│   ├── components/markdown/   renderer seguro, código, links de caminho, ANSI
│   └── components/composer/   ChatComposer · ContextChips · MentionMenu · SlashMenu · DropZone
└── transcript/ histórico com atividade, subpastas e subagents

e2e/{scenarios,specs,smoke-live}/            painel, sessões, diffs, contexto, skills
backend/test/fakes/agent-sdk/fixtures/       edit · reference-read · task-subagent · todo · plan · thinking · compact
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | O markdown vem do modelo, que lê arquivos e páginas que ninguém revisou: uma injeção de prompt pode pedir uma imagem remota cuja URL carrega dado do projeto | **aberto** — HTML cru nunca vira elemento, imagem remota nunca carrega, `javascript:`/`data:` nunca viram link (B-14, S-59…S-61) |
| R-02 | "Ativa em outro lugar" é heurística: um transcript recente não prova processo vivo, e um parado há minutos não prova o contrário | **aberto** — o rótulo diz "escrita há *n* min", nunca "aberta no VS Code"; a regra de retomada não depende dele (externa é sempre fork) ([D-06](decisions.md#d-06--ativa-em-outro-lugar-o-critério-e-o-que-se-permite)) |
| R-03 | Casar subpastas no histórico exige varrer o store inteiro (281 ms medidos para 298 sessões), contra 21 ms por pasta | **aberto** — [D-05](decisions.md#d-05--a-lista-casa-subpastas); o caso relatado casa exato |
| R-04 | Cada conversa viva é um subprocesso de ~222 MB, e o teto (10) é da instalação: abas e conversas o esgotam rápido; a query efêmera do catálogo também conta enquanto dura | **aberto** — a sessão nasce no primeiro prompt ([D-07](decisions.md#d-07--a-sessão-nasce-no-primeiro-prompt)); a recusa diz que o teto é global e lista as sessões do usuário ([D-09](decisions.md#d-09--várias-sessões-da-mesma-pasta-e-o-teto)); o catálogo é cacheado ([D-13](decisions.md#d-13--o-catálogo-antes-da-sessão)) |
| R-05 | A referência aponta o **disco**, não o buffer sujo do editor: o Claude pode ler outra coisa do que a pessoa vê | **aberto** — o chip avisa quando a aba do editor está suja (B-51, S-250) |
| R-06 | A prévia do diff no card de permissão é calculada contra o disco **agora**; o arquivo pode mudar até a aprovação, e o Edit pode falhar | **aberto** — a prévia diz contra que momento foi calculada e é relida ao focar; o resultado da tool é a verdade (B-29, S-131) |
| R-07 | Os planos 06, 07 e 11 ainda não existem em código: a aba de pasta, a secondary side bar, a aba de diff, a API do editor ativo e o localizador de arquivos são interfaces que este plano consome | **aberto** — as fases apontam os planos por arquivo; divergência de interface vira decisão registrada aqui, não adaptação calada |
| R-08 | Imagem pelo streaming input **não foi medida**, e o frame WS tem 64 KB por padrão — um print de tela não cabe | **aberto** — upload HTTP ([D-02](decisions.md#d-02--imagem-no-prompt)); se o spike reprovar, a imagem sai com registro no [progresso](progress.md) |
| R-09 | Markdown, realce, ANSI e o composer pesam no bundle e no celular | **aberto** — carregados sob demanda e medidos na B-14; o realce é o do editor do plano 07 ([D-04](decisions.md#d-04--markdown-e-realce)) |
| R-10 | `@caminho` no streaming input pode ser expandido pelo próprio CLI em conteúdo inline — leitura de arquivo sem `PreToolUse` | **aberto** — gap da [D-01](decisions.md#d-01--como-a-menção-chega-ao-claude), medido antes da B-44 e vigiado pelo `smoke-live` (S-271) |
| R-11 | Rejeitar um trecho escreve no disco do usuário com três versões em jogo (antes, como a sessão deixou, agora) | **aberto** — só quando o disco ainda tem o hash da sessão; `revision` conferida; atômico; trilha antes; desfazer oferecido ([D-08](decisions.md#d-08--rejeitar-por-arquivo-e-por-trecho)) |
| R-12 | Subagents com texto encaminhado podem encher o ring buffer e transformar replay em `gap` | **aberto** — medir na [D-15](decisions.md#d-15--subagents-o-que-encaminhar); o recuo é carregar o subagent ao expandir |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação. A fase só começa com as decisões
   que a bloqueiam fechadas — ver [decisions.md](decisions.md). Os spikes da F0 rodam antes dela.
3. Ao fim de cada fase: o critério dela (`pnpm verify`, mais o que a fase disser). Vermelho → corrige e
   **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md), e rode `pnpm plan progress 08` a cada task
   concluída.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. `pnpm test:e2e:mobile` antes do `pnpm verify:full`, e com os daemons do Gradle parados depois dele —
   senão o portão 7 estoura o prazo.
