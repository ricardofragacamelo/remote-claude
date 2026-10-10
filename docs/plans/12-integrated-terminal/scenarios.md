# Plano 12 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Códigos novos** (entram no catálogo na B-05, com `messageKey` em `en` e `pt-BR`):
`TERMINAL_DISABLED` (403), `STEP_UP_REQUIRED` (401), `TERMINAL_NOT_FOUND` (404),
`TERMINAL_LIMIT_REACHED` (429) e `TERMINAL_LOCKED` (423). Os demais são do
[catálogo existente](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio).
"—" na coluna de erro de um cenário `err` significa que a recusa não é resposta de API: é o boot
que não sobe, ou um portão estático que reprova.

> A matriz dá peso deliberado à segurança: segredo do backend no ambiente do shell, step-up ausente
> ou vencido, terminal pedido pelo app, tecla chegando ao log ou à trilha, processo que sobrevive à
> desconexão ou ao shutdown, e os limites. São os caminhos pelos quais um terminal vira "shell
> remoto sem dono" — o que o [objetivo](README.md) promete que ele não é.

---

## Interruptor e origem — B-02, com a política da B-06 e a recarga da B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | arquivo de configuração sem a seção `terminal` → configuração carregada com o terminal desligado para todos | eq | unit | — | B-02 | ⬜ |
| S-02 | `terminal.users` com o `sub` de A → ligado para A, desligado para B | eq | unit | — | B-02 | ⬜ |
| S-03 | `terminal.open` de quem não está na lista → recusado **antes** de qualquer processo e de qualquer linha na trilha | err | integração | `TERMINAL_DISABLED` | B-02, B-06 | ⬜ |
| S-04 | seção `terminal` fora do schema (`users` que não é lista, `sub` vazio, chave desconhecida) → o boot não sobe, dizendo o campo | err | integração | — | B-02 | ⬜ |
| S-05 | `users: []` é válido e equivale a desligado | fron | unit | — | B-02 | ⬜ |
| S-06 | recarga explícita que tira A → os terminais abertos de A morrem com `terminal.exited { reason: disabled }`, e abrir de novo é recusado | est | integração | `TERMINAL_DISABLED` | B-02, B-11 | ⬜ |
| S-07 | recarga que acrescenta A → A abre sem reiniciar o backend | est | integração | — | B-02, B-09 | ⬜ |
| S-08 | recarga com o arquivo inválido → recusada; a configuração anterior continua valendo, no mesmo regime da allowlist | err | integração | — | B-02 | ⬜ |
| S-09 | connection com `installId` (o app) pede `terminal.open` | err | integração | `FORBIDDEN` (`terminal.error.webOnly`) | B-02, B-06 | ⬜ |
| S-10 | token cujo `azp`/`client_id` é o client do app, sem `installId` e declarando `client.kind: web` → recusado: a declaração não prova nada | err | integração | `FORBIDDEN` (`terminal.error.webOnly`) | B-02, B-06 | ⬜ |
| S-11 | token do client web, sem `installId` → passa pela regra de origem | eq | unit | — | B-06 | ⬜ |
| S-12 | recarregar o mesmo arquivo duas vezes → mesmo estado, nenhum terminal encerrado | idem | integração | — | B-02 | ⬜ |
| S-13 | recarga que tira A chegando durante um `terminal.open` de A → ou a abertura é recusada, ou o terminal recém-aberto morre com `disabled`; nunca sobra terminal de quem saiu da lista | conc | integração | `TERMINAL_DISABLED` | B-11 | ⬜ |
| S-14 | o script de raízes locais do plano 06 preserva a seção `terminal` como está e nunca a cria | eq | unit | — | B-02 | ⬜ |

