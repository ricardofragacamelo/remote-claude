# Plano 12 — Terminal integrado

**Objetivo:** um terminal de verdade na pasta aberta, no painel inferior, como no VS Code — sem
virar um shell remoto sem dono.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full       # sai com código 0
pnpm test:e2e:mobile   # o contrato WS mudou: o app continua verde com os tipos novos
pnpm test:e2e:live     # a B-13 mexe no ambiente do subprocesso do Claude: só o Claude real prova que ele segue funcionando
```

**Depende de:** [plano 06](../06-workbench/README.md) — a casca do workbench (painel inferior, abas
de pasta, command palette, moldura de tela com ajuda, Configurações). Os planos
[07](../07-explorer-and-editor/README.md) (o editor, para os links de caminho e o "executar seleção
no terminal") e [08](../08-claude-panel/README.md) (as sessões da aba de pasta, que dão conteúdo à
aba Saída, e o `@terminal`) **enriquecem** o painel se já existirem; nada aqui espera por eles.

> **Este plano pode ser encerrado na primeira task.** A [D-01](decisions.md#d-01--o-terminal-existe)
> — o terminal existe? — bloqueia todas as fases. O usuário preferiu o terminal a "só tarefas" em
> 2026-09-26; o que falta é a **aceitação escrita** de que ele fica fora da premissa do produto
> (ADR-017, aberta na B-01).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O pedido é "como no VS Code", e o VS Code tem um terminal no painel de baixo. Mas este produto tem
uma premissa que o VS Code não tem: **nenhuma tool sensível roda sem um humano dizer sim**. O
`canUseTool` para o loop até alguém responder, o hook `PreToolUse` registra **toda** invocação com o
input exato, e a allowlist diz onde uma sessão pode nascer.

**Dentro de um shell, nada disso vale** — e o plano começa dizendo isso, não escondendo:

| O que o produto garante hoje | No terminal |
|---|---|
| um humano leu **este** comando antes de ele rodar | ninguém lê: o humano digita |
| a trilha tem o comando, com o input exato | a trilha tem abrir, reanexar e fechar — **nunca** as teclas, porque a senha digitada no `sudo` iria junto |
| a allowlist limita onde se chega | não limita nada: o shell faz `cd /`, lê `~/.ssh`, `~/.claude/.credentials.json` e o `.env` do backend |
| raiz de outra pessoa responde `403` | todo terminal é a **conta do SO que roda o backend**: ligá-lo para alguém é entregar essa conta |

O que o terminal **não** piora: quem tem um access token do web já executa comando arbitrário —
abre uma sessão, pede um `Bash`, aprova o próprio pedido. O modelo de permissão protege contra o
Claude fazer o que ninguém pediu, não contra o humano autenticado. O que se perde é o **rastro por
comando**. É essa troca que a [D-01](decisions.md#d-01--o-terminal-existe) pede para assinar.

Por isso o desenho é de cercas, cada uma com o limite dito:

| Cerca | Protege contra | Não protege contra |
|---|---|---|
| **Desligado por padrão**, ligado por usuário num arquivo da máquina ([D-08](decisions.md#d-08--onde-mora-o-interruptor)) | ligar um shell remoto pela rede | quem já tem acesso ao disco |
| **Step-up** — `auth_time` recente para abrir e reanexar ([D-02](decisions.md#d-02--como-provar-reautenticação-recente)) | token velho vazado, sessão de navegador esquecida | quem tem a senha do usuário |
| **Só do web** — `azp` do token, sem `installId` ([D-09](decisions.md#d-09--o-que-prova-que-o-pedido-vem-do-web)) | celular perdido virando shell | quem faz o fluxo do web num script com as credenciais do usuário |
| **Ambiente sem os segredos do backend** (B-07) | `env` mostrando a senha do banco | o que a conta do SO lê do disco |
| **Nenhum shell sem dono** — carência, TTL ocioso, shutdown, varredura de órfãos (B-11) | shell que sobrevive a quem o abriu | job que o próprio usuário desacoplou (`nohup`) |
| **Trilha de abrir/fechar, sem teclas** ([D-03](decisions.md#d-03--o-que-a-trilha-grava)) | "quem abriu um shell, quando, de onde, por quanto tempo" | "o que foi feito nele" — e a trilha diz isso |

E um achado deste planejamento, que existe **sem** terminal nenhum: o subprocesso do Claude nasce
hoje com o ambiente inteiro do backend, `.env` incluído — um `env` num `Bash` mostra a senha do
banco ([D-10](decisions.md#d-10--o-ambiente-do-subprocesso-do-claude)). A B-13 corrige com a mesma
função que filtra o ambiente do shell; se a D-01 encerrar o plano, ela vai para o
[plano 05](../05-hardening-operations/README.md).

---

## Escopo

### Entra

| | |
|---|---|
| ADR-017; interruptor em arquivo, desligado por padrão; step-up; só do web; contrato `terminal.*` nas três pontas; códigos novos; redação dos bytes no log | F0 |
| Módulo `terminal`: PTY na pasta, ambiente filtrado, limites, reconexão com scrollback, carência, TTL, shutdown e órfãos, trilha sem teclas, perfis de shell, shell integration | F1 |
| O subprocesso do Claude sem os segredos do backend | F1 |
| Painel inferior: vários terminais, divisão lado a lado, renomear/ícone/cor, busca no scrollback, links clicáveis, marcas de comando, aba Saída, recusas e reautenticação na tela, Configurações › Terminal, ajuda | F2 |
| E2E do ciclo e das recusas, e o app verde com o contrato novo | F3 |

### Não entra

- **Tarefas** (`package.json`, `pnpm`, `Makefile`, `tasks.json`) e *problem matchers*. Decisão do
  usuário de 2026-09-26: o terminal fica, as tarefas saem.
- **Depuração e inteligência de linguagem.** Removidas do roteiro pelo usuário em 2026-09-26.
- **Gravar as teclas ou a saída do terminal**, em trilha, log ou disco. Proibido pela
  [D-03](decisions.md#d-03--o-que-a-trilha-grava): a entrada carrega a senha digitada.
- **Terminal que sobrevive ao restart do backend.** Não é escolha, é arquitetura: o PTY morre com o
  processo que o segura. A reconexão cobre recarregar a página, não reiniciar o servidor.
- **Terminal no app Flutter.** O app ganha só os tipos do contrato; o web é mobile-first e o painel
  responde no celular. Fora dos planos 06 em diante.
- **Terminal na área do editor e terminal remoto (SSH, containers).** Enfeite de IDE fora da
  paridade de arquivos que o usuário pediu em 2026-09-26; o terminal remoto, além disso, abriria um
  segundo alcance de rede sem nenhuma das cercas acima.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Decisão e contrato](F0-decision.md) | ADR-017, interruptor, step-up, só do web, contrato e redação | B-01…B-05 | 🔲 |
| F1 | [PTY](F1-pty.md) | o módulo `terminal`, o ambiente filtrado (também o do Claude), perfis e shell integration | B-06…B-15 | 🔲 |
| F2 | [Interface do terminal](F2-terminal-ui.md) | o painel inferior completo, as recusas na tela, as Configurações e a ajuda | B-16…B-22 | 🔲 |
| F3 | [E2E](F3-e2e.md) | o ciclo e as recusas pela porta do usuário, e o app verde | B-23…B-26 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O terminal só existe por decisão escrita que diz o que ele não protege (ADR-017) | B-01 | [00-decisions](../../architecture/shared/00-decisions.md) | S-01, S-03, S-61 |
| Desligado por padrão; ligado por usuário num arquivo da máquina, com recarga explícita que encerra quem saiu | B-02, B-11 | [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace), [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada) | S-01…S-08, S-12…S-14 |
| Só do web: o app não abre terminal, e a declaração do cliente não prova nada | B-02, B-06 | [08-authentication](../../architecture/shared/08-authentication.md) | S-09…S-11, S-175 |
| Abrir e reanexar exigem reautenticação recente, com falha fechada | B-03, B-06, B-10 | [08-authentication](../../architecture/shared/08-authentication.md#validação-no-backend) | S-15…S-24, S-40, S-84, S-171 |
| Contrato `terminal.*` nas três pontas, com `seq` por terminal | B-04 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-25…S-31, S-67, S-68 |
| Nenhum byte de terminal no log — nem no do web | B-05 | [03-logging](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) | S-32…S-36, S-105 |
| O shell nasce sem os segredos do backend, e com o ambiente do usuário | B-07 | [09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática) | S-41…S-48, S-172 |
| O subprocesso do Claude deixa de herdar os segredos do backend | B-13 | [backend/04](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos) | S-108…S-110 |
| O shell nasce na pasta aberta, e a allowlist decide só isso | B-08 | [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace) | S-49…S-52, S-164, S-167 |
| Os bytes chegam inteiros, e uma enxurrada não derruba a connection que também leva a sessão | B-08 | [backend/06](../../architecture/backend/06-realtime.md#fan-out) | S-53…S-57 |
| `node-pty` confinado a um adapter, carregado só quando ligado | B-08 | [09-code-quality](../../architecture/shared/09-code-quality.md#backend--dependency-cruiser) | S-62…S-64 |
| Limites por usuário e da instalação, sem nunca passar do teto | B-06, B-09 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada) | S-37…S-39, S-70, S-76, S-78 |
| Terminal de outra pessoa não é alcançável | B-09, B-10 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-71, S-72, S-79, S-80, S-85 |
| Reconectar devolve o terminal com o scrollback; uma connection vê de cada vez | B-10 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#reconexão-e-replay) | S-81…S-83, S-86…S-88, S-166 |
| Nenhum shell sem dono: carência, TTL, shutdown e órfãos | B-08, B-11 | [backend/06 · Shutdown](../../architecture/backend/06-realtime.md#shutdown) | S-58…S-60, S-65, S-89…S-99, S-169 |
| A trilha registra abrir, reanexar e fechar — nunca as teclas; sem trilha, não abre | B-12 | [backend/05](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) | S-100…S-107, S-173 |
| Perfis de shell detectados e personalizados, validados | B-14 | [backend/03](../../architecture/backend/03-modules.md) | S-31, S-111…S-116 |
| Shell integration desligável, que nunca serve de trilha | B-15, B-19 | [00-decisions](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-117…S-122, S-147 |
| Estado por aba de pasta, e aba inativa não mata terminal | B-16 | [web/01](../../architecture/web/01-architecture.md) | S-123…S-128 |
| O terminal no navegador: entrada, colagem segura, tamanho, tema, área de transferência, acessibilidade | B-17 | [web/03](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-129…S-135 |
| Vários terminais, divisão, aba Saída, e confirmação só para o destrutivo | B-18 | [web/03](../../architecture/web/03-ui-system.md#responsividade) | S-66, S-136…S-142, S-168 |
| Busca no scrollback, links seguros, marcas de comando, contexto para o Claude | B-19 | [web/03](../../architecture/web/03-ui-system.md) | S-143…S-149, S-168 |
| Recusas, reautenticação e reconexão na tela, com texto que diz o que fazer | B-20 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md), [02-i18n](../../architecture/shared/02-i18n.md) | S-150…S-155, S-170, S-171 |
| Configurações › Terminal e ajuda de verdade em toda tela | B-21, B-22 | [web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-156…S-163, S-174 |
| O ciclo e as recusas provados pela porta do usuário; o app verde | B-23…B-26 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-164…S-175 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
infra/
├── workspace-allowlist.yaml        seção `terminal: { users: [...] }` (ausente = desligado)
└── keycloak/                       `auth_time` no access token, `max_age` honrado

packages/contracts/schema/
├── commands/    terminal-open · terminal-attach · terminal-input · terminal-resize · terminal-close
└── events/      terminal-opened · terminal-output · terminal-attached · terminal-detached ·
                 terminal-title-changed · terminal-exited

backend/src/
├── domain/
│   ├── terminal/                   Terminal, TerminalPolicy, erros
│   ├── auth/                       isRecentlyAuthenticated (step-up)
│   └── shared/                     childEnvironment (terminal e Claude)
├── application/terminal/ports/     PtyPort, …
├── adapter/
│   ├── inbound/ws/terminal/        handlers terminal.*
│   ├── inbound/http/terminal/      GET /terminals, GET|PUT /terminals/profiles
│   └── outbound/terminal/          node-pty, headless + serialize, shell integration
│       └── shell-integration/      bash · zsh · fish
├── infrastructure/
│   ├── database/migrations/        kinds terminal.* em audit_events (migration nova)
│   └── lifecycle/                  shutdown e varredura cientes do terminal
└── …

web/src/features/terminal/          service · hooks · painel · componente (xterm atrás de TerminalView)
mobile/lib/…                        só os tipos gerados
e2e/specs/terminal.spec.ts

docs/architecture/
├── shared/00-decisions.md          ADR-017
├── shared/03-logging.md            redação dos bytes de terminal
├── shared/04-errors-and-http.md    códigos TERMINAL_* e STEP_UP_REQUIRED
├── shared/05-websocket-protocol.md seção Terminal; `seq` por stream
├── shared/07-repository-layout.md  configuração do terminal que falha fechada
├── shared/08-authentication.md     reautenticação recente
├── backend/03-modules.md           módulo `terminal`; kinds na trilha; seção do arquivo da allowlist
├── backend/04-claude-integration.md o que o subprocesso do Claude herda
└── backend/06-realtime.md          stream do terminal, fluxo, shutdown
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **O terminal fura a premissa do produto** — fora do `canUseTool`, da allowlist e da trilha por comando | **aberto.** É a [D-01](decisions.md#d-01--o-terminal-existe), que bloqueia todas as fases e pode encerrar o plano; a ADR-017 diz a exceção por extenso |
| R-02 | Ligar o terminal para um segundo usuário entrega a conta do SO que roda o backend, e as raízes que a allowlist não liberou para ele | **aberto** — dito na ADR-017 e na ajuda da tela; o interruptor é por `sub`, num arquivo da máquina ([D-08](decisions.md#d-08--onde-mora-o-interruptor)) |
| R-03 | Segredo do backend no ambiente do shell — e, **hoje**, no do subprocesso do Claude (medido no código: `markedEnvironment(process.env)` e o `.env` inteiro carregado pelo `pnpm dev`) | **aberto** — B-07 com lista de permissão para o shell, B-13 com lista de negação derivada do schema para o Claude ([D-10](decisions.md#d-10--o-ambiente-do-subprocesso-do-claude)); vai para o plano 05 se a D-01 encerrar este |
| R-04 | Shell sem dono: processo que sobrevive à desconexão, ao shutdown ou ao `kill -9` | mitigado no desenho — carência, TTL que não desliga, passo no shutdown e varredura pela marca (B-11); cenários contam processos, não confiam em log |
| R-05 | Tecla na trilha ou no log — a senha digitada no `sudo` | mitigado no desenho — redação antes do primeiro byte (B-05), trilha só de metadados (B-12), prova com senha-marcador (S-105) |
| R-06 | Módulo nativo (`node-pty`) quebra instalação e distribuição: o pnpm bloqueia scripts de instalação, e o plano 19 precisa empacotar o binário por SO | **aberto** — [D-04](decisions.md#d-04--node-pty-e-a-distribuição); desligado, o módulo nunca carrega; ligado e ausente, o boot recusa |
| R-07 | Step-up depende de uma claim (`auth_time`) que o provedor pode não pôr no access token | **aberto** — [D-02](decisions.md#d-02--como-provar-reautenticação-recente); sem a claim, recusa (falha fechada), nunca "deixa passar" |
| R-08 | Uma enxurrada de saída enche a fila da connection e o hub a derruba com `1013`, levando junto a sessão do Claude | **aberto** — [D-05](decisions.md#d-05--os-bytes-no-websocket): coalescência e pausa do PTY pela fila do socket, medidas antes de fechar |
| R-09 | "Só do web" é restrição de produto, não barreira: o client do web é público | aceito e dito — a ADR-017 e a [D-09](decisions.md#d-09--o-que-prova-que-o-pedido-vem-do-web) registram o limite; a origem conhecida do [plano 19](../19-distribution/README.md) soma quando chegar |
| R-10 | Exposição fora do loopback (plano 19) transforma o terminal num shell alcançável pela internet | **aberto** — as cercas acima valem em qualquer exposição; o plano 19 precisa saber, na D-04 dele, que existe um terminal a considerar — nota a entregar junto com a B-01, sem editar o plano 19 agora |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. **Feche a D-01 antes de qualquer task.** Se for "não", só a B-01 roda, e o plano fecha.
3. Uma fase por vez, em ordem. Ao fim de cada uma: o critério da fase.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
