# Plano 13 — Configuração do Claude

**Objetivo:** ver e mudar, numa tela só dela, como o Claude desta máquina trabalha — conta e
instalação, modelos e padrões, servidores MCP, plugins, skills e a configuração de projeto (CLAUDE.md,
slash commands, subagents, output styles, hooks) — sem que nenhuma dessas portas abra um caminho que
fure a permissão e a trilha.

**Núcleo e extensão** ([D-33](decisions.md#d-33--ajuste-às-diretivas-do-plano-28)): o que só o Claude tem — conta,
instalação, plugins, skills e a configuração de projeto do `.claude/` — mora na extensão `engines/claude/` de cada
ponta, com as rotas `/engines/claude/*`; os padrões da sessão e os servidores MCP (a capacidade `mcp`) são **núcleo,
por motor**, com as rotas `/engines/:engine/*`, como o [plano 28](../28-agent-neutral-core/README.md) divide o
`claude-config`.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full       # sai com código 0
pnpm test:e2e:mobile   # o contrato WS muda: o app não pode quebrar
pnpm test:e2e:live     # o CLI real faz o que a F0 mediu
```

**Depende de:** [06 — Workbench](../06-workbench/README.md) (navegação global, screen frame, palette,
editor de atalhos, seletor de pasta) e [08 — Painel do Claude](../08-claude-panel/README.md) (controles
da sessão, onde o indicador de MCP entra); [07 — Explorer e editor](../07-explorer-and-editor/README.md)
para criar e editar os arquivos de `.claude/`. Consome os planos 03 (regras), 04 (catálogo de comandos,
retomada) e 01 (a ponte de permissão e a limpeza da marca de confiança). O
[plano 14](../14-audit-explained/README.md) mostra os kinds `mcp.*` e `engine.*` na linha do tempo quando existir
— não depende dele. Uso e custo são do [plano 16](../16-usage-and-cost/README.md).
A **F2 depende do [plano 26 — Paridade da conversa no app](../26-mobile-conversation-parity/README.md)**
concluído ([D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)): o que este plano traz para a conversa — tool MCP,
skill, subagent e hook do projeto, output style — tem de chegar ao app com o mesmo conteúdo e formato do web.
E a **F2 depende do [plano 28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md)** concluído
([D-33](decisions.md#d-33--ajuste-às-diretivas-do-plano-28)): a F2…F4 nascem na estrutura que ele deixa — isolamento
em `engines/claude/`, regras na gramática canônica (o `RuleDialect` só traduz), contrato canônico, rotas com
tipo gerado em `packages/contracts/schema/http/`. A ordem, decidida pelo usuário em 2026-10-10, é
26 · F1 → 28 → 26 · F2…F7 → 13 · F2…F4 → 27. A F0 e a F1 daqui (módulo `claude-config`, rotas `/claude/*`, tabelas,
tela) já estão feitas e são **movidas** pela [28 · F6](../28-agent-neutral-core/F6-engine-extensions.md), não por
este plano.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário pediu "uma tela para cada coisa", com "as trocas de modelo, configuração do Claude, MCPs".
Os controles **dentro** da sessão — seletor de modelo e de modo no composer — são do plano 08; os
**padrões** e a **configuração** moram aqui, numa rota própria, fora das Configurações do app
(aparência, idioma, editor, dispositivos).

O que torna este plano mais que um formulário é que quase tudo nele é uma porta para rodar coisa na
máquina, e o produto já aprendeu três vezes que essas portas desligam a aprovação em silêncio:

| Porta já conhecida | Onde foi medida | A porta nova do mesmo tipo |
|---|---|---|
| `settingSources` omitido carrega as `allow` pessoais | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | skills do usuário — entram por plugin sintético, sem ampliar o escopo ([D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema)) |
| diretório confiado dispensa o `canUseTool` | [plano 01 · D-11](../01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto) | permissões e hooks de projeto — mostrados, não editados ([D-17](decisions.md#d-17--permissões-hooks-e-plugins-de-projeto)) |
| `allowedTools` com nome simples | [plano 01 · D-14](../01-live-session/decisions.md#d-14--o-segundo-jeito-de-furar-o-canusetool) | `permission_policy: 'always_allow'` de servidor MCP, e a camada de flag/managed settings — proibidos ou restritos por regra de máquina (B-08) |

E há uma porta que não é de permissão, mas de vazamento, achada ao escrever o plano: o `mcpServers`
do `query()` vai para o **argv** do CLI (`--mcp-config`, no `sdk.mjs`), legível por qualquer usuário da
máquina ([D-02](decisions.md#d-02--segredo-de-servidor-mcp)).

Por isso a ordem: medir primeiro (B-01), transformar o que se mediu em ADR e regra de máquina (F0),
e só então as telas. O que já existe dá a base: o catálogo por versão do CLI do plano 04 vira o
catálogo da instalação; a regra "a nossa é a única autoridade" do plano 03 vira a aprovação do
`.mcp.json`; o segundo passo de escopo persistido vira o segundo passo de servidor MCP e de plugin.

---

## Escopo

### Entra

| | |
|---|---|
| Spike das medições que mandam no desenho; ADR e emenda à ADR-011; módulo `claude-config`; contrato HTTP e WS; erros; tabelas e kinds `claude.*`; regras de máquina | F0 |
| Catálogo da instalação (sessão viva ou sonda efêmera); conta; diagnóstico da instalação; teste de conexão com o modelo; modelos da instalação; padrões por usuário e por pasta (modelo, modo, esforço, thinking, output style, modelo reserva) aplicados no `session.start`; a tela e a ajuda | F1 |
| Servidores MCP, no núcleo por motor (capacidade `mcp`): store com segredo cifrado e só escrita, composição strict por sessão, subprocesso sem os segredos do backend, status vivo, ligar/desligar/reconectar na sessão e o indicador no painel, apertar-vale-já, aprovação do `.mcp.json` por digest, testar conexão, tool MCP pela aprovação, regras `mcp(srv:…)` que caem com o servidor (casadas no núcleo); plugins, na extensão do Claude, locais e de marketplace (baixados pelo backend, só de marketplace declarado, atualização explícita); telas e ajuda | F2 |
| Configuração de projeto, inteira na extensão do Claude: memória (existe × carregada), slash commands, **skills** (projeto, usuário e sistema, com preferências e plugin sintético), subagents, output styles — listar, e criar/editar pelo editor do 07 a partir de modelo —; hooks, permissões e plugins do projeto só leitura e explicados; telas e ajuda | F3 |
| E2E pela porta do usuário, `smoke-live` contra o Claude real, e o app compatível | F4 |

### Não entra

Só o que é de outro plano ou o que a arquitetura proíbe:

- **Controles dentro da sessão** (seletor de modelo e de modo no composer, `/` com comandos e skills):
  [plano 08](../08-claude-panel/README.md). Este plano entrega o indicador de MCP no painel dele (D-14) e
  a fonte única de modelos.
- **Uso, custo e orçamento**: [plano 16](../16-usage-and-cost/README.md). O teste de conexão diz o custo
  dele; o agregado é lá.
- **Linha do tempo da trilha**: [plano 14](../14-audit-explained/README.md) mostra os kinds `mcp.*` e
  `claude.*` que este plano grava.
- **Login do CLI pela UI remota.** O backend herda o login da máquina e não conhece a credencial
  ([backend/04](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)); a tela
  diz o estado e o que rodar na máquina.
- **Autenticar servidor MCP por OAuth pelo cliente remoto** (`needs-auth`): exige navegador na máquina e
  o fluxo de elicitação do SDK carregado até o cliente — mostrado e explicado, não resolvido aqui.
- **Escopo `user` do CLI nas sessões** — `~/.claude/settings.json`, MCPs e hooks pessoais: a ADR-011
  proíbe. As skills do usuário entram, pelo plugin sintético (D-20).
- **`claude plugin install` e o escopo `user` dos plugins**: plugin de marketplace entra, mas baixado
  pelo backend para diretório próprio ([D-15](decisions.md#d-15--plugins-do-claude)); o que o CLI da
  máquina instalou só contribui skills (D-22).
- **Editor estruturado de permissões e hooks de projeto**: fica registrado como alternativa na
  [D-17](decisions.md#d-17--permissões-hooks-e-plugins-de-projeto); o arquivo continua editável pelo
  editor do plano 07.
- **Telas novas no app Flutter**: só compatibilidade de contrato; o web é mobile-first e responde no
  celular. A exceção é o chip só de leitura do status de MCP na sessão do app ([D-32](decisions.md#decididas-durante-a-execução-b-01-2026-10-09), B-22). A **conversa** do app não entra nesta exclusão: o que este plano põe nela aparece no app em
  paridade com o web, pelo [plano 26](../26-mobile-conversation-parity/README.md), conferido pelo `render:check` e
  pela paridade de conteúdo na B-46 ([D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | medições, ADR, módulo, contrato nas três pontas, erros, tabelas, regras de máquina | B-01…B-09 | ✅ |
| F1 | [Conta, modelos, padrões e diagnóstico](F1-models-and-modes.md) | catálogo da instalação, diagnóstico, padrões aplicados na sessão, a tela | B-10…B-17 | ✅ |
| F2 | [Servidores MCP e plugins](F2-mcp-servers.md) | MCP e plugins (locais e de marketplace) com segundo passo, trilha e segredo que não volta; `.mcp.json` aprovado por conteúdo | B-18…B-30, B-47 | 🔲 |
| F3 | [Configuração de projeto](F3-project-config.md) | tudo o que o `.claude/` injeta, visível e criável; skills das três origens | B-31…B-40 | 🔲 |
| F4 | [E2E e smoke-live](F4-e2e.md) | o plano pela porta do usuário e contra o Claude real | B-41…B-46 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O desenho se apoia em medição, não em leitura de tipo | B-01, B-46 | [descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md) | S-01…S-05, S-196…S-199 |
| Nenhuma porta de configuração desliga a aprovação em silêncio — verificado por máquina | B-02, B-08 | [09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática), [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-06…S-09, S-145 |
| Módulo próprio, sem ciclo, com o SDK só no adapter | B-03 | [backend/03-modules](../../architecture/backend/03-modules.md#criando-um-módulo-novo) | S-14 |
| Contrato WS novo nas três pontas, sem subir `v` | B-05, B-46 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-10, S-11, S-199 |
| Todo erro com código, chave de tradução e status com significado | B-06 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-12, S-23, S-39…S-42, S-64…S-67, S-69, S-77, S-102 |
| Toda ampliação do que roda na máquina entra na trilha antes do efeito | B-07, B-14, B-19, B-24, B-25, B-27, B-34 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit), [backend/05-persistence](../../architecture/backend/05-persistence.md#os-fatos-de-conta) | S-13, S-43, S-44, S-79, S-108, S-114, S-127, S-164 |
| A tela é própria, com link que reproduz a seção e a pasta | B-09, B-16 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-15, S-54…S-56 |
| Modelos, agents e conta vêm da instalação, nunca de lista no código, e sem sessão aberta | B-10, B-11, B-13 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-16…S-28, S-34…S-36 |
| O diagnóstico diz por que o Claude não funciona aqui, e o teste de conexão diz o que custa | B-11, B-12 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada) | S-24…S-33 |
| Padrões por usuário e por pasta chegam à sessão nova, e nunca `bypassPermissions` | B-14, B-15 | [backend/03 · session](../../architecture/backend/03-modules.md#session) | S-37…S-53 |
| Servidor MCP é validado, descrito por extenso e gravado com segredo que nunca volta | B-18, B-19 | [03-logging](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) | S-63…S-80 |
| Servidor MCP não recebe os segredos do backend, e o segredo dele não passa pelo argv | B-20, B-21 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#options--o-que-amarramos) | S-81…S-87, S-03 |
| Status vivo, e controle de MCP dentro da sessão (no app, só o status); apertar vale já | B-22, B-23 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor) | S-88…S-99, S-215 |
| O `.mcp.json` do repositório só entra aprovado por nós, e volta a pendente quando muda | B-24 | [plano 03 · D-09](../03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade) | S-100…S-110 |
| Testar um servidor é executar o comando: auditado e sob a capacidade | B-25 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-111…S-115 |
| Toda tool MCP passa pelo `canUseTool` e pelo `PreToolUse`; regra não sobrevive à troca do programa | B-26 | [backend/04 · a ponte de permissão](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão) | S-116…S-122, S-02 |
| Plugin local com o que traz à vista e sem MCP sozinho | B-27, B-29 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-123…S-130, S-137 |
| Plugin de marketplace só de fonte declarada, baixado pelo backend, fixado e atualizado só por decisão | B-47, B-29 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-200…S-213 |
| Telas de MCP e plugins completas, com segundo passo e segredo só escrita | B-28, B-29 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-131…S-137 |
| A configuração de projeto é lida pelo formato publicado, nunca por superfície não pública | B-31 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources) | S-141…S-147 |
| Memória, comandos, subagents e estilos: visíveis, com o que vale aqui, e criáveis pelo editor | B-32, B-33, B-36, B-37 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-148…S-153, S-175…S-178 |
| Skills de projeto, usuário e sistema, com origem e preferências, sem ampliar `settingSources` | B-34, B-35 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) (emendada pela B-02) | S-154…S-174, S-194, S-197 |
| Hooks, permissões e plugins do projeto: só leitura, explicados sem eufemismo | B-38 | [backend/04 · diretório confiado](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido) | S-179…S-181, S-198 |
| Telas de projeto e skills completas | B-39 | [web/01-architecture](../../architecture/web/01-architecture.md) | S-182 |
| Toda tela com ajuda de verdade, tooltips, palette, teclado e axe, traduzida | B-17, B-30, B-40, B-45 | [02-i18n](../../architecture/shared/02-i18n.md), [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-57…S-62, S-138…S-140, S-183, S-184, S-195 |
| O que este plano põe na conversa chega ao app com o mesmo conteúdo e formato do web (D-31) | B-46 | [plano 26](../26-mobile-conversation-parity/README.md), [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-214 |
| O plano pela porta do usuário | B-41…B-45 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios) | S-185…S-195 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

A F0 e a F1 criaram tudo no `claude-config` e sob `/claude/*`; a
[28 · F6](../28-agent-neutral-core/F6-engine-extensions.md) move isso para a forma abaixo, e a F2…F4 já nascem nela
([D-33](decisions.md#d-33--ajuste-às-diretivas-do-plano-28)). Os nomes de pasta do núcleo são proposta, confirmada
pela 28 · F6.

```
packages/contracts/schema/
├── commands/    session-toggle-mcp-server · session-reconnect-mcp-server        (canônicos, capacidade mcp)
├── events/      session-mcp-status-changed        (session-started ganha effort, outputStyle, defaultsFrom)
└── http/        as rotas novas de /engines/:engine/* e /engines/claude/* (28 · D-09)

backend/src/
├── domain/
│   ├── <padrões>/                 F1, movido pela 28 · F6 — padrões da sessão, por motor (núcleo)
│   ├── mcp/                       F2 — McpServer · aprovação por digest (núcleo, capacidade mcp)
│   └── engines/claude/            F2, F3 — plugins · preferências de skills · configuração de projeto
├── application/
│   ├── mcp/ports/                 F2 — store · segredo · sessões vivas · revogação de regra · fonte do projeto
│   └── engines/claude/            F2, F3 — casos de uso da extensão (+ catálogo da F1)
├── adapter/
│   ├── inbound/http/engines/      /engines/:engine/{defaults,models,mcp-servers,project-mcp-approvals}
│   │   └── claude/                /engines/claude/{account,installation,diagnostics,plugins,skills,project-config}
│   ├── outbound/engines/claude/   installation-catalog · model-check · mcp-probe · mcp-status · skills-plugin-builder
│   │                              · flag-settings (allowlist) · nome nativo mcp__srv__tool → kind mcp · leitor de .claude/
│   │                              e do .mcp.json dentro da allowlist
│   └── outbound/mcp/              F2 — repositório Drizzle · cifra do segredo
├── infrastructure/
│   ├── modules/engines/claude.module.ts      a composição (28 · F1)
│   └── database/migrations/       tabelas novas (com engine) · kinds mcp.* (núcleo) e engine.* (extensão) no CHECK
└── shared/                        ambiente do subprocesso sem os segredos do backend (neutro)

web/src/
├── features/<padrões>/ · features/mcp/   seções do núcleo — Modelos e padrões · Servidores MCP — e o indicador de
│                                          MCP no painel do 08, só com a capacidade mcp
├── engines/claude/settings/       F2, F3 — seções da extensão: Conta · Instalação · Plugins · Skills · Projeto
├── engines/claude/index.ts        registra seções, comandos e ajuda nos registros do núcleo
└── app/engines.ts                 a composição: o único arquivo que importa engines/*
mobile/lib/features/session/       F2 — o chip só de leitura de MCP, pelo evento canônico e pela capacidade
e2e/
├── fixtures/                      servidor MCP stdio mínimo · .mcp.json · skill e subagent de fixture
├── specs/                         claude-settings
└── smoke-live/                    claude-settings
scripts/lib/agent-sdk-rules.mjs    strictMcpConfig · updateSettings · flag/managed settings · permission_policy
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Servidor MCP e plugin são **código arbitrário** rodando com as credenciais do usuário, subindo com a sessão — antes de qualquer pedido de permissão | **aberto** — mitigado por desenho: segundo passo com o comando por extenso, trilha antes do efeito, strict, apertar vale já, subprocesso sem os segredos do backend (B-19…B-27, B-47). Plugin de marketplace é código baixado da rede: só de fonte declarada no arquivo, fixado no commit, sem rodar nada ao baixar e sem atualizar sozinho (D-15). O resíduo é o que o usuário escolhe rodar |
| R-02 | Segredo de MCP vazando — pelo argv (medido no código do SDK), pelo log, pela trilha, pela resposta, pela mensagem de erro do servidor | **aberto** — [D-02](decisions.md#d-02--segredo-de-servidor-mcp); S-03, S-70, S-74, S-75, S-86, S-96, S-188 |
| R-03 | Hooks de projeto podem rodar comando nas nossas sessões sem ninguém aprovar, e subagent de projeto pode pedir modo próprio | **aberto** até a B-01 medir — [D-17](decisions.md#d-17--permissões-hooks-e-plugins-de-projeto); a tela mostra, e desligar é decisão de produto maior |
| R-04 | Shell inline (`!`) de skill e slash command pode rodar fora da aprovação e da trilha | **aberto** até a B-01 medir — [D-21](decisions.md#d-21--shell-inline-de-skills-e-slash-commands) bloqueia a B-35 |
| R-05 | Superfície do SDK `0.3.x` muda sem aviso: `strictMcpConfig`, `initializationResult`, o layout dos plugins instalados, os métodos de MCP | **aberto** — só métodos públicos (B-08); `smoke-live` cobre (B-46), sob demanda |
| R-06 | A sonda efêmera custa um subprocesso (~222 MB) e pode disputar a capacidade com as sessões | **aberto** — [D-05](decisions.md#d-05--catálogo-sem-sessão-viva): sessão viva primeiro, uma sonda por chave, conta na capacidade |
| R-07 | Uma regra `allow` de `mcp(<nome>:…)` autorizando um programa diferente do avaliado | **aberto** — [D-12](decisions.md#d-12--regra-de-tool-mcp-quando-o-servidor-muda): a troca revoga |
| R-08 | Hoje o subprocesso do CLI recebe o ambiente inteiro do backend — todo servidor stdio o herdaria | **aberto** — a B-20 corrige, com a lista vinda do schema de configuração; o plano 12 precisa da mesma função |
| R-09 | Divergir dos planos 06 e 08 (seção "Claude" das Configurações, seletor de modelo, indicador de MCP) | **aberto** — [D-09](decisions.md#d-09--a-seção-claude-das-configurações-do-app), [D-14](decisions.md#d-14--quem-entrega-o-indicador-de-mcp-da-sessão); os dois são avisados por nota ao executar |
| R-10 | O que este plano traz para a conversa (tool MCP, skill, subagent e hook do projeto, output style) chegar ao app sem conteúdo ou sem formato — hoje o app descarta texto de subagent, mostra markdown cru e o nome cru da tool MCP | **aberto** — [D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): a F2 espera o [plano 26](../26-mobile-conversation-parity/README.md), e a B-46 exige a paridade com as fixtures deste plano |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação. A F0 começa pela B-01: nenhuma
   decisão que depende de medição é tomada antes dela.
3. Ao fim de cada fase: o critério da fase (`pnpm verify` e o que ela lista). Vermelho → corrige e
   **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md), e rode `pnpm plan progress 12`.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. O plano fecha com o critério de conclusão acima — os três comandos saindo com 0.