## Reautenticação recente (step-up) — B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | `auth_time` dentro da janela → a regra aceita | eq | unit | — | B-03 | ⬜ |
| S-16 | `now − auth_time` igual à janela → aceita; um segundo além → recusa | fron | unit | `STEP_UP_REQUIRED` | B-03 | ⬜ |
| S-17 | token sem `auth_time` → recusa, falha fechada | err | unit | `STEP_UP_REQUIRED` | B-03 | ⬜ |
| S-18 | `auth_time` no futuro além da tolerância de relógio de 60 s → recusa | err | unit | `STEP_UP_REQUIRED` | B-03 | ⬜ |
| S-19 | renovar o access token por refresh (mesmo `auth_time`) não satisfaz, e o cliente não entra em laço de renovação | est | integração | `STEP_UP_REQUIRED` | B-03, B-09 | ⬜ |
| S-20 | `connection.reauthenticate` com token recém-autenticado, depois `terminal.open` → abre, na mesma connection | est | integração | — | B-03, B-09 | ⬜ |
| S-21 | a recusa carrega a janela em `params.maxAgeSeconds`, que o web manda ao provedor como `max_age` | eq | integração | `STEP_UP_REQUIRED` | B-03, B-09 | ⬜ |
| S-22 | janela configurada abaixo do piso ou acima do teto → o boot não sobe | fron | unit | — | B-03 | ⬜ |
| S-23 | o provedor fake emite `auth_time` no access token e reautentica quando recebe `max_age` vencido | eq | integração | — | B-03 | ⬜ |
| S-24 | terminal já aberto não morre quando o `auth_time` envelhece — o step-up guarda abrir e reanexar, não a vida do shell | est | unit | — | B-06 | ⬜ |

## Contrato — B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-25 | `terminal.open` sem `cols`, ou com `folder` relativo → recusado pelo schema, com todos os campos em `details[]` | err | unit | `INVALID_INPUT` | B-04 | ⬜ |
| S-26 | `cols` 2 e 500, `rows` 1 e 200 aceitos; `cols` 1 e 501, `rows` 0 e 201 recusados | fron | unit | `INVALID_INPUT` | B-04 | ⬜ |
| S-27 | evento `terminal.output` sem `seq` → o guard gerado recusa (regra `x-required-when` do envelope) | err | unit | — | B-04 | ⬜ |
| S-28 | tipos TS e Dart saem do mesmo schema; Dart desatualizado → `pnpm contracts:check` reprova | err | unit | — | B-04 | ⬜ |
| S-29 | o app decodifica frames `terminal.*` sem quebrar e os ignora | eq | unit | — | B-04 | ⬜ |
| S-30 | evento e comando novos não sobem `v`: um cliente do contrato anterior continua conectando | eq | integração | — | B-04 | ⬜ |
| S-31 | `terminal.open` com `profile` que não existe para o usuário | err | integração | `INVALID_INPUT` (`terminal.error.unknownProfile`) | B-04, B-14 | ⬜ |

## Códigos de erro e redação dos bytes — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-32 | cada código novo tem status no `error-catalogue.ts` e no doc 04, e `messageKey` em `en` e `pt-BR`; chave ausente → `pnpm i18n:check` reprova | err | unit | — | B-05 | ⬜ |
| S-33 | `ws.inbound` de `terminal.input` loga `terminalId` e `bytes`, nunca `data` | eq | unit | — | B-05 | ⬜ |
| S-34 | `ws.outbound` de `terminal.output` e `terminal.attached` loga o tamanho, nunca `data` nem `snapshot` | eq | unit | — | B-05 | ⬜ |
| S-35 | frame `terminal.input` que falha no schema também não leva `data` para o log do erro de validação | err | unit | `INVALID_INPUT` | B-05 | ⬜ |
| S-36 | o logger do web nunca recebe o conteúdo do terminal — e por isso o envio de log do cliente também não | eq | unit | — | B-05 | ⬜ |

## Domínio e política — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-37 | transições `starting → running → exited` e `running ↔ detached`; transição inválida é erro de programação | est | unit | `INTERNAL_ERROR` | B-06 | ⬜ |
| S-38 | limite por usuário: o último permitido abre, o seguinte é recusado com `params.limit` | fron | unit | `TERMINAL_LIMIT_REACHED` | B-06 | ⬜ |
| S-39 | terminais de outra pessoa não contam no meu limite; o teto da instalação conta todos | eq | unit | `TERMINAL_LIMIT_REACHED` | B-06 | ⬜ |
| S-40 | a regra de quem abre compõe interruptor, origem web e step-up, nessa ordem, e para no primeiro que falha | eq | unit | `TERMINAL_DISABLED` · `FORBIDDEN` · `STEP_UP_REQUIRED` | B-06 | ⬜ |

