# Plano 10 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> **A D-01 bloqueia o plano inteiro, e pode encerrá-lo.** Nenhuma task de F0 a F3 começa com ela
> aberta. Se a resposta for "não", o plano fecha com uma linha no progresso geral, a ADR-017 registra
> o "não" e o porquê, e o único achado que sobrevive — o ambiente do subprocesso do Claude
> ([D-10](#d-10--o-ambiente-do-subprocesso-do-claude)) — é movido para o
> [plano 05](../05-hardening-operations/README.md), porque ele existe com ou sem terminal.

---

## F0 — Decisão e contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | **O terminal existe?** Um shell interativo alcançável pela rede, fora do `canUseTool`, fora da allowlist e sem trilha por comando | se o dono do produto aceita, por escrito, que o terminal fica fora da premissa "nenhuma tool sensível roda sem um humano dizer sim" — e com quais guardas | F0…F3 (B-01…B-26) | 2026-09-26 · **existe, com as travas**, decisão do usuário: desligado por padrão, ligado por usuário no arquivo, step-up, só pelo navegador, trilha sem teclas, env sem segredos; a ADR-017 (B-01) diz sem eufemismo o que não vale dentro do shell | ✅ |
| D-02 | Como provar reautenticação recente (step-up) para abrir e reanexar | se o provedor põe `auth_time` no **access token** (o fake e o do primeiro deploy); qual janela o uso real tolera | B-03, B-10 | — | 🔲 |
| D-05 | Como os bytes do terminal viajam no WebSocket, e o controle de fluxo da saída | vazão e latência de uma enxurrada (`yes`, `cat` de 100 MB) com cada opção, e o atraso que ela impõe a um evento de sessão na mesma connection | B-04, B-08 | — | 🔲 |
| D-07 | O que a reconexão devolve (scrollback), e quantas connections veem o mesmo terminal | memória e CPU de um terminal "headless" no servidor sob enxurrada; tempo de serializar 1000 linhas | B-04, B-10 | — | 🔲 |
| D-08 | Onde mora o interruptor que liga o terminal, e para quem | se ligar o terminal deve exigir acesso ao disco da máquina, como a allowlist | B-02 | — | 🔲 |
| D-09 | O que prova que o pedido vem do web e não do app | se o provedor põe `azp` (ou `client_id`) no access token dos dois clients | B-02 | — | 🔲 |

### D-01 — o terminal existe?

**A premissa do produto** é "nenhuma tool sensível roda sem um humano dizer sim". Todo o desenho
está pendurado nela: o `canUseTool` que para o loop até alguém responder, o hook `PreToolUse` que
registra **toda** invocação com o input exato
([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)),
a allowlist que diz onde uma sessão pode nascer
([workspace](../../architecture/backend/03-modules.md#workspace)).

**Dentro de um shell, nada disso vale.** Sem eufemismo:

| Garantia | No `Bash` do Claude | No terminal |
|---|---|---|
| Um humano viu **este** comando antes de rodar | sim — o `permission.requested` traz o comando exato | **não** — o humano digita, e ninguém mais vê |
| A trilha tem o comando | sim — `audit_entries` com o input exato | **não** — só abrir, reanexar e fechar ([D-03](#d-03--o-que-a-trilha-grava)) |
| A allowlist limita onde se chega | limita o `cwd` de nascimento; o que o comando alcança passa por um humano que o leu | **não limita nada**: o shell faz `cd /`, `cd ~`, lê `~/.ssh`, `~/.claude/.credentials.json`, o `.env` do backend |
| Regra `always` deixa de perguntar | sim, e a regra é visível e revogável | não há o que perguntar |

E há um fato que o multiusuário esconde: **todo terminal é um shell da conta do SO que roda o
backend.** Ligar o terminal para um segundo `sub` é entregar a essa pessoa a conta do dono da
máquina — inclusive os arquivos de raízes que a allowlist nunca liberou para ela. A regra de que
"raiz de outro responde 403" deixa de existir dentro do shell.

**O que o terminal não piora**, e precisa estar dito para a decisão ser honesta: quem tem um access
token válido do web **já** executa comando arbitrário — abre uma sessão, pede um `Bash` e aprova o
próprio pedido. O modelo de permissão protege contra **o Claude** fazer o que ninguém pediu, não
contra o humano autenticado. O que o terminal tira é o **rastro por comando** e a propriedade "um
humano leu isto antes". É isso que a decisão troca por conveniência.

Opções:

| | O quê | Custa | Entrega |
|---|---|---|---|
| **A** | Não construir. O plano fecha | nada | o `Bash` do Claude, com permissão e trilha, continua sendo a única forma de rodar comando; a saída dele aparece no painel (plano 08) |
| ~~**B**~~ | "Só tarefas": comandos pré-declarados por pasta (`pnpm test`, `pnpm dev`), com o comando na trilha | **descartada pelo usuário em 2026-09-26**, que preferiu o terminal a "só tarefas" — e tirou as tarefas do escopo de vez | rastro por comando; nenhuma interatividade (senha, `vim`, REPL) |
| **C** | Terminal de verdade, com as guardas deste plano: desligado por padrão ([D-08](#d-08--onde-mora-o-interruptor)), step-up ([D-02](#d-02--como-provar-reautenticação-recente)), só do web ([D-09](#d-09--o-que-prova-que-o-pedido-vem-do-web)), ambiente sem segredo do backend (B-07), trilha de abrir/fechar sem teclas, limites e nenhum shell sem dono ([D-06](#d-06--limites-e-ttl)) | tudo que este plano descreve, e a premissa com uma exceção declarada | o pedido do usuário: "como no VS Code" |

Gap: é uma escolha de produto e de risco, não técnica. Nenhuma medição a responde.

**Recomendação:** **C**, com a ADR-017 dizendo por extenso, na primeira linha, que o terminal está
**fora** do modelo de permissão, da allowlist e da trilha por comando, e que ligá-lo para alguém é
dar a essa pessoa a conta do SO que roda o backend. O argumento é o do parágrafo acima — o token do
web já equivale a execução de comando —, e as guardas existem para que o terminal não seja o caminho
**mais fácil** de quem roubou um token velho (step-up), de quem achou um celular (só web), nem de
quem lê variável de ambiente (B-07). Se o dono do produto não aceitar a exceção, **A** — B já foi
descartada.

O que continua aberto, mesmo com a preferência do usuário registrada: **a aceitação escrita da
exceção**. Preferir o terminal é escolher a feature; aceitar que ele fica fora da premissa, da
allowlist e da trilha por comando — e que ligá-lo para um segundo `sub` entrega a conta do SO — é o
que a ADR-017 assina. Sem essa linha, a F0 não começa.

### D-02 — como provar reautenticação recente

Access token vive 15 min e é renovado por refresh sem o usuário ver
([08-authentication](../../architecture/shared/08-authentication.md#renovação-e-expiração)): um token
válido não diz que alguém digitou a senha há pouco. Para abrir um shell, isso importa.

| | Como | Contra |
|---|---|---|
| **a** | OIDC `max_age` na autorização + claim `auth_time` no access token, conferida pelo backend contra uma janela configurada. Recusa com `STEP_UP_REQUIRED` e `params.maxAgeSeconds`, na semântica do RFC 9470 (Step-Up Authentication Challenge) | depende de o provedor pôr `auth_time` no **access token** — o ID token tem, mas não autentica chamada ([08](../../architecture/shared/08-authentication.md#renovação-e-expiração)) |
| **b** | `acr_values` exigindo MFA | valores de `acr` são do provedor — o código passaria a conhecê-lo ([ADR-010](../../architecture/shared/00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial)) |
| **c** | Confirmação nossa (senha, WebAuthn) | não existe senha aqui, e credencial nossa contraria o ADR-010 |
| **d** | Sem step-up; só o interruptor | um token de 14 min atrás, vazado, abre um shell |

Sub-perguntas que a decisão fecha junto:

- **reanexar também exige?** Reanexar de outra connection é o mesmo poder que abrir — um shell
  vivo. Exigir custa experiência: recarregar a página depois da janela pede novo login;
- **o status.** RFC 9470 usa `401`. O [doc 04](../../architecture/shared/04-errors-and-http.md#regras-de-tratamento)
  diz que `401` é "renove e repita" — e é o que o step-up é, com uma renovação que o refresh
  **não** satisfaz. O risco é um cliente renovar por refresh em laço; o cliente decide pelo `code`,
  não pelo status, e a recusa vem num frame WS, onde não há interceptador de `401`;
- **redirecionamento ou popup.** O redirect recarrega a SPA; terminais abertos sobrevivem se a volta
  couber na carência ([D-06](#d-06--limites-e-ttl)).

Gap: o fake (Keycloak, `infra/keycloak`) põe `auth_time` no access token com o escopo padrão? O
provedor do primeiro deploy põe, ou exige uma regra de pós-login (configuração dele, a registrar no
[plano 05](../05-hardening-operations/README.md) · B-12)?

**Recomendação:** **a**, com janela default de **300 s** (piso 60 s, teto 900 s — a vida do access
token), mandada ao provedor como `max_age` para ele só pedir senha quando precisa; **reanexar de
outra connection também exige**; `401` `STEP_UP_REQUIRED`, com cenário provando que renovar por
refresh não satisfaz nem entra em laço (S-19); redirect, e a tela avisa que a volta precisa caber na
carência. Token sem `auth_time` é recusado — falha fechada, nunca "sem claim, deixa passar".

### D-05 — os bytes no WebSocket

O PTY produz bytes; o envelope é JSON validado por schema, gerado em TS e Dart
([05](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).

| | Codificação | Contra |
|---|---|---|
| **a** | Texto UTF-8 no campo `data`, decodificado no servidor com decodificador com estado (caractere partido entre chunks chega inteiro); byte inválido vira U+FFFD | `cat` de binário mostra `�` — é o que o VS Code também faz |
| **b** | base64 dos bytes crus | +33 % no fio, decodificação no cliente, log mais difícil de redigir |
| **c** | Frame binário do WS | sai do envelope, do schema e da geração de tipos — um segundo protocolo |

E o fluxo — sem ele, um `yes` enche a fila da connection e o hub a derruba com `1013`
([backend/06](../../architecture/backend/06-realtime.md#fan-out)), levando junto a sessão do Claude
que ela observava:

| | Controle de fluxo | Contra |
|---|---|---|
| **i** | No servidor: coalescer a saída numa janela curta (8–16 ms) com teto por frame, e **pausar o PTY** quando o `bufferedAmount` do socket passa de uma marca alta, retomando abaixo da baixa | depende de o `bufferedAmount` refletir a fila real do socket |
| **ii** | No protocolo: `terminal.ack { bytes }` do cliente, como o VS Code faz com o pty host | um comando a mais, e o cliente passa a participar do fluxo |

**Recomendação:** **a + i**. Texto mantém um protocolo só; o fluxo no servidor não muda o contrato.
Se a medição mostrar o `bufferedAmount` mentindo (proxy no meio), **ii** entra como campo opcional —
evento e comando novos não sobem `v`.

### D-07 — reconexão, scrollback e quem vê

| | Scrollback | Contra |
|---|---|---|
| **a** | Ring de bytes crus com teto; reanexar reenvia do corte | o corte cai no meio de uma sequência de escape, e perde a troca para a tela alternativa — `vim` aberto volta como lixo |
| **b** | Um terminal "headless" no servidor (`@xterm/headless`) recebe a mesma saída; reanexar manda o estado serializado (`@xterm/addon-serialize`) — tela, cursor, modo e N linhas | memória e CPU por terminal, e as versões de xterm do servidor e do web andam juntas |
| **c** | Sem scrollback: reanexar mostra dali em diante | o pedido diz "reconectar com scrollback" |

E quantas connections veem: **uma**. Duas connections com tamanhos diferentes disputariam `cols` e
`rows` de um único PTY — é o que decide. Reanexar de outra connection **toma** o terminal: a
anterior recebe `terminal.detached { reason: 'attachedElsewhere' }` e seu `input` passa a ser
recusado com `TERMINAL_LOCKED`.

**Recomendação:** **b**, com teto de 1000 linhas (o default do xterm; teto configurável até 10000),
**medido** antes de fechar: se um terminal headless sob `yes` custar mais que o subprocesso que ele
espelha, **a** com corte em fronteira segura e um reset de terminal no início do replay. Uma
connection vê; reanexar toma.

### D-08 — onde mora o interruptor

| | Onde | Contra |
|---|---|---|
| **a** | Variável de ambiente `RC_TERMINAL_ENABLED`, global | liga para **todos** os usuários, e não diz para quem |
| **b** | Seção `terminal: { users: [<sub>…] }` no **arquivo** da allowlist — ausente é desligado | o arquivo passa a ter duas responsabilidades |
| **c** | Por raiz, na allowlist | sugere uma contenção que **não existe**: o shell sai da raiz com um `cd` |
| **d** | Botão na UI | ligar um shell remoto pela rede é exatamente o que o interruptor existe para impedir |

**Recomendação:** **b**. O argumento da allowlist vale inteiro
([workspace](../../architecture/backend/03-modules.md#workspace)): mudá-la exige acesso ao disco
da máquina, a lista é legível e comentável, arquivo fora do schema derruba o boot e a recarga é
explícita. Por usuário, porque ligar é entregar a conta do SO ([D-01](#d-01--o-terminal-existe)).
Recarga que **tira** alguém encerra os terminais dele na hora — interruptor que desliga depois não é
interruptor. E o script de raízes locais do [plano 06](../06-workbench/README.md) (`pnpm allowlist
add`) **não** liga terminal: acrescentar pasta e entregar shell são atos diferentes.

### D-09 — o que prova que o pedido vem do web

"O app não abre terminal" é produto: celular perdido não pode virar shell. Mas o que o backend vê?

| | Prova | Vale |
|---|---|---|
| **a** | `client.kind` do handshake | nada: é o cliente que declara |
| **b** | Ausência de `installId` **e** `azp`/`client_id` do token igual a `OIDC_CLIENT_ID_WEB` | o token é assinado pelo provedor; o client do app não emite token com o `azp` do web |
| **c** | **b** + `Origin` do upgrade igual à origem configurada do web ([plano 17](../17-distribution/README.md) · F1) | navegador não forja `Origin`; script forja |

**Recomendação:** **b** agora, **c** quando o plano 17 entregar a origem conhecida. E a ADR-017 diz
o limite: o client do web é **público** (PKCE, sem segredo), então quem tem as credenciais do
usuário faz o fluxo do web num script. "Só do web" tira o terminal do alcance de um aparelho
perdido; não é barreira contra quem já é o usuário.

---

## F1 — PTY

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | O que a trilha grava de um terminal | nenhum técnico: é escolha entre rastro e vazamento | B-12 | — | 🔲 |
| D-04 | `node-pty` (módulo nativo) e a distribuição | se há binário pré-compilado para Node 22 em linux x64/arm64 e macOS; o que o pnpm 10 exige para rodar o script de instalação; o impacto no [plano 17](../17-distribution/README.md) | B-08 | — | 🔲 |
| D-06 | Limites, TTL ocioso e carência na desconexão | memória de um terminal com scrollback headless ([D-07](#d-07--reconexão-scrollback-e-quem-vê)); o que conta como ociosidade | B-06, B-11 | — | 🔲 |
| D-10 | O ambiente do subprocesso do Claude recebe o mesmo filtro? | quais variáveis o CLI precisa (auth, proxy, Bedrock/Vertex, CA) — medir com o `smoke-live` | B-13 | 2026-09-26 · **b, lista de negação** — os prefixos `RC_`, `OIDC_`, `DATABASE_`, `PG` e `NODE_ENV`/`LOG_LEVEL`, conferidos por teste contra o schema e o `.env.example`; aplicada antes do plano, a pedido do usuário (`claudeEnvironment`, e o `realQueryFactory` recusa `env` ausente ou com variável do backend). O terminal continua com a **a**, na B-07 | ✅ |
| D-12 | Shell integration: injetar os scripts no shell (como o VS Code), deixar o usuário ativar, ou não ter | o que a injeção faz com o `rc` do usuário em bash, zsh e fish; licença dos scripts de referência | B-15, B-19 | — | 🔲 |
| D-13 | Perfis de shell: só os de `/etc/shells` ou caminho livre; onde ficam | se a D-13 do [plano 06](../06-workbench/README.md) (onde vivem as configurações) já decidiu o armazenamento por usuário | B-14 | — | 🔲 |

### D-03 — o que a trilha grava

| | Grava | Contra |
|---|---|---|
| **a** | `terminal.opened`, `terminal.attached`, `terminal.closed` em `audit_events`: quem, pasta, shell, connection, tipo de cliente, endereço do socket; no fechamento, duração, código de saída, sinal, motivo e **contagem** de bytes | não diz o que foi feito — e diz isso |
| **b** | **a** + cada linha de comando, pela integração de shell (sequências OSC 633, como o VS Code) | cooperativa e contornável (`bash --norc`, `sh`); argumento de comando carrega segredo (`mysql -pSENHA`); rastro parcial dá **falsa confiança** — o mesmo argumento do [ADR-011 · B](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) |
| **c** | Gravação integral (entrada e saída) | a entrada tem a senha digitada no `sudo`, mesmo sem eco; volume; privacidade |

**Recomendação:** **a**. As teclas **nunca** — nem na trilha, nem no log, nem em disco: o
scrollback vive só em memória. Abertura recusada (desligado, step-up, origem) vai para o log em
`warn`, não para a trilha: a trilha registra atos, e a recusa não aconteceu. Trilha indisponível
**não abre** (é a regra de todo o resto: sem rastro, não acontece); indisponível no fechamento, o
processo morre assim mesmo e o `error` vai para o log — um shell que não fecha porque o banco caiu é
pior que uma linha perdida.

### D-04 — `node-pty` e a distribuição

| | Como | Contra |
|---|---|---|
| **a** | `node-pty` (o do VS Code), carregado **só** quando o terminal está ligado para alguém | módulo nativo: script de instalação (bloqueado por padrão no pnpm — o `pnpm-workspace.yaml` só libera `esbuild` em `onlyBuiltDependencies`), toolchain de C++ quando não há binário pronto |
| **b** | Um fork com binários pré-compilados | depende de um mantenedor terceiro para um módulo que abre shell |
| **c** | Sem nativo: `child_process` com `script(1)` ou um wrapper de pty em Python | sem `resize` confiável, sem Windows, e um processo intermediário que ninguém audita |

**Recomendação:** **a**, com `node-pty` em `onlyBuiltDependencies` e comentário do porquê;
carregado dinamicamente pelo adapter; **terminal ligado e módulo que não carrega derrubam o boot**
(configuração que promete o que o processo não entrega é configuração inválida); desligado para
todos, o módulo nunca é carregado. O plano 17 precisa empacotar o binário por SO — **nota** para o
plano 17 (D-01 dele, sistemas operacionais), não edição agora.

### D-06 — limites e TTL

| Limite | Proposta | Por quê |
|---|---|---|
| Terminais por usuário | 5 | o suficiente para `dev` + testes + git; mais que isso é esquecido aberto |
| Terminais na instalação | 20 | teto de recurso; medir com o headless de D-07 |
| TTL ocioso | 30 min **sem entrada humana**; teto 8 h; nunca desligável | uma aba esquecida aberta num computador alheio não pode manter um shell para sempre. Saída sozinha (um `tail -f`) não conta como atividade |
| Carência sem ninguém vendo | 60 s (piso 10 s, teto 10 min) | recarregar a página reanexa; fechar a aba de pasta encerra — é o que impede o "shell remoto sem dono" |
| `cols` × `rows` | 2–500 × 1–200 | fronteira de schema, não de negócio |

TTL, carência, janela de step-up e limites são configuração que **move a fronteira de segurança**:
piso e teto no código, e valor fora deles derruba o boot
([07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada)).

**Recomendação:** os números da tabela, confirmados pela medição de memória da D-07 antes da B-11.

### D-10 — o ambiente do subprocesso do Claude

**Achado deste planejamento, e ele existe sem terminal nenhum:** o subprocesso do Claude nasce hoje
com o ambiente **inteiro** do backend — `session-runner.ts` passa `markedEnvironment(process.env, …)`
ao `sdk-options.factory.ts`, que o repassa como `env`. E o `pnpm dev` carrega o `.env` inteiro no
`process.env` (`loadDotEnv` em `scripts/lib/stack.mjs`). Resultado: um `Bash` do Claude que rode
`env` mostra `DATABASE_URL` com a senha do banco, `RC_POSTGRES_PASSWORD` e
`RC_KEYCLOAK_ADMIN_PASSWORD`. Com permissão, ninguém aprovaria sem ler — mas uma regra `Bash(*)`
aprovaria.

| | Filtro | Contra |
|---|---|---|
| **a** | O mesmo `childEnvironment` do terminal: lista de **permissão** | o CLI perderia o que precisa e o shell de login do terminal recupera sozinho (`ANTHROPIC_*`, proxy, CA, Bedrock/Vertex) — o subprocesso do Claude não relê perfil |
| **b** | Lista de **negação** derivada do schema de configuração do backend (toda chave declarada sai) mais prefixos (`RC_`, `OIDC_`, `DATABASE_`, `PG`) | o que não está no schema nem nos prefixos passa |
| **c** | Deixar como está | o achado acima |

**Recomendação:** **b** para o Claude, **a** para o terminal — a diferença é justamente o perfil
relido. A lista de negação sai do schema, não de uma lista à mão: variável nova de configuração sai
do filho sem ninguém lembrar. Provado pelo `smoke-live` (S-110). Se a D-01 encerrar o plano, esta
decisão e a B-13 vão para o [plano 05](../05-hardening-operations/README.md) com este texto.

### D-12 — shell integration

Marcar onde cada comando começa e termina — para decorar sucesso e falha, pular de comando em
comando e saber o `cwd` atual (é por ele que um caminho relativo vira link) — exige que o **shell**
emita sequências de escape (OSC 633, o formato do VS Code). O shell só emite se alguém o ensinar.

| | Como | Contra |
|---|---|---|
| **a** | Injetar no spawn, como o VS Code: bash com `--init-file` que lê o `rc` do usuário e depois o nosso; zsh por `ZDOTDIR` temporário; fish por `XDG_DATA_DIRS` | mexe na inicialização do shell do usuário — precisa ser transparente e desligável |
| **b** | O usuário ativa, colando uma linha no próprio `rc` | ninguém cola; a feature não existe na prática |
| **c** | Não ter | sem marcas de comando, sem navegação, sem link de caminho relativo confiável |

A integração é **cooperativa**: o shell emite o que quiser, e um `sh` qualquer não emite nada. Por
isso ela serve à interface e **nunca** à trilha nem a decisão de segurança
([D-03](#d-03--o-que-a-trilha-grava)) — o backend não interpreta nem loga essas sequências; o
navegador as lê do stream que já recebe.

**Recomendação:** **a**, para bash, zsh e fish, desligável nas Configurações › Terminal; scripts
nossos, curtos, versionados no repositório (os do VS Code são MIT e servem de referência — conferir
a licença ao copiar qualquer trecho); shell sem suporte abre sem integração e sem erro.

### D-13 — perfis de shell

| | Perfis | Contra |
|---|---|---|
| **a** | Só os detectados: `/etc/shells`, filtrado para executáveis que existem, mais o shell da conta | não cobre um shell instalado fora da lista (um `nu` do Homebrew) |
| **b** | **a** + perfis personalizados por usuário: nome, caminho **absoluto** de executável, argumentos | caminho livre é executável livre — mas o terminal já é um shell, então não é poder novo; é validação |

**Recomendação:** **b**, com o caminho validado (absoluto, existe, executável) ao salvar **e** ao
abrir; perfil padrão por usuário; guardado onde a D-13 do plano 06 mandar as configurações do
usuário. Variáveis de ambiente por perfil **não** entram: seriam um caminho para reintroduzir no
shell o que a B-07 tirou.

---

## F2 — Interface do terminal

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | xterm.js: renderizador, carregamento e como testar | tamanho do bundle; desempenho do renderizador DOM sob enxurrada num celular; o que o jsdom consegue exercitar | B-17 | — | 🔲 |

### D-11 — xterm.js: renderizador, carregamento e teste

| | Renderizador | Contra |
|---|---|---|
| **a** | DOM (o padrão) | mais lento sob enxurrada; melhor com leitor de tela e em qualquer navegador |
| **b** | WebGL (`@xterm/addon-webgl`) | rápido; contexto WebGL perdido em aba de fundo precisa de volta ao DOM; mais código |

E o teste: o jsdom não desenha, então o xterm fica atrás de uma porta (`TerminalView`) — os testes
unitário e de integração do web exercitam hook, service e componente com uma implementação falsa, e a
renderização real é provada no Playwright (F3). Cobertura de 90 % vale para o que é nosso; o xterm
é dependência.

**Recomendação:** **a**, carregado sob demanda (chunk próprio, só quando o painel abre um
terminal), com a medição do bundle registrada; **b** só se a medição no celular pedir, e como
melhoria, não como requisito deste plano.

---

## F3 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — o e2e prova o que F0…F2 decidiram)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece. A D-01
   **é** a ADR-017, aberta na B-01.
3. Rode `pnpm plan progress 10`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**. A numeração segue a ordem em que as perguntas foram
  enumeradas, não a das fases: D-03, D-04, D-06, D-10, D-12 e D-13 são da F1.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
