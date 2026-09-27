# Plano 16 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | A fronteira com o plano 05 · F1: este plano absorve a "tela de diagnóstico" de lá e deixa lá só a ingestão? | o que o 05 · F1 de fato entregou — verificado no código: está **concluída**, e a tela dela é a do **app** | B-01 | **Descartada em 2026-09-27**: o envio de log do web e do app saiu do plano 05 por decisão do usuário — não há ingestão para ler nem fronteira a traçar. O 05 · F1 ficou só com a tela de diagnóstico do app, que este plano não toca, e o visualizador mostra só o backend — ver [progresso](progress.md#decisões-tomadas-durante-a-execução) | ✅ |
| D-02 | Quem vê log de backend: o papel de operador | hoje só há usuários, e a autorização é local; quantas pessoas usam uma instalação | B-02, B-12 | — | 🔲 |
| D-03 | Onde os logs ficam para o produto lê-los: memória, arquivo, tabela ou o coletor do stdout | volume real em `debug`; se alguém quer ler o que aconteceu antes do último reinício | B-03, B-09 | — | 🔲 |
| D-04 | Seguir ao vivo: long-poll HTTP, stream próprio no WebSocket, ou SSE | quanto atraso é aceitável num visualizador; custo de mudar o contrato nas três pontas | B-04, B-19 | — | 🔲 |
| D-05 | Busca: termos literais ou regex | se a regex no servidor pode ser limitada sem módulo nativo | B-04, B-13 | — | 🔲 |
| D-06 | Mudar o nível do backend em execução: pode? Com que prazo? | se os loggers filhos criados no boot seguem o nível do raiz — não medido | B-04, B-15 | — | 🔲 |
| D-07 | Exportação: formato, teto, e se vai para a trilha | tamanho útil de um recorte; se exportar log de backend é fato de auditoria | B-04, B-14 | — | 🔲 |
| D-08 | Logs e Saúde: uma entrada na navegação com duas sub-telas, ou duas entradas | como o plano 06 fecha a navegação | B-07 | — | 🔲 |
| D-09 | Quem vê o quê na saúde | que item revela a máquina (caminhos, processo, outras pessoas) | B-05, B-28 | — | 🔲 |

### D-01 — a fronteira com o plano 05 · F1

**Não se aplica mais — descartada em 2026-09-27.** A pergunta era como dividir o trabalho com o
05 · F1, que tinha entregado a ingestão `POST /logs` e os dois shippers do web e do app; a
recomendação era "o 05 escreve, o 16 lê", com as linhas do cliente entrando no buffer daqui.