## Ambiente dos processos filhos — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-41 | nenhuma chave declarada pelo schema de configuração do backend chega ao shell — o teste lê as chaves **do schema**, não de uma lista à mão | eq | unit | — | B-07 | ⬜ |
| S-42 | variável do `.env` que o backend não declara (`RC_POSTGRES_PASSWORD`, `RC_KEYCLOAK_ADMIN_PASSWORD`) também não chega: a política do terminal é lista de **permissão** | eq | unit | — | B-07 | ⬜ |
| S-43 | `PATH`, `HOME`, `USER`, `LANG`/`LC_*` e `TZ` passam; `TERM=xterm-256color` e `COLORTERM=truecolor` são definidos | eq | unit | — | B-07 | ⬜ |
| S-44 | ambiente de base sem `LANG` nem `HOME` → o shell nasce com `C.UTF-8` e o `HOME` da conta | fron | unit | — | B-07 | ⬜ |
| S-45 | a marca do subprocesso do Claude (`REMOTE_CLAUDE_OWNER`) não está no shell; a marca do terminal está | eq | unit | — | B-07 | ⬜ |
| S-46 | spawn de PTY sem passar pelo `childEnvironment` → `semgrep` reprova | err | unit | — | B-07 | ⬜ |
| S-47 | num shell real, `env` não mostra `DATABASE_URL`, `OIDC_*` nem `RC_*` | eq | integração | — | B-07 | ⬜ |
| S-48 | o shell de login relê o perfil do usuário: variável exportada no `~/.profile` do fixture aparece | eq | integração | — | B-07 | ⬜ |

## Adapter de PTY — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-49 | o `cwd` do shell é o realpath da pasta; `pwd` o confirma | eq | integração | — | B-08 | ⬜ |
| S-50 | pasta fora da allowlist, ou symlink que escapa da raiz | err | integração | `WORKSPACE_NOT_ALLOWED` | B-08 | ⬜ |
| S-51 | pasta inexistente / que é arquivo / raiz de outra pessoa | err | integração | `WORKSPACE_NOT_FOUND` · `WORKSPACE_NOT_A_DIRECTORY` · `FORBIDDEN` | B-08 | ⬜ |
| S-52 | shell do perfil que não existe mais → nenhuma entrada no registro, e a trilha fecha com `spawnFailed` | err | integração | `INTERNAL_ERROR` (`terminal.error.spawnFailed`) | B-08 | ⬜ |
| S-53 | caractere multibyte partido entre dois chunks do PTY chega inteiro | fron | unit | — | B-08 | ⬜ |
| S-54 | bytes que não são UTF-8 viram U+FFFD, sem derrubar o stream | err | unit | — | B-08 | ⬜ |
| S-55 | rajada de chunks pequenos é coalescida: no máximo um frame por janela, cada um abaixo do teto de saída | fron | unit | — | B-08 | ⬜ |
| S-56 | enxurrada (`yes`) pausa o PTY acima da marca alta e retoma abaixo da baixa; a connection **não** cai com `1013` | conc | integração | — | B-08 | ⬜ |
| S-57 | durante a enxurrada, evento de uma sessão do Claude na mesma connection continua chegando | conc | integração | — | B-08 | ⬜ |
| S-58 | `exit 3` → `terminal.exited { code: 3, reason: processExited }`; morto por sinal → `code: null` e `signal` | eq | integração | — | B-08 | ⬜ |
| S-59 | fechar mata o grupo de processos: um `sleep` em primeiro plano morre junto | est | integração | — | B-08 | ⬜ |
| S-60 | shell que ignora `SIGHUP` morre por `SIGKILL` depois do prazo | err | integração | — | B-08 | ⬜ |
| S-61 | job desacoplado pelo usuário (`nohup … &`, `setsid`) sobrevive ao fechar — como em qualquer terminal, e a ADR-017 diz | eq | integração | — | B-08 | ⬜ |
| S-62 | terminal ligado para alguém e `node-pty` que não carrega → o boot não sobe | err | integração | — | B-08 | ⬜ |
| S-63 | terminal desligado para todos → o módulo nativo nunca é carregado | eq | unit | — | B-08 | ⬜ |
| S-64 | `node-pty` importado fora de `adapter/outbound/terminal/` → `pnpm lint:arch` reprova | err | unit | — | B-08 | ⬜ |
| S-65 | matar um PTY que já saiu não lança | idem | unit | — | B-08 | ⬜ |
| S-66 | o programa em primeiro plano muda (`vim`, `pnpm dev`) → `terminal.titleChanged` com o nome do processo | est | integração | — | B-08 | ⬜ |

