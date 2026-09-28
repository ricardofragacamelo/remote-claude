# Plano 06 — Workbench

**Objetivo:** a web vira um workbench no molde do VS Code — boas-vindas que abrem uma pasta da
máquina navegando pelas raízes liberadas, cada pasta num workbench completo em sua própria aba (com
arquivos, editor e o chat do Claude lado a lado), e uma tela própria para cada outro assunto.

**Depende de:** [plano 05](../05-hardening-operations/README.md) concluído — decisão do usuário de
2026-09-26 ([D-02](decisions.md#d-02--a-ordem-em-relação-aos-planos-05-e-17)); **não** depende do
[17](../17-distribution/README.md).

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

Este plano não muda o contrato WebSocket; por isso `pnpm test:e2e:mobile` não entra no critério.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário subiu a web e "não era bem isso". Queria **um client do Claude parecido com o VS Code**:
os arquivos, o chat, o que o Claude fez, numa pasta escolhida da máquina. Recebeu uma coluna
`max-w-3xl` com cards soltos — seletor de workspace, "Start session", um ping de diagnóstico,
dispositivos. "Muito pobre", e misturando assuntos.

E o caso concreto que ele relatou mostra que o problema não é só de aparência: abriu uma sessão e o
Claude disse estar em `/tmp/remote-claude-workspaces`, "que não é git nem nada". Ele esperava
`~/projects/remote-claude`. Três causas, todas atacadas aqui:

| Causa | Resposta |
|---|---|
| A allowlist de desenvolvimento só declara a raiz de scratch, e liberar outra exige editar o arquivo versionado | `pnpm allowlist add ~/projects/remote-claude` escreve numa cópia local ignorada pelo git, pelo mesmo schema, e o backend recarrega (B-10, B-11) |
| Não há como **ver** as subpastas de uma raiz — só digitar o caminho | listagem de um nível, sob demanda, dentro da allowlist (B-06…B-08) e o diálogo "Abrir pasta" (B-15) |
| A home escolhe a primeira raiz sem perguntar, num store global de "workspace selecionado" | a pasta é da **aba** e está na URL; a sessão nasce nela e o store global sai (B-16, B-20, B-33) |

Duas decisões do usuário, de 2026-09-26, dão a forma:

- **a paridade com o VS Code é a de arquivos** — abrir, criar, funções de arquivo, editar. O que
  este plano traz da casca é o que serve a isso: abas de pasta, menu **Arquivo**, command palette,
  centro de notificações, estado restaurado por aba. Editor de atalhos, vários temas, zen mode,
  layout configurável, menu completo e walkthrough ficam fora;
- **o chat do Claude e o sistema de arquivos e editor ficam na mesma aba**: explorer, editor e chat
  lado a lado, ao mesmo tempo. O chat nunca é uma tela nem uma rota própria.

E uma escolha de arquitetura que decide o resto: **construir em React, não embutir o VS Code**
([D-01](decisions.md#d-01--construir-o-workbench-ou-embutir-o-vs-code)). O VS Code embutido traz
terminal e extensões que executam na máquina fora do `canUseTool` e do `PreToolUse` — e "nenhuma
tool sensível roda sem um humano dizer sim" deixaria de valer para metade da tela.

Este plano é a **casca**: onde cada coisa mora e como se chega a ela. O conteúdo vem dos planos
seguintes, que registram as suas views, comandos, seções e telas nos registros que ele cria.

---

## Escopo

### Entra

| | |
|---|---|
| ADR-014, documentos normativos do web e do backend, contrato HTTP, códigos de erro, mapa de rotas | F0 |
| Listagem de subpastas; recentes (fixáveis) e pastas abertas por usuário; versões para o "Sobre"; histórico de notificações no servidor | F1 |
| **Raízes locais de desenvolvimento** por script (`pnpm allowlist`), e a recarga explícita que faltava | F1 |
| Boas-vindas, diálogo "Abrir pasta", pasta na URL, sessão nascendo na pasta escolhida | F2 |
| Sistema visual (densidade, tokens, claro/escuro, lucide), moldura com navegação global, **moldura de tela com ajuda** | F3 |
| **Abas de pasta** — um workbench completo por pasta, várias abertas, estado isolado — e a casca (activity bar, side bar, editor, secondary side bar, painel, status bar), responsiva | F3 |
| Registro de comandos e atalhos, command palette, menu Arquivo, centro de notificações (histórico no servidor), estado por aba restaurado | F4 |
| **Uma tela por assunto**: Auditoria, Regras, Dispositivos, Logs e diagnóstico, Configurações, Sobre; a home desmontada; rotas antigas de sessão e histórico removidas; ajuda e usabilidade de cada tela | F5 |
| E2E do workbench pela porta do usuário | F6 |

### Não entra

Deliberadamente fora — cada item diz para onde foi, ou por quê:

- **Explorer, editor e funções de arquivo** — [plano 07](../07-explorer-and-editor/README.md). Este
  plano reserva a view e a área de editor.
- **O painel do Claude completo** (conversas, sessões da pasta, markdown, diffs, menções) —
  [plano 08](../08-claude-panel/README.md). Até lá, a secondary side bar hospeda os componentes de
  sessão de hoje.
- **Ler, continuar e desfazer uma conversa antiga pelo web** — decisão do usuário de 2026-09-28
  ([D-07](decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)): `/history` e `/sessions/$id`
  saem neste plano, e o histórico volta ao web com a view Sessões do plano 08. O app continua com ele.
- **Busca** (Quick Open, busca em arquivos, substituir) — [plano 09](../09-search/README.md).
- **Terminal** — [plano 10](../10-integrated-terminal/README.md).
- **Configuração do Claude** (modelo e permission mode padrão, MCP, configuração de projeto) —
  [plano 11](../11-claude-settings/README.md). Nunca é seção das Configurações do app.
- **O redesenho da Auditoria e das Regras** — planos [12](../12-audit-explained/README.md) e
  [13](../13-rules-management/README.md). Aqui elas só ganham tela própria, com o conteúdo de hoje.
- **Uso e custo** — [plano 14](../14-usage-and-cost/README.md). Aqui, só a posição na navegação.
- **A profundidade de Dispositivos e de Logs e diagnóstico** — planos [15](../15-devices/README.md)
  e [16](../16-logs-and-diagnostics/README.md). Aqui, a tela com o que já existe.
- **Inteligência de linguagem e depuração** (LSP, "Problemas", go-to-definition, debugger) —
  decisão do usuário de 2026-09-26: o produto não os terá.
- **Controle de versão (git)** — decisão do usuário de 2026-09-26. A activity bar tem Explorer, Busca
  e Sessões do Claude.
- **Editor de atalhos, vários temas, zen mode, layout configurável, menu completo, walkthrough** —
  decisão do usuário de 2026-09-26 (paridade é a de arquivos). Fica o menu Arquivo e claro/escuro.
- **Marketplace de extensões do VS Code** — e o motivo é o mesmo da D-01: extensão executa fora da
  permissão e da trilha.
- **Multi-root workspace** (várias raízes numa árvore só), **notebooks**, **colaboração em tempo
  real**, **settings sync**.
- **Editar a allowlist pela UI.** Mudá-la exige acesso ao disco da máquina — é a razão de ela ser
  arquivo ([backend/03](../../architecture/backend/03-modules.md#workspace)). A UI mostra, só leitura,
  com o comando.
- **O app Flutter ganhar as telas novas.** O web é mobile-first e responde no celular; o app segue
  com aprovação e histórico.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | ADR-014, documentos normativos, contrato HTTP, códigos de erro, rotas | B-01…B-05 | 🔲 |
| F1 | [Navegar pelas pastas](F1-directory-browse.md) | listagem de subpastas, recentes e abas no servidor, `pnpm allowlist`, recarga, versões, histórico de notificações | B-06…B-12, B-40 | 🔲 |
| F2 | [Abrir pasta](F2-open-folder.md) | boas-vindas, diálogo, pasta na URL, sessão na pasta escolhida | B-13…B-16 | 🔲 |
| F3 | [Moldura e casca](F3-layout.md) | sistema visual, navegação global, moldura de tela, abas de pasta, casca responsiva | B-17…B-22 | 🔲 |
| F4 | [Comandos e notificações](F4-commands.md) | registro, paleta, menu Arquivo, notificações, estado por aba | B-23…B-27 | 🔲 |
| F5 | [Telas separadas](F5-screens.md) | uma tela por assunto, home desmontada, rotas antigas removidas, ajuda | B-28…B-34 | 🔲 |
| F6 | [E2E](F6-e2e.md) | o workbench pela porta do usuário | B-35…B-39 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O workbench substitui a coluna única, decidido e documentado antes do código | B-01, B-02 | [00-decisions](../../architecture/shared/00-decisions.md), [web/03](../../architecture/web/03-ui-system.md) | S-89, S-116, S-117, S-164, S-165 |
| Listar pasta passa a existir, com os códigos novos no catálogo e traduzidos | B-03, B-04 | [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace), [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-01, S-02, S-25, S-43 |
| A URL reproduz a tela; as rotas de auditoria e regras continuam, as de sessão e histórico saem | B-05, B-33 | [web/04 · A URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-03…S-07, S-150, S-163 |
| Listagem de um nível, só diretórios, com teto, sem sair da allowlist nem por symlink | B-06…B-08 | [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace) | S-08…S-33 |
| Recentes e pastas abertas por usuário, idempotentes e revalidados | B-09 | [backend/05 · Migrations](../../architecture/backend/05-persistence.md#migrations) | S-34…S-49 |
| **O caso relatado**: liberar o projeto com um comando, sem YAML à mão e sem afrouxar a fronteira | B-10, B-11 | [07-repository-layout · Configuração](../../architecture/shared/07-repository-layout.md#configuração-e-segredo) | S-50…S-64, S-179, S-180 |
| **O caso relatado**: a sessão nasce na pasta escolhida, nunca na primeira raiz | B-16, B-33 | [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace) | S-78…S-83, S-149, S-156 |
| Boas-vindas e diálogo "Abrir pasta" navegando pelas raízes | B-13…B-15 | [web/03 · Estados de tela](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-69…S-77, S-84, S-85, S-155, S-157 |
| Versões na tela "Sobre" | B-12, B-32 | [backend/03](../../architecture/backend/03-modules.md) | S-65…S-68, S-148 |
| Sistema visual consistente, claro e escuro, verificado por máquina | B-17 | [web/03 · Tema](../../architecture/web/03-ui-system.md#tema) | S-86…S-88, S-162 |
| Uma tela por assunto, pela navegação global; configurações do app e do Claude nunca juntas | B-18, B-28…B-31 | [web/03](../../architecture/web/03-ui-system.md) | S-89…S-92, S-136…S-147 |
| Toda tela com propósito, ajuda, tooltips, estados vazios que ensinam | B-19, B-34 | [web/03](../../architecture/web/03-ui-system.md), [i18n](../../architecture/shared/02-i18n.md) | S-93…S-95, S-151…S-154 |
| Abas de pasta: várias, isoladas, persistidas, sem encerrar sessão ao fechar | B-20 | [web/04 · Onde cada estado mora](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) | S-96…S-110, S-158, S-159, S-181 |
| Arquivos, editor e chat do Claude lado a lado na mesma aba; views alternáveis no celular | B-21, B-22 | [web/03 · Responsividade](../../architecture/web/03-ui-system.md#responsividade) | S-111…S-118, S-161 |
| Comandos registrados uma vez: paleta, menu Arquivo e ajuda dizem o mesmo | B-23…B-25 | [web/03](../../architecture/web/03-ui-system.md) | S-119…S-129, S-160 |
| Notificações com histórico no servidor, e estado de cada aba restaurado ao recarregar | B-26, B-27, B-40 | [web/04](../../architecture/web/04-state-and-data.md), [backend/03 · notification](../../architecture/backend/03-modules.md#notification) | S-130…S-135, S-167…S-178, S-182 |
| O workbench provado pela porta do usuário | B-35…B-39 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-155…S-163, S-166 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
scripts/allowlist.mjs                    pnpm allowlist add|list|remove — a cópia local, pelo mesmo schema
infra/workspace-allowlist.local.yaml     (ignorado pelo git; criado pelo script — D-09)
packages/config/                         o schema da allowlist, lido pelo backend e pelo script

backend/src/
├── domain/workspace/services/           listagem de filhos (regra pura)
├── application/notification/            histórico do centro de notificações (D-17)
├── application/workspace/               list-directories · recent-folders · open-folders
│   └── ports/                           workspace-directory.lister · folder-usage.repository
├── adapter/
│   ├── inbound/http/workspace/          /workspaces/directories · /recent · /open-folders
│   ├── outbound/filesystem/             node-workspace-directory.lister (fs.opendir)
│   └── outbound/persistence/workspace/  a tabela de pastas por usuário
├── infrastructure/config/               SIGHUP → reload() da allowlist (D-15)
└── infrastructure/database/migrations/  migrations versionadas novas: pastas por usuário, notificações

web/src/
├── app/                                 moldura, navegação global, rotas (/workbench, /devices,
│                                        /diagnostics, /settings/$section, /about)
├── features/workbench/                  abas de pasta, casca, activity bar, status bar
├── features/workspace/                  boas-vindas, diálogo Abrir pasta, recentes
├── features/commands/                   registro, paleta, menu Arquivo
├── features/notifications/              toasts e centro de notificações
├── features/diagnostics/                Logs e diagnóstico (o ping)
├── features/settings/                   Configurações do app, registro de seções
├── features/about/                      Sobre
└── shared/components/                   ScreenFrame (cabeçalho, propósito, painel de ajuda)

e2e/{fixtures,scenarios,specs}/          árvore de pastas, Claude que reporta o cwd, specs do workbench
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | A listagem de pastas vira um mapa da máquina — ler o disco era justamente o que o `workspace` não fazia | **aberto** — um nível, só diretórios, dentro da allowlist, contenção no realpath, symlink que escapa omitido, log sem nomes (B-06…B-08, [D-03](decisions.md#d-03--alcance-do-seletor-dentro-das-raízes-ou-a-máquina-inteira), [D-04](decisions.md#d-04--ocultas-pastas-pesadas-e-symlinks-no-seletor)) |
| R-02 | A cópia local da allowlist afrouxa a fronteira: commitada por engano, `/` liberado, `$HOME` sem saber o que é | **aberto** — `.gitignore` provado por teste (S-56), `/` recusado, `$HOME` com confirmação (S-53, S-54), mesmo schema e mesma falha no boot (S-57, S-58), e2e nunca a lê (S-59) |
| R-03 | Estado vazando entre abas de pasta — o desenho atual é um store global, e é ele que levou a sessão para o `/tmp` | **aberto** — store por pasta criado por fábrica (B-20), cenário de vazamento (S-99), store global removido com teste que impede a volta (B-33, S-149) |
| R-04 | O plano é grande — sete fases e a casca inteira do web | **aberto** — a paridade foi cortada para a de arquivos (decisão do usuário); os planos seguintes preenchem, este só reserva; se a F3 ou a F4 não fecharem num ciclo, o corte é registrado no [progresso](progress.md) |
| R-05 | Abas inativas consomem memória e anexos de sessão, e podem esbarrar no limite por connection do plano 05 | **aberto** — [D-11](decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas): árvore desmontada e watcher liberado; sessões e terminais seguem anexados, e as dez sessões da instalação cabem nos 16 anexos; teto de 8 abas, ajustado pela medição |
| R-06 | Atalhos prometidos que o navegador não entrega (`Ctrl+Tab`, `Ctrl+W`) | **aberto** — [D-16](decisions.md#d-16--atalhos-que-o-navegador-reserva), com o registro recusando tecla reservada |
| R-07 | Mudar a moldura quebra os deep links de hoje (a trilha filtrada, a regra, a volta do login) | **aberto** — as rotas de auditoria e regras não mudam (B-05), cenários de rota e de login (S-06, S-91) e o e2e das rotas (S-163). As de sessão e histórico saem por decisão (D-07), e os specs que entravam por elas migram na B-33 |
| R-08 | Planos 11–13 e 14–16 dependem da navegação e da moldura de tela deste | **aberto** — registros (navegação, views, seções, comandos, restauração) documentados na F0 e testados na F3–F5, para que eles encaixem sem editar este plano |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) e feche as
   [decisões](decisions.md) que bloqueiam a fase antes de começá-la.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md), e rode `pnpm plan progress 06`.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