Em 2026-09-27 o usuário decidiu que o envio de log do cliente ao backend não é necessário, e ele
saiu do código e do [plano 05](../05-hardening-operations/progress.md#escopo-reduzido-ou-adiado):
o endpoint, os shippers e a redação por forma de texto. A regra agora é a de
[03-logging](../../architecture/shared/03-logging.md#por-quê-o-mesmo-schema-nas-três-pontas) — **o
log do cliente fica no cliente**, e o que liga um erro na tela ao log do backend é o `traceId`. O
05 · F1 virou [Diagnóstico](../05-hardening-operations/F1-diagnostics.md), só com a tela do app que
liga `debug` em release, e este plano não a toca.

O que muda aqui: o visualizador mostra só as linhas do backend; a B-11 (as linhas do cliente no
buffer) e os cenários que só existiam para ela saíram
([progresso](progress.md#escopo-reduzido-ou-adiado)). Continua valendo a nota que a D-01 trazia: o
pressuposto da D-12 do [plano 06](../06-workbench/README.md) ("o 05 acrescenta os logs na tela")
está desatualizado — quem acrescenta é este plano.

### D-02 — quem vê log de backend: o papel de operador

Uma linha de backend em `debug` carrega o prompt de **qualquer** usuário (truncado em 2 KB), input
de tool e caminhos. Hoje o stdout só é lido por quem tem shell na máquina — e esse é, de fato, quem
opera. Não existe papel no sistema, e a regra de [autenticação](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local)
é que a autorização é **local**, nunca vinda do provedor.

Sem linhas de cliente (a D-01 descartada), não há mais o que mostrar a quem não opera: o
visualizador inteiro é do operador, e quem não é recebe a explicação, não uma lista vazia.

Opções:

- **(a)** lista de `sub` de operadores **em configuração** (variável `RC_OPERATOR_SUBS` validada
  pelo schema do ambiente, ou um campo no arquivo de configuração local), lida no boot, vazia por
  padrão; o stack de desenvolvimento declara o usuário de teste;
- **(b)** coluna de papel na tabela de usuários, com tela para conceder — e a pergunta de quem
  concede o primeiro;
- **(c)** todo usuário autenticado vê tudo — coerente com "uma máquina, um dono", incoerente com a
  allowlist, que já separa raízes por usuário;
- **(d)** claim do provedor (`roles`) — proibido pela regra acima.

**Recomendação:** (a). É o mesmo modelo da allowlist (configuração, não código; ninguém vira
operador por uma requisição), e vazio por padrão falha fechado. Conceder papel pela UI fica para
quando houver mais de um operador por instalação — hoje não há.

### D-03 — onde os logs ficam para serem lidos

O log do backend vai para o stdout, com a retenção de quem o coleta
([03-logging](../../architecture/shared/03-logging.md)). O visualizador precisa de algo que o próprio
backend consiga consultar.

Opções:

- **(a)** **anel em memória** alimentado pelo mesmo destino do `pino` que escreve no stdout: consulta
  barata, sem I/O, some no reinício; o stdout continua sendo o registro durável;
- **(b)** arquivo JSONL rotativo num diretório de dados, com teto por tamanho e idade — sobrevive ao
  reinício, custa I/O no caminho de toda linha e uma política de disco;
- **(c)** tabela no Postgres — todo I/O em `debug` vira `INSERT`: o log passaria a ter o custo e o
  risco do banco, e o banco fora deixaria de ser logável;
- **(d)** ler o coletor do stdout (journald, arquivo do serviço) — depende de como o backend roda,
  que é do plano 17.

**Recomendação:** (a) agora, declarado na tela ("desde o reinício às HH:MM") e na ajuda. A (b) é
registrada como a evolução natural quando o [plano 17](../17-distribution/README.md) instalar o
backend como serviço — e é para lá que a pergunta vai, se continuar aberta no fim deste plano.

### D-04 — seguir ao vivo: long-poll HTTP, stream no WebSocket, ou SSE

Opções:

- **(a)** **long-poll HTTP com cursor** — `GET /diagnostics/logs?after=<cursor>&wait=25`: responde
  assim que há linha nova ou ao fim da espera. Contrapressão natural (o cliente pede no ritmo dele),
  reusa autenticação, filtro e redação da consulta, e **não muda o contrato WS**;
- **(b)** stream próprio no WebSocket (`diag.logs.subscribe` → `diag.logs.appended`, `seq` próprio,
  sem replay) — latência menor, mas mudança de contrato nas três pontas (Dart incluso, e
  `test:e2e:mobile` no critério), e um canal de sessão dividindo banda com uma inundação de log;
- **(c)** SSE — o `EventSource` do navegador **não envia `Authorization`**, e token em query string é
  proibido ([AGENTS.md](../../../AGENTS.md#anti-padrões-que-serão-rejeitados-em-review)); exigiria
  `fetch` com stream, que é a (a) com mais código.

**Recomendação:** (a). Um visualizador de log tolera um segundo; o que não tolera é derrubar o canal
das sessões numa rajada.

### D-05 — busca: termos literais ou regex

Regex vinda do usuário, executada no event loop que também roda as sessões e o `canUseTool`, é
ReDoS: um padrão catastrófico trava o backend inteiro. O `RegExp` do Node não tem prazo.

Opções: **(a)** termos literais, sem caixa, vários, com `!` para excluir — o que o filtro do painel
Output do VS Code faz; **(b)** regex com RE2 (módulo nativo, impacto no plano 17); **(c)** regex num
`worker_thread` com prazo; **(d)** regex só no cliente, sobre o que já foi carregado — resultado
incompleto sem dizer.

**Recomendação:** (a). Cobre o uso real (achar um `op`, um id, uma palavra da mensagem) sem risco;
filtros estruturados (nível, módulo, `op`, trace, sessão, usuário) fazem o resto.

### D-06 — mudar o nível do backend em execução

Reproduzir um defeito intermitente em produção precisa de `debug` sem reiniciar — a mesma razão que
fez o app ganhar o interruptor no plano 05. Mas nível elevado esquecido é vazamento lento
([05 · B-11](../05-hardening-operations/F1-diagnostics.md)).

**Gap:** no `pino`, o filho criado por `logger.child()` herda o nível **na criação**; mudar o raiz
depois pode não propagar aos filhos que os módulos criaram no boot. Medir antes da B-15 — se não
propagar, o controle precisa de um registro dos filhos ou de um nível lido por função.

**Recomendação:** sim, só o operador, com prazo obrigatório (padrão 15 min, teto 2 h), volta
sozinho, volta também no reinício (o processo nasce no `LOG_LEVEL`), e cada mudança efetiva vai para
a trilha (`diagnostics.logLevelChanged`).

### D-07 — exportação

**Recomendação:** JSONL (uma linha por registro, o mesmo formato da consulta), com os filtros da
vista, teto de 20 000 linhas ou 10 MB — acima, corta e diz; passa pela mesma redação da consulta; e
**toda exportação vai para a trilha** (`diagnostics.logsExported`, com filtro e contagem, nunca as
linhas): é o único jeito de log de todos os usuários sair da máquina num arquivo.

### D-08 — Logs e Saúde: uma entrada ou duas

O usuário pediu uma tela por assunto; o plano 06 reservou **uma** entrada, "Logs e diagnóstico",
em `/diagnostics`.

**Recomendação:** uma entrada na navegação, duas sub-telas com rota, moldura e ajuda próprias —
`/diagnostics/logs` e `/diagnostics/health` —, e `/diagnostics` abre a saúde (é o que responde "está
tudo bem?", e é onde o ping que o 06 pôs ali continua). São dois assuntos com o mesmo público; duas
entradas na navegação global disputariam espaço com Auditoria, Regras e Dispositivos sem ganho.

### D-09 — quem vê o quê na saúde

**Recomendação:** todo usuário autenticado vê o estado de cada item, a explicação e o que fazer — o
usuário que não consegue abrir sessão precisa saber que o banco caiu. O que **revela a máquina** só
o operador vê: caminho de raiz da allowlist que não é do usuário, pid e memória do processo, sessões
e contagens de outras pessoas, detalhes do provedor de identidade. O filtro é do backend, na
resposta — nunca a tela escondendo o que recebeu.

---

## F1 — Backend dos logs

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Volume e retenção do buffer: teto, reserva para `warn+`, teto por linha | bytes por minuto em `debug` durante uma sessão real com tools — não medido | B-09 | — | 🔲 |
| D-11 | Linha de cliente abaixo do `LOG_LEVEL` do backend: descartada ou gravada? | se um logger filho do `pino` pode ter nível **mais baixo** que o raiz no mesmo destino | B-11 | **Descartada em 2026-09-27**, junto com a B-11: as linhas do cliente não chegam mais ao backend — ver [D-01](#d-01--a-fronteira-com-o-plano-05--f1) | ✅ |

### D-10 — volume e retenção do buffer

**Gap:** medir, numa sessão real com o backend em `debug`, quantos bytes por minuto o log produz —
o I/O de toda borda sai com payload até 8 KB. O número decide quantos minutos o buffer guarda.

**Recomendação:** teto total configurável (`RC_LOG_BUFFER_BYTES`, padrão 32 MB) com uma **reserva
separada de 4 MB só para `warn`/`error`/`fatal`**, para que uma inundação de `debug` nunca expulse o
último erro; teto de 16 KB por linha no buffer (o payload já vem cortado em 8 KB, mas a linha inteira
não); `0` desliga, e a tela diz. A saúde avisa quando o buffer guarda menos que um limiar de minutos.

### D-11 — o nível das linhas do cliente contra o `LOG_LEVEL` do backend

**Descartada em 2026-09-27.** Medido no código em 2026-09-26: o sink da ingestão do plano 05
escrevia cada linha do cliente no logger raiz, e com o backend em `LOG_LEVEL=info` toda linha
`debug` do cliente era descartada pelo `pino`. A recomendação era um logger filho com nível próprio.
Com o envio de log do cliente removido ([D-01](#d-01--a-fronteira-com-o-plano-05--f1)), não há mais
linha de cliente chegando ao backend, e a pergunta deixa de existir. O `debug` que a tela do app
liga vai para o console do aparelho.

---

## F2 — Tela de logs

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | "Debug neste navegador": por quanto tempo e em que alcance | se quem reproduz um defeito precisa do nível elevado fora da tela de logs | B-21 | — | 🔲 |

### D-12 — debug neste navegador: prazo e alcance

No app, sair da tela desliga o `debug` (05 · B-11). No web isso anula o propósito: o defeito
acontece no workbench, não na tela de logs.

**Recomendação:** vale para a aba do navegador (em `sessionStorage`, nunca `localStorage`), com prazo
de 30 min, indicador sempre visível na status bar do plano 06 com "desligar", e volta ao nível do
build ao expirar ou ao fechar a aba. As linhas vão para o console do navegador — nada sai dele
([web/05-logging](../../architecture/web/05-logging.md#nada-sai-do-navegador)) —, e por isso o
controle vale para qualquer usuário, operador ou não.

---

## F3 — Tela de saúde

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-13 | "Rodar o doctor" no servidor | o que o `scripts/doctor.mjs` verifica — verificado: pré-requisitos de **desenvolvimento** | B-25 | — | 🔲 |
| D-14 | A sonda do Claude: o que ela faz e quem a dispara | se `accountInfo()`/versão respondem sem prompt e sem custo numa query efêmera — não medido | B-26 | — | 🔲 |
| D-15 | A fronteira com os planos 07, 10 e 11 | a ordem em que os planos serão implementados | B-26, B-27 | — | 🔲 |
| D-16 | Cache e frequência dos checks | custo de cada check (o da CLI abre processo) | B-24 | — | 🔲 |

### D-13 — rodar o doctor no servidor

O `doctor` verifica Node, pnpm, Docker, Docker Compose, Flutter, gitleaks e **se as portas do stack
estão livres**. Rodado no backend ligado, o item das portas falha sempre (o próprio stack as ocupa),
e Docker e Flutter não são dependência de execução.

**Recomendação:** não executar o script no servidor. A saúde é uma verificação **de execução**,
implementada no backend como checks, com a mesma forma de resultado do doctor
(`nome`, `status`, `detalhe`, `como resolver`) traduzida por chave. O doctor segue sendo o primeiro
comando do desenvolvedor, e a ajuda da tela de saúde aponta para ele quando o problema é do ambiente
de desenvolvimento.

### D-14 — a sonda do Claude: o que ela faz e quem a dispara

**Gap:** o plano 04 · F3 obteve `supportedCommands()` com cache por versão do CLI; falta medir se uma
query efêmera responde versão e estado de login **sem** enviar prompt e sem custo.

**Recomendação:** verificações **passivas** automáticas (versão do SDK, CLI encontrado e executável,
`CLAUDE_CONFIG_DIR` resolvido — lembrando o defeito do vazio corrigido no plano 04 —, logado ou não);
**sonda ativa** (um prompt mínimo de verdade) só por clique do operador, com aviso de que consome o
plano do Claude, uma de cada vez (`409` se já há uma), com ritmo, e registrada na trilha
(`diagnostics.claudeProbed`: resultado e duração, nunca o texto).

### D-15 — a fronteira com os planos 07, 10 e 11

O [plano 11](../11-claude-settings/README.md) tem o diagnóstico da instalação do Claude (conta,
plano, modelos, teste de conexão) na tela dele; o [07](../07-explorer-and-editor/README.md) abre
watchers e o [10](../10-integrated-terminal/README.md) abre terminais.

**Recomendação:** este plano é dono do **registro** (`HealthCheck` e `ResourceGauge`, portas com
múltiplos provedores) e da tela; entrega os checks mínimos do Claude sem depender do 12. Cada plano
registra o seu quando existir — o 11 substitui o check de login pelo dele e a tela dele aponta para
cá; o 07 registra watchers abertos, o 10 terminais abertos, cada um com contagem e teto. Item de
plano ausente não aparece (sem "desconhecido" que ninguém pode resolver).

### D-16 — cache e frequência

**Recomendação:** resultado em cache por 30 s; "verificar de novo" com ritmo de 6 por minuto por
usuário e execução única (dois pedidos juntos esperam a mesma); cada check com prazo de 3 s (o do
Claude, 10 s); atualização automática a cada 60 s só com a tela visível.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que as anteriores decidem)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 16`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