## Casos de uso e registro — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-67 | abrir: `command.accepted`, depois `terminal.opened` com o `correlationId` do comando, e a saída com `seq` crescente a partir dele | eq | integração | — | B-09 | ⬜ |
| S-68 | o `seq` de dois terminais e o de uma sessão na mesma connection são independentes | eq | integração | — | B-09 | ⬜ |
| S-69 | `terminal.input` chega ao PTY na ordem enviada | eq | integração | — | B-09 | ⬜ |
| S-70 | `terminal.input` acima de `maxFrameBytes` → erro, e o socket fica | fron | integração | `PAYLOAD_TOO_LARGE` | B-09 | ⬜ |
| S-71 | `terminal.input`, `resize` ou `close` em terminal de outra pessoa | err | integração | `FORBIDDEN` | B-09 | ⬜ |
| S-72 | `terminal.input` para id desconhecido ou para terminal que já saiu | err | integração | `TERMINAL_NOT_FOUND` | B-09 | ⬜ |
| S-73 | `terminal.resize` válido chega ao processo (`stty size` mostra o novo tamanho) | eq | integração | — | B-09 | ⬜ |
| S-74 | `terminal.resize` para o tamanho atual não reenvia `SIGWINCH` | idem | unit | — | B-09 | ⬜ |
| S-75 | `terminal.close` duas vezes → a segunda é `command.accepted`, e há uma linha só de fechamento na trilha | idem | integração | — | B-09 | ⬜ |
| S-76 | duas aberturas simultâneas com uma vaga só → uma abre, a outra é recusada; nunca limite + 1 processos | conc | integração | `TERMINAL_LIMIT_REACHED` | B-09 | ⬜ |
| S-77 | `input` e `close` concorrentes: escrita num PTY morto não derruba o backend | conc | integração | — | B-09 | ⬜ |
| S-78 | frames de terminal contam no `maxFramesPerSecond` como qualquer frame, e **não** em `maxAttachedSessions` | eq | integração | `RATE_LIMITED` | B-09 | ⬜ |

## Gateway, listagem e reconexão — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-79 | `GET /terminals?folder=` lista só os meus daquela pasta, com `enabled`, a janela de step-up (`satisfiedUntil` do token da requisição) e os limites | eq | integração | — | B-10 | ⬜ |
| S-80 | `GET /terminals` sem token / com `folder` malformado / fora da allowlist | err | integração | `UNAUTHENTICATED` · `INVALID_INPUT` · `WORKSPACE_NOT_ALLOWED` | B-10 | ⬜ |
| S-81 | reanexar dentro da carência → `terminal.attached` com o snapshot e o `seq` a partir do qual a saída viva continua | est | integração | — | B-10 | ⬜ |
| S-82 | com um programa em tela cheia (`vim`, tela alternativa) o snapshot restaura a tela | eq | integração | — | B-10 | ⬜ |
| S-83 | scrollback acima do teto → as linhas mais antigas saem e o snapshot fica dentro do teto | fron | unit | — | B-10 | ⬜ |
| S-84 | reanexar de outra connection com `auth_time` velho | err | integração | `STEP_UP_REQUIRED` | B-10 | ⬜ |
| S-85 | reanexar id desconhecido / de outra pessoa | err | integração | `TERMINAL_NOT_FOUND` · `FORBIDDEN` | B-10 | ⬜ |
| S-86 | reanexar de outra connection enquanto uma vê → a anterior recebe `terminal.detached { reason: attachedElsewhere }` e o `input` dela passa a ser recusado | conc | integração | `TERMINAL_LOCKED` | B-10 | ⬜ |
| S-87 | duas reanexações simultâneas → exatamente uma connection fica como a que vê | conc | integração | — | B-10 | ⬜ |
| S-88 | reanexar duas vezes pela mesma connection não duplica saída | idem | integração | — | B-10 | ⬜ |

