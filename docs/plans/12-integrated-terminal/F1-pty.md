# F1 — PTY

Plano: [12 — Terminal integrado](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-decision.md).
**Entrega:** o módulo `terminal` no backend — um shell de verdade na pasta aberta, com ambiente sem
os segredos do backend, perfis, shell integration, limites, reconexão com scrollback, e nenhum
processo que sobreviva a quem o abriu; a trilha de abrir, reanexar e fechar, sem nenhuma tecla; e o
subprocesso do Claude, que hoje herda os segredos do backend, deixando de herdá-los.

---

## Por quê

O backend inteiro antes da tela porque as garantias moram aqui: a tela pode ser qualquer uma, o
ambiente do shell não. E o ambiente vem cedo (B-07) porque o achado que ele corrige já existe no
subprocesso do Claude ([D-10](decisions.md#d-10--o-ambiente-do-subprocesso-do-claude)) — a B-13
reusa a mesma função.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-06 — O módulo `terminal`: domínio e política 🔲

Módulo novo, nas quatro camadas ([criando um módulo](../../architecture/backend/03-modules.md#criando-um-módulo-novo)),
registrado no catálogo e no diagrama de fronteiras: `terminal` consulta `auth` (principal),
`workspace` (resolver a pasta) e escreve em `audit`. Nada de `@nestjs/*` em `domain/terminal/`.

- Entidade `Terminal` com estados `starting → running ↔ detached → exited`; transição inválida é
  erro de programação.
- `TerminalPolicy`, pura: quem abre (interruptor → origem web → step-up, nessa ordem, parando no
  primeiro que falha), limites por usuário e da instalação, dimensões. O step-up guarda abrir e
  reanexar — não a vida de um shell já aberto.
- Configuração com piso e teto ([D-06](decisions.md#d-06--limites-e-ttl)):
  `RC_TERMINAL_MAX_PER_USER`, `RC_TERMINAL_MAX_CONCURRENT`, em `.env.example` com comentário.

### B-07 — O ambiente dos processos filhos sem os segredos do backend 🔲

`childEnvironment(base, policy)` — função pura em `domain/shared/`, recebendo por parâmetro as
chaves que o schema de configuração declara (o domínio não conhece o schema; quem as passa é a
infraestrutura). Duas políticas:

- **terminal — lista de permissão:** `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`,
  `TZ`, `TMPDIR`, `XDG_*`, `SSH_AUTH_SOCK`; define `TERM=xterm-256color`, `COLORTERM=truecolor` e a
  marca do terminal; fallback de `LANG` e `HOME`. O shell é aberto como **shell de login**, que relê
  o perfil do usuário — é o que devolve a ele o próprio ambiente, sem devolver o do backend;
- **agente — lista de negação** (`agentPolicy`, nome neutro — [D-14](decisions.md#d-14--ajuste-às-diretivas-do-plano-28)): a da
  [D-10](decisions.md#d-10--o-ambiente-do-subprocesso-do-claude), usada pela B-13 para o subprocesso
  do Claude.

O teste lê as chaves **do schema**: variável nova de configuração é testada sem ninguém lembrar.
Regra de `semgrep` nova: spawn de PTY (e o `env` do `sdk-options.factory`) só com um valor que saiu
de `childEnvironment` ([segurança estática](../../architecture/shared/09-code-quality.md#segurança-estática)).
A lista de [redação](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) não
muda — o que muda é que o segredo deixa de chegar ao filho.

### B-08 — O adapter de PTY 🔲

Fecha a [D-04](decisions.md#d-04--node-pty-e-a-distribuição) e a parte de servidor da
[D-05](decisions.md#d-05--os-bytes-no-websocket). Porta `PtyPort` em `application/terminal/ports/`,
adapter em `adapter/outbound/terminal/` — o único lugar que importa `node-pty`
(`dependency-cruiser`, [regras de arquitetura](../../architecture/shared/09-code-quality.md#backend--dependency-cruiser)).

- `node-pty` em `onlyBuiltDependencies` do `pnpm-workspace.yaml`, com o comentário do porquê;
  carregado dinamicamente e **só** se o terminal estiver ligado para alguém; ligado e não
  carregável → o boot não sobe.
- `cwd` = a pasta resolvida pelo `ResolveWorkspaceUseCase` (regra, existência, realpath, é
  diretório) — a allowlist decide onde o shell **nasce**, e só isso.
- Saída: decodificador UTF-8 com estado; coalescência numa janela curta com teto por frame; pausa do
  PTY acima da marca alta do `bufferedAmount` do socket e retomada abaixo da baixa — uma enxurrada
  não pode derrubar a connection que também leva a sessão do Claude
  ([backend/06 · Fan-out](../../architecture/backend/06-realtime.md#fan-out)).
- Fechar: `SIGHUP` ao grupo de processos do PTY e `SIGKILL` depois do prazo; o que o usuário
  desacoplou (`nohup`, `setsid`) sobrevive, como a ADR-017 diz. Matar um PTY morto não lança.
- O programa em primeiro plano (o `process` do `node-pty`) alimenta `terminal.titleChanged` — é o
  que dá título à aba e nome à confirmação de fechar.
- Log de I/O em `debug` com `terminalId`, pid, tamanhos e código de saída — nunca bytes.

### B-09 — Os casos de uso e o registro em memória 🔲

`OpenTerminal`, `AttachTerminal`, `WriteTerminalInput`, `ResizeTerminal`, `CloseTerminal`, sobre um
registro **em memória** (`Map<TerminalId, …>`), como o de sessões: é estado de processo e morre com
ele ([backend/04 · Ciclo de vida](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos)).

- A vaga do limite é **reservada** antes do spawn e devolvida se ele falhar: duas aberturas
  simultâneas nunca passam do teto.
- `seq` atribuído num ponto só, por terminal, independente do da sessão.
- `close` repetido pelo dono é `command.accepted`, sem segunda linha na trilha (o registro guarda o
  terminal que saiu por alguns minutos para responder isso); id desconhecido é `TERMINAL_NOT_FOUND`.
- `resize` para o tamanho atual não reenvia `SIGWINCH`.
- Frames de terminal contam no `maxFramesPerSecond` como qualquer frame
  ([limites](../../architecture/shared/05-websocket-protocol.md#limites-por-connection)) e **não** em
  `maxAttachedSessions` — terminal não é sessão.

### B-10 — Gateway, `GET /terminals` e a reconexão com scrollback 🔲

Fecha a [D-07](decisions.md#d-07--reconexão-scrollback-e-quem-vê).

- Handlers em `adapter/inbound/ws/terminal/`: validam, autorizam por connection (terminal de outra
  pessoa → `FORBIDDEN`), chamam o caso de uso. Sem regra no gateway
  ([backend/06](../../architecture/backend/06-realtime.md)).
- `GET /terminals?folder=` (Bearer): os terminais vivos **do chamador** naquela pasta, com
  `enabled`, a janela de step-up (`satisfiedUntil` calculado do token da requisição, para o web
  pedir a reautenticação antes de tentar) e os limites. `401`/`400`/`403` como no resto.
- Scrollback: um terminal headless por PTY (`@xterm/headless`), alimentado pela mesma saída;
  reanexar manda o estado serializado e o `seq` de onde a saída viva continua. Teto de linhas
  configurado (`RC_TERMINAL_SCROLLBACK_LINES`). Só em memória.
- Uma connection vê: reanexar de outra **toma** o terminal — a anterior recebe `terminal.detached` e
  o `input` dela é recusado com `TERMINAL_LOCKED`. Reanexar de outra connection exige step-up.

### B-11 — O ciclo de vida: TTL, carência, recarga, shutdown e órfãos 🔲

Fecha a parte de tempo da [D-06](decisions.md#d-06--limites-e-ttl). É o que impede o "shell remoto
sem dono".

- **Carência:** sem nenhuma connection vendo por `RC_TERMINAL_DETACH_GRACE_MS`, o terminal morre
  com `viewerGone`. Recarregar a página cabe na carência; fechar a aba de pasta, não. Token que
  expira sem `reauthenticate` fecha o socket com `4401` e cai aqui.
- **TTL ocioso:** `RC_TERMINAL_IDLE_TTL_MS` sem **entrada humana** → `idleTimeout`. Saída sozinha não
  conta. Nunca desligável.
- **Recarga do interruptor** que tira alguém encerra os terminais dele com `disabled` — inclusive o
  que estava nascendo durante a recarga.
- **Shutdown:** a `GracefulShutdown` ganha o passo dos terminais, ao lado do das sessões
  ([backend/06 · Shutdown](../../architecture/backend/06-realtime.md#shutdown)): `terminal.exited
  { reason: shutdown }` antes do `1001`, e todo PTY morto. Chamado duas vezes, não mata duas vezes.
- **Órfãos:** o shell nasce com a marca do terminal e o pid do backend; se o backend morrer com
  `kill -9`, o `SIGHUP` do PTY fechado encerra o shell, e a `OrphanSweep` do boot seguinte mata o
  que sobrou **com a marca e cujo backend morreu** — nunca por nome de binário, que mataria o
  terminal do próprio usuário na máquina.

Testes de tempo com relógio falso em unit; o processo real em integração, contando filhos.

### B-12 — A trilha: abrir, reanexar, fechar — nunca as teclas 🔲

Fecha a [D-03](decisions.md#d-03--o-que-a-trilha-grava).

- Kinds novos em `audit_events` por **migration versionada nova**: `terminal.opened`,
  `terminal.attached`, `terminal.closed` ([persistência](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria)).
- `terminal.opened` é gravado **antes** do spawn — quem, pasta, perfil, shell, connection, tipo de
  cliente e endereço **do socket** (nunca `X-Forwarded-For`). Trilha indisponível → nada abre.
- `terminal.closed`: duração, código de saída, sinal, motivo e contagem de bytes. Trilha
  indisponível no fechamento → o processo morre assim mesmo, e o `error` vai para o log.
- Recusa (desligado, step-up, origem) → `warn` no log, não trilha.
- Prova de que nenhuma tecla chega a lugar nenhum: uma senha-marcador digitada num terminal real é
  procurada em toda linha da trilha e no log capturado em `debug`, e não está.
- [backend/03 · audit](../../architecture/backend/03-modules.md#audit) passa a listar os kinds do
  terminal entre os fatos de `audit_events`.

### B-13 — O subprocesso do Claude sem os segredos do backend 🔄

Fecha a [D-10](decisions.md#d-10--o-ambiente-do-subprocesso-do-claude). Hoje o
`session-runner.ts` passa `markedEnvironment(process.env, …)` inteiro ao SDK, e o `pnpm dev` põe o
`.env` inteiro no `process.env`: um `Bash` do Claude que rode `env` vê a senha do banco. Passa a
receber `childEnvironment(process.env, claudePolicy)` com a marca do processo por cima.
[backend/04 · Ciclo de vida](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos)
passa a dizer o que o subprocesso herda e o que não.

A prova de que o CLI continua funcionando é o Claude real: `pnpm test:e2e:live` entra no critério
desta fase e do plano.

> **Nota (2026-10-10, [D-14](decisions.md#d-14--ajuste-às-diretivas-do-plano-28)):** a política do subprocesso do agente (`claudePolicy`) passa a ser
> entregue pela extensão do motor no [plano 28](../28-agent-neutral-core/README.md) (F6); aqui ela nasce
> com nome neutro (`agentPolicy`).

### B-14 — Perfis de shell 🔲

Fecha a [D-13](decisions.md#d-13--perfis-de-shell).

- Detectados: `/etc/shells` filtrado para executáveis que existem, mais o shell da conta
  (`os.userInfo().shell`). Sem `/etc/shells`, só o da conta.
- Personalizados por usuário: nome, caminho **absoluto** de executável e argumentos — validados ao
  salvar e de novo ao abrir. Sem variáveis de ambiente por perfil: seriam o caminho de volta para o
  que a B-07 tirou.
- `GET /terminals/profiles` e `PUT /terminals/profiles` (Bearer), com o perfil padrão; guardados
  onde a D-13 do [plano 06](../06-workbench/README.md) manda as configurações do usuário.
  `terminal.open` sem `profile` usa o padrão; padrão que sumiu do disco cai no shell da conta, e o
  `terminal.opened` diz qual valeu.

### B-15 — Shell integration 🔲

Fecha a [D-12](decisions.md#d-12--shell-integration).

- Scripts nossos, curtos, versionados, para bash (`--init-file` que lê o `rc` do usuário e depois o
  nosso), zsh (`ZDOTDIR` temporário) e fish (`XDG_DATA_DIRS`); emitem as sequências OSC 633 de
  início, fim e código de cada comando, e do `cwd`.
- Desligável por usuário (Configurações › Terminal, B-21); shell sem suporte abre sem integração.
- O backend **não** interpreta nem loga essas sequências: elas seguem no `terminal.output` como
  qualquer byte, e é o navegador que as lê (B-19). Por serem cooperativas, nunca servem de trilha
  nem de decisão.
- `rc` do usuário que falha não impede o shell de abrir; um `bash` aninhado não duplica as marcas.

---

## Cenários cobertos

S-03, S-06, S-07, S-09…S-11, S-13, S-19…S-21, S-24, S-31, S-37…S-122.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
pnpm test:e2e:live       # a B-13 mexe no ambiente do Claude: só o Claude real prova que ele continua funcionando
```