## Ciclo de vida — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-89 | desconectar e não voltar → na carência, o terminal morre com `reason: viewerGone` e a trilha fecha | est | integração | — | B-11 | ⬜ |
| S-90 | reconectar antes da carência → o terminal sobrevive | est | integração | — | B-11 | ⬜ |
| S-91 | borda da carência com relógio falso: no instante exato ainda vive, um tique depois morre | fron | unit | — | B-11 | ⬜ |
| S-92 | sem entrada humana pelo TTL → `reason: idleTimeout`; saída sozinha não conta como atividade; entrada zera a contagem | est | unit | — | B-11 | ⬜ |
| S-93 | TTL ou carência fora do piso/teto, ou TTL desligado → o boot não sobe | fron | unit | — | B-11 | ⬜ |
| S-94 | shutdown: `terminal.exited { reason: shutdown }` antes do `1001`, todo PTY morto, nenhum processo sobra | est | integração | — | B-11 | ⬜ |
| S-95 | backend morto com `kill -9` → o shell recebe `SIGHUP` e sai; a varredura do boot seguinte mata o que sobrou com a marca do terminal e cujo backend morreu | err | integração | — | B-11 | ⬜ |
| S-96 | a varredura nunca mata shell sem a marca — o terminal do próprio usuário na máquina | eq | integração | — | B-11 | ⬜ |
| S-97 | token expira com o socket aberto sem `reauthenticate` → `4401` → carência → o terminal morre | est | integração | — | B-11 | ⬜ |
| S-98 | shutdown chamado duas vezes não mata duas vezes nem lança | idem | unit | — | B-11 | ⬜ |
| S-99 | a carência vence no mesmo instante de uma reanexação → ou reanexa, ou morre; nunca reanexa a um PTY morto | conc | unit | — | B-11 | ⬜ |

## Trilha — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-100 | abrir grava `terminal.opened` **antes** do spawn: quem, pasta, shell, perfil, connection, tipo de cliente e endereço do socket | eq | integração | — | B-12 | ⬜ |
| S-101 | trilha indisponível ao abrir → nenhum processo | err | integração | `INTERNAL_ERROR` | B-12 | ⬜ |
| S-102 | fechar grava `terminal.closed` com duração, código de saída, sinal, motivo e contagem de bytes | eq | integração | — | B-12 | ⬜ |
| S-103 | trilha indisponível ao fechar → o PTY morre assim mesmo, e o `error` vai para o log | err | integração | — | B-12 | ⬜ |
| S-104 | reanexar de outra connection grava `terminal.attached` com o endereço novo | eq | integração | — | B-12 | ⬜ |
| S-105 | uma senha-marcador digitada no terminal não aparece em nenhuma linha da trilha nem no log em `debug` | eq | integração | — | B-12 | ⬜ |
| S-106 | aberturas recusadas (desligado, step-up, origem) vão para o log em `warn`, não para a trilha | eq | integração | — | B-12 | ⬜ |
| S-107 | a migration acrescenta os kinds sem tocar nas linhas existentes; kind desconhecido continua recusado pelo `CHECK` | eq | integração | — | B-12 | ⬜ |

## Ambiente do subprocesso do Claude — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-108 | o subprocesso do Claude nasce sem as chaves do schema do backend nem `RC_*`, `OIDC_*` e `DATABASE_URL` | eq | unit | — | B-13 | ✅ |
| S-109 | o que o CLI precisa passa: `HOME`, `PATH`, `CLAUDE_CONFIG_DIR`, proxy, CA, `ANTHROPIC_*` do usuário e a marca `REMOTE_CLAUDE_*` | eq | unit | — | B-13 | ✅ |
| S-110 | a sessão real continua autenticando e respondendo com o ambiente filtrado (`smoke-live`) | eq | e2e | — | B-13 | ⬜ |

## Perfis de shell — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-111 | os perfis detectados vêm de `/etc/shells`, só os executáveis que existem, mais o shell da conta | eq | integração | — | B-14 | ⬜ |
| S-112 | `terminal.open` sem `profile` usa o perfil padrão do usuário; sem padrão, o shell da conta | eq | integração | — | B-14 | ⬜ |
| S-113 | perfil personalizado com caminho relativo, inexistente ou não executável → recusado ao salvar | err | integração | `INVALID_INPUT` (`terminal.error.profileInvalid`) | B-14 | ⬜ |
| S-114 | o perfil padrão deixa de existir no disco → abrir sem `profile` cai no shell da conta e o `terminal.opened` diz qual perfil valeu | est | integração | — | B-14 | ⬜ |
| S-115 | `/etc/shells` ausente ou vazio → só o shell da conta | fron | unit | — | B-14 | ⬜ |
| S-116 | salvar a mesma lista de perfis duas vezes → mesmo estado | idem | integração | — | B-14 | ⬜ |

## Shell integration — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-117 | bash, zsh e fish nascem com a integração, e o perfil do usuário continua sendo lido | eq | integração | — | B-15 | ⬜ |
| S-118 | integração desligada nas configurações → o shell nasce sem injeção | eq | integração | — | B-15 | ⬜ |
| S-119 | shell sem suporte (`sh`, `dash`) → abre sem integração, sem erro | fron | integração | — | B-15 | ⬜ |
| S-120 | o backend nunca interpreta nem loga as sequências da integração — o texto do comando que ela carrega fica no navegador | eq | unit | — | B-15 | ⬜ |
| S-121 | `rc` do usuário que falha não impede o shell de abrir | err | integração | — | B-15 | ⬜ |
| S-122 | um `bash` aberto dentro do terminal não duplica as marcas de comando | idem | integração | — | B-15 | ⬜ |

## Web: estado e serviço — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-123 | ao montar a aba de pasta, `GET /terminals` é lido e os terminais vivos são reanexados | eq | integração | — | B-16 | ⬜ |
| S-124 | terminal da aba de pasta A não aparece na aba B — estado por pasta, nunca global | eq | integração | — | B-16 | ⬜ |
| S-125 | aba de pasta inativa mantém os terminais anexados — suspender deixaria a carência matá-los | est | integração | — | B-16 | ⬜ |
| S-126 | componente importando o service → `pnpm lint:arch` reprova | err | unit | — | B-16 | ⬜ |
| S-127 | reconexão do socket nunca reenvia `terminal.open`: lista e reanexa | idem | integração | — | B-16 | ⬜ |
| S-128 | resposta de `GET /terminals` que chega depois de um `terminal.opened` novo não apaga o terminal novo da lista | conc | integração | — | B-16 | ⬜ |

## Web: o componente de terminal — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-129 | teclas viram `terminal.input` coalescidas, abaixo do `maxFramesPerSecond` anunciado | fron | unit | — | B-17 | ⬜ |
| S-130 | colagem maior que `maxFrameBytes` é fatiada em frames ordenados | fron | unit | — | B-17 | ⬜ |
| S-131 | colagem de várias linhas pede confirmação mostrando o texto (o shell executaria cada linha); com bracketed paste ativo no shell, não pede | eq | integração | — | B-17 | ⬜ |
| S-132 | redimensionar o painel → um `terminal.resize` só, depois do debounce | idem | unit | — | B-17 | ⬜ |
| S-133 | trocar o tema claro/escuro repinta o terminal pelos tokens, sem recarregar | est | integração | — | B-17 | ⬜ |
| S-134 | copiar e colar por atalho e pelo menu de contexto; sem permissão de área de transferência → aviso traduzido que diz o que fazer | err | integração | — | B-17 | ⬜ |
| S-135 | o foco sai do terminal pelo atalho documentado (sem armadilha de teclado) e a visão acessível mostra o buffer como texto | eq | integração | — | B-17 | ⬜ |

## Web: o painel inferior — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-136 | novo terminal, alternar e fechar; fechar o último mostra o estado vazio do painel | eq | integração | — | B-18 | ⬜ |
| S-137 | dividir: dois terminais lado a lado, dois PTYs, cada um com o seu tamanho | eq | integração | — | B-18 | ⬜ |
| S-138 | renomear, ícone e cor ficam com o terminal enquanto ele vive; o título segue o `terminal.titleChanged` até ser renomeado | est | integração | — | B-18 | ⬜ |
| S-139 | fechar um terminal com programa em primeiro plano pede confirmação que o nomeia; shell ocioso fecha sem perguntar | est | integração | — | B-18 | ⬜ |
| S-140 | a aba Saída mostra o `tool.progress` das ferramentas de `kind: 'shell'` das sessões que a aba de pasta observa, nunca escolhidas pelo nome nativo; sem sessão, o estado vazio ensina onde ela aparece | eq | integração | — | B-18 | ⬜ |
| S-141 | fechar a aba de pasta com terminais pede confirmação que diz que eles encerram na carência | est | integração | — | B-18 | ⬜ |
| S-142 | abaixo de `md` o painel vira uma view, sem scroll horizontal da página; maximizar e restaurar o painel | fron | integração | — | B-18 | ⬜ |

## Web: busca, links e marcas de comando — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-143 | busca no scrollback: regex, caixa, palavra inteira, realça todas, próxima/anterior, contador e estado "nenhum resultado" | eq | integração | — | B-19 | ⬜ |
| S-144 | regex inválida → validação inline, sem quebrar o terminal | err | unit | — | B-19 | ⬜ |
| S-145 | URL `http`/`https` vira link que abre em nova aba com `noopener`; `javascript:`, `data:` e `file:` não viram link | err | unit | — | B-19 | ⬜ |
| S-146 | caminho `src/x.ts:12:3` relativo ao `cwd` atual abre no editor do plano 07 na linha; caminho fora da pasta aberta não vira link | fron | integração | — | B-19 | ⬜ |
| S-147 | marcas de comando (sucesso/falha) e navegar entre comandos por atalho, com a shell integration ligada; sem ela, os controles somem | eq | integração | — | B-19 | ⬜ |
| S-148 | "enviar seleção ao `{agent}`" (e o `@terminal` do plano 08) leva a seleção ou as últimas N linhas, nunca acima do teto | fron | unit | — | B-19 | ⬜ |
| S-149 | "executar seleção no terminal" do editor manda o texto ao terminal ativo; sem terminal, abre um — sujeito ao step-up | est | integração | — | B-19 | ⬜ |

## Web: recusas, reautenticação e reconexão — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-150 | desligado → estado traduzido que diz quem liga e onde, sem botão de tentar de novo | err | integração | `TERMINAL_DISABLED` | B-20 | ⬜ |
| S-151 | step-up → diálogo; na volta do provedor, o botão reaparece e o terminal **não** abre sozinho | err | integração | `STEP_UP_REQUIRED` | B-20 | ⬜ |
| S-152 | limite → mensagem com o número e como liberar uma vaga | err | integração | `TERMINAL_LIMIT_REACHED` | B-20 | ⬜ |
| S-153 | reconectado → rótulo discreto, sem saída duplicada | est | integração | — | B-20 | ⬜ |
| S-154 | encerrado → código, motivo traduzido e "novo terminal" | est | integração | — | B-20 | ⬜ |
| S-155 | aberto em outra janela → aviso e "trazer para cá" | conc | integração | `TERMINAL_LOCKED` | B-20 | ⬜ |

## Web: Configurações › Terminal — B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-156 | a seção mostra, do servidor, se o terminal está ligado para você, a janela de step-up e os limites — só leitura, com o porquê | eq | integração | — | B-21 | ⬜ |
| S-157 | preferências do visitante com armazenamento bloqueado → a tela funciona com os padrões | err | unit | — | B-21 | ⬜ |
| S-158 | mudar fonte ou cursor aplica aos terminais abertos, sem reabrir | est | integração | — | B-21 | ⬜ |

## Usabilidade e ajuda — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-159 | a ajuda do painel existe em `en` e `pt-BR` e diz o que **não** é registrado (as teclas) e o que o terminal não protege | eq | integração | — | B-22 | ⬜ |
| S-160 | todo controle de ícone tem tooltip traduzido | eq | integração | — | B-22 | ⬜ |
| S-161 | os atalhos estão na command palette e funcionam; com o foco no terminal, as teclas vão ao shell, exceto as que o workbench reserva | est | integração | — | B-22 | ⬜ |
| S-162 | estado vazio ensina: como abrir, e — desligado — por quê e quem liga | eq | integração | — | B-22 | ⬜ |
| S-163 | axe sem violação no painel, na busca e na seção de configurações, nos dois temas | eq | integração | — | B-22 | ⬜ |

## E2E — B-23…B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-164 | abrir; `pwd` mostra a pasta; `echo` volta | eq | e2e | — | B-23, B-24 | ⬜ |
| S-165 | redimensionar a janela muda o `stty size` | eq | e2e | — | B-24 | ⬜ |
| S-166 | recarregar a página dentro da carência → o mesmo terminal, com o scrollback | est | e2e | — | B-24 | ⬜ |
| S-167 | duas abas de pasta, dois terminais, cada um no seu `cwd` | eq | e2e | — | B-24 | ⬜ |
| S-168 | dividir, buscar no scrollback e seguir um link de caminho | eq | e2e | — | B-24 | ⬜ |
| S-169 | fechar a aba de pasta → depois da carência, `GET /terminals` vazio | est | e2e | — | B-24 | ⬜ |
| S-170 | usuário B, fora da lista → recusa traduzida | err | e2e | `TERMINAL_DISABLED` | B-25 | ⬜ |
| S-171 | janela de step-up vencida → recusa, reautentica no provedor, abre | err | e2e | `STEP_UP_REQUIRED` | B-25 | ⬜ |
| S-172 | `env` no terminal não mostra segredo do backend | eq | e2e | — | B-25 | ⬜ |
| S-173 | a trilha tem `terminal.opened` e `terminal.closed` do ciclo, sem nenhuma tecla | eq | e2e | — | B-25 | ⬜ |
| S-174 | axe sem violação no painel com terminal aberto, nos dois temas | eq | e2e | — | B-25 | ⬜ |
| S-175 | `pnpm test:e2e:mobile` verde com o contrato novo; o app não oferece terminal | eq | e2e | — | B-26 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| A decisão e a ADR-017 (B-01) | todas | é decisão e documento. O que ela promete é provado pelos cenários das tasks que a implementam — desligado por padrão, fora da allowlist, sem teclas —, e o documento por `pnpm docs:check` |
| Interruptor e origem (B-02) | `conc` | a disputa real — recarga chegando durante uma abertura — é executada pelo ciclo de vida, e está em S-13 (B-11) |
| Step-up (B-03) | `conc`, `idem` | a regra é função pura do token e do relógio: não há estado compartilhado para disputar, e aplicá-la duas vezes dá o mesmo resultado por construção. A disputa real — abrir no limite, reanexar na carência — está em S-76 e S-99 |
| Contrato (B-04) | `est`, `conc`, `idem` | schema é declaração sem estado; o que ele permite em sequência e em paralelo é provado nos casos de uso (B-09, B-10) |
| Códigos e redação (B-05) | `fron`, `est`, `conc`, `idem` | a redação **descarta** `data` inteiro, em qualquer tamanho — não há fronteira de truncamento a testar; o catálogo é tabela estática |
| Domínio (B-06) | `conc`, `idem` | a entidade é pura; a reserva atômica do limite e o fechamento repetido vivem no registro (S-76, S-75) |
| Ambiente (B-07) | `est`, `conc`, `idem` | `childEnvironment` é função pura de um mapa para outro, chamada uma vez por spawn |
| Trilha (B-12) | `fron`, `est`, `conc`, `idem` | os metadados não têm fronteira; as transições que geram linha são as do ciclo de vida (B-09, B-11), e a unicidade do fechamento está em S-75 |
| Ambiente do Claude (B-13) | `err`, `fron`, `est`, `conc`, `idem` | mesma função pura da B-07, com outra política; o erro que importa — uma variável necessária removida por engano — é exatamente o que S-110 pega contra o Claude real |
| Perfis (B-14) | `conc` | a lista de perfis é gravada por um usuário, sobre as configurações dele; duas gravações simultâneas são o "último vence" do armazenamento de configurações do plano 06, testado lá |
| Shell integration (B-15) | `est`, `conc` | a injeção acontece uma vez, no spawn; o que muda depois é do navegador (B-19) |
| Estado e serviço no web (B-16) | `fron` | o hook repassa listas e eventos sem teto próprio; os limites são do backend (S-38) |
| Componente (B-17) | `conc` | um componente, um terminal, uma fila de envio; a disputa entre connections está no backend (S-86) |
| Painel (B-18) | `err`, `conc`, `idem` | os erros de abrir são da B-20; abrir e fechar abas são ações de interface sem efeito repetível além do backend, já coberto em S-75; a disputa entre janelas pelo mesmo terminal é da B-20 (S-155) e do backend (S-86) |
| Busca, links e marcas (B-19) | `conc`, `idem` | tudo acontece sobre o buffer local do xterm, sem estado compartilhado |
| Recusas e reconexão na tela (B-20) | `eq`, `fron`, `idem` | cada recusa é um caso de erro próprio; a fronteira do limite e a repetição da reanexação são do backend (S-38, S-88) |
| Configurações (B-21) | `fron`, `conc`, `idem` | tela de leitura e de preferência; os limites que ela mostra são provados onde são aplicados (B-06, B-11), e a validação do perfil, no backend (S-113) |
| Usabilidade e ajuda (B-22) | `err`, `fron`, `conc`, `idem` | conteúdo, tooltips e atalhos não têm caminho de erro próprio — os textos de erro que a ajuda explica são testados onde aparecem (B-20) |
| E2E (B-23…B-26) | `fron`, `conc`, `idem` | as fronteiras (limite, carência, janela) são exatas e baratas com relógio falso em unit e integração (S-38, S-91, S-16); pela porta do usuário custariam minutos para provar o mesmo. A disputa entre connections exige duas abas sincronizadas ao milissegundo — em integração ela é determinística |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
