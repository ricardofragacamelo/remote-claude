# Planos — progresso geral

O [índice](README.md) diz **quais** planos existem e qual é o formato. Este arquivo diz **em que
pé o projeto está**, somando todos eles.

Cada plano tem o seu próprio `progress.md`, que é o diário daquele trabalho. Este é o de cima:
uma linha por plano, e o total. Ele não substitui nenhum — responde a outra pergunta.

Os **contadores** — barras, linha de cada plano e total — são gerados por `pnpm plan progress`,
lidos dos arquivos de fase e das matrizes de cenário de **todos** os planos. O resto é escrito
à mão, e o comando não toca nele.

---

## Panorama

**Última atualização:** 2026-09-27

```
00-bootstrap             ████████████████████ 100%   ✅ concluído
01-live-session          ████████████████████ 100%   ✅ concluído
02-mobile-approval       ████████████████████ 100%   ✅ concluído
03-rules-and-audit       ████████████████████ 100%   ✅ concluído
04-transcript-and-resume ████████████████████ 100%   ✅ concluído
05-hardening-operations  ███████████░░░░░░░░░  55%   🔄 em andamento
06-workbench             ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
07-explorer-and-editor   ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
08-claude-panel          ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
09-search                ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
10-integrated-terminal   ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
11-claude-settings       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
12-audit-explained       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
13-rules-management      ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
14-usage-and-cost        ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
15-devices               ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
16-logs-and-diagnostics  ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
17-distribution          ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
```

---

## Por plano

Fases concluídas · tarefas concluídas · cenários passando · decisões tomadas.

| Plano | Fases | Tarefas | Cenários | Decisões | Estado |
|---|---|---|---|---|---|
| [00 — Bootstrap](00-bootstrap/README.md) | 8/8 | 52/52 | 118/119 | 5/6 | ✅ |
| [01 — Sessão viva](01-live-session/README.md) | 7/7 | 47/47 | 107/108 | 17/17 | ✅ |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | 5/5 | 34/34 | 89/89 | 25/26 | ✅ |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | 5/5 | 23/23 | 92/92 | 22/22 | ✅ |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | 6/6 | 25/25 | 88/88 | 7/7 | ✅ |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | 2/5 | 12/22 | 36/59 | 10/10 | 🔄 |
| [06 — Workbench](06-workbench/README.md) | 0/7 | 0/39 | 0/166 | 3/17 | 🔲 |
| [07 — Explorer e editor](07-explorer-and-editor/README.md) | 0/9 | 0/61 | 0/360 | 0/20 | 🔲 |
| [08 — Painel do Claude](08-claude-panel/README.md) | 0/7 | 0/58 | 0/272 | 0/23 | 🔲 |
| [09 — Busca](09-search/README.md) | 0/4 | 0/24 | 0/162 | 0/8 | 🔲 |
| [10 — Terminal integrado](10-integrated-terminal/README.md) | 0/4 | 0/26 | 2/175 | 2/13 | 🔄 |
| [11 — Configuração do Claude](11-claude-settings/README.md) | 0/5 | 0/46 | 0/199 | 1/22 | 🔲 |
| [12 — Auditoria explicada](12-audit-explained/README.md) | 0/5 | 0/38 | 0/151 | 0/14 | 🔲 |
| [13 — Gestão de regras](13-rules-management/README.md) | 0/5 | 0/36 | 8/223 | 1/19 | 🔄 |
| [14 — Uso e custo](14-usage-and-cost/README.md) | 0/5 | 0/33 | 0/123 | 0/15 | 🔲 |
| [15 — Dispositivos](15-devices/README.md) | 0/4 | 0/28 | 0/118 | 0/12 | 🔲 |
| [16 — Logs e diagnóstico](16-logs-and-diagnostics/README.md) | 0/5 | 0/34 | 0/116 | 2/16 | 🔲 |
| [17 — Distribuição](17-distribution/README.md) | 0/4 | 0/19 | 0/38 | 3/7 | 🔲 |
| **Total** | **33/100** | **193/645** | **540/2658** | **98/274** | 🔄 |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

---

## Onde o projeto está

**O produto conversa com o Claude, e nenhuma tool sensível roda sem um humano dizer sim.**

O [plano 01](01-live-session/README.md) fechou em 2026-09-19: uma `query()` do Agent SDK roda de
verdade na máquina, o stream chega ao web como eventos do nosso contrato, **toda** invocação de
tool é gravada numa trilha que o próprio banco recusa reescrever, uma tool sensível **bloqueia o
loop do agente** até um humano responder — com o silêncio negando, porque o nosso prazo é o único
que existe —, existe a tela onde esse humano responde, e os nove cenários obrigatórios alcançáveis
por este plano rodam em todo PR.

O [plano 02](02-mobile-approval/README.md) está em andamento: **um aparelho já prova de onde
vem**. A F0 fechou em 2026-09-19 nas três pontas — registro, aprovação a partir do navegador,
revogação que alcança o socket aberto com `4401`, e o pendente que ninguém aprovou saindo da
lista. A metade backend da F1 fechou junto: o módulo `notification` decide a quem contar e
quando, o adapter fala com um provedor cujo nome não existe fora da configuração, e o payload
carrega três campos e nenhum output de comando.

Em 2026-09-20 a **F2 fechou**: o celular acompanha uma sessão viva — o socket com o conjunto
completo de comandos, as três regras do stream, a lista de pastas de onde uma sessão nasce e a
tela da sessão com os quatro estados, `detach` obrigatório e nada de string literal. Na F1,
B-31 e B-32 fecharam junto: o token que o sistema operacional troca se reenvia sozinho, e quando
a notificação **não** vai chegar o app diz isso — com palavras diferentes para "você negou" e
para "esta versão não recebe".

Em 2026-09-23 a **F1 fechou**: o transporte de push da plataforma, a parte de B-13 que por
[D-21](02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart)
vive em `android/` e nunca no Dart, passou a existir. O arquivo de credencial é de quem opera, e
sem ele o build compila e o app diz que não recebe notificação.

Em 2026-09-24 **F3 e F4 fecharam**, e com elas o plano: o celular responde permissão com o comando
inteiro na tela, dois passos para o destrutivo, biometria e revalidação no servidor ao abrir pela
notificação; os cenários de duas pontas rodam em todo PR, e o `integration_test` do app passou no
emulador fixado. A entrega real do push e o diálogo do SO estão provados numa variante opt-in, que sai da
máquina; a suíte padrão continua hermética. O próximo é o [plano 03](03-rules-and-audit/README.md).

Ainda em 2026-09-24 a **F0 do [plano 03](03-rules-and-audit/README.md) fechou**: quem aprovou
"neste projeto" ou "sempre" não é perguntado de novo — a regra responde antes de qualquer card ou
push, e toda tela vê que ela agiu. A regra é de uma pessoa, expira, e revogar vale na próxima
invocação da sessão já aberta; por isso ela **não** é devolvida ao SDK
([D-09](03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)). Por enquanto
a regra se vê e se revoga pela API; as telas são a F1.

Ainda em 2026-09-24 a **F1 do plano 03 fechou**: o que foi autorizado antes se vê e se retira
nas duas pontas — `/rules` no web e a tela de regras no app, com escopo, padrão, autor, data e
validade, aviso a menos de sete dias, a expirada marcada e revogar a um toque. A pergunta passou a
oferecer "não perguntar de novo" **com** a regra que deixaria — padrão e validade vêm do servidor
([D-12](03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)) —, e escolher `project`
ou `always` pede sempre um segundo passo que diz o alcance por extenso. O próximo é a trilha (F2).

Ainda em 2026-09-24 a **F2 do plano 03 fechou**: "o que rodou na minha máquina sem me perguntar?"
tem resposta. `GET /audit-entries` pagina a trilha por cursor sobre `seq`, com filtro por sessão,
tool, decisão e período, sobre os índices que o plano de execução confirma; `/audit` no web mostra
cada entrada com o `input` exato e diz em palavras quem a deixou rodar. A entrada de decisão passou
a gravar o próprio veredito — pedido, regra, `auto`, quem e de onde
([D-15](03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)) — e o `traceId` do
turno ([D-16](03-rules-and-audit/decisions.md#d-16--o-traceid-é-o-do-turno)); da entrada se abre a
regra, inclusive revogada. O próximo é a retenção (F3).

Ainda em 2026-09-24 a **F3 do plano 03 fechou**: a trilha guarda no mínimo 90 dias, e o que passa
disso sai por uma purga que se registra. O backend purga sozinho — um minuto depois do boot e
depois a cada intervalo, desligável só com `off` — e `pnpm db purge` é a mesma rotina à mão, sob o
mesmo advisory lock. Cada lote é apagado **e** registrado em `audit_purges` pela mesma instrução
([D-19](03-rules-and-audit/decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga)),
as duas trilhas são varridas de forma independente
([D-20](03-rules-and-audit/decisions.md#d-20--a-trilha-são-as-duas-tabelas)), e o piso da trigger
passou a 2160 horas, igual em qualquer fuso
([D-21](03-rules-and-audit/decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário)).
O próximo é o e2e do ciclo da regra (F4).

Ainda em 2026-09-24 a **F4 fechou, e com ela o [plano 03](03-rules-and-audit/README.md)**: o ciclo da
regra está provado pela porta do usuário — conceder "não perguntar de novo", a escrita seguinte
rodar sem ninguém ser perguntado (numa **outra** sessão, para não confundir com regra de sessão),
a trilha mostrar essa escrita ligada à regra, revogar pela tela e a sessão já aberta voltar a
perguntar. A regra concedida no celular vale para a sessão do navegador, pelo contrato e pelas
telas do app. Escrever os cenários achou três defeitos: duas revogações simultâneas gravavam duas
vezes na trilha e respondiam instantes diferentes; o link de uma trilha filtrada perdia o filtro
no login; e o app chamava toda resolução automática de "regra desta sessão". Os três estão
corrigidos, com teste. O próximo é o [plano 04](04-transcript-and-resume/README.md).

Em 2026-09-25 a **F0 do [plano 04](04-transcript-and-resume/README.md) fechou**: o backend lê o
histórico — inclusive o que começou no VSCode — só pelas funções do SDK, e `lint:arch` reprova
parser próprio. A mesma allowlist que cerca onde o Claude roda cerca o que se lê, sobre o `cwd`
que o SDK devolve; conversa aberta aqui por outra pessoa responde `404`, igual à que não existe.
A página vem pela cauda, com cursor que não pula nem repete sob escrita viva, e no formato dos
eventos vivos. E a sessão aberta aqui passou a gravar a **procedência antes do subprocesso**, com
um id que nós cunhamos e o SDK usa — é o que rotula "nossa" e "externa", e o que a F2 vai usar para
decidir entre continuar o arquivo e fazer fork.

Ainda em 2026-09-25 fecharam a **F1 e a F2**: o histórico tem tela nas duas pontas, a recarga que o
`gap: true` exige finalmente tem de onde recarregar, e uma conversa encerrada continua — a nossa no
mesmo arquivo, a do VSCode por fork num id nosso, e a que já está viva por `attach`, nunca por um
segundo subprocesso.

Em 2026-09-26 fecharam a **F3 e a F4**. O menu de slash commands vem da **instalação**
(`supportedCommands()`), sem lista no código, sem os comandos internos e mortos, cacheado por versão
do CLI e workspace; o `/init` é um prompt como outro qualquer e pede o `Write` pelo fluxo normal —
provado com uma gravação real. E o **desfazer é nosso**, não o `rewindFiles()` do SDK: a tela mostra
antes o que volta, o que fica e por quê; arquivo editado à mão depois da sessão é preservado; nada é
escrito através de link nem pela metade; a trilha recebe o desfazer antes do disco; e uma conversa
continuada in-place alcança os pontos das sessões anteriores.

Ainda em 2026-09-26 a **F5 fechou, e com ela o [plano 04](04-transcript-and-resume/README.md)**: o
ciclo está provado pela porta do usuário — continuar pela tela de histórico uma conversa encerrada,
voltar de um `gap` com o transcript recarregado por HTTP e cada mensagem uma vez só, abrir no
celular a sessão que começou no navegador, `/init` pelo menu, desfazer pela tela e a recusa durante
um turno, e a retomada de uma pasta apagada ou que saiu da allowlist, recusada em palavras. Para
isso o backend roteirizado passou a ser **um** Claude: grava as conversas que reproduz e escreve os
arquivos que a gravação escreveu. O `smoke-live` dos comandos reais e do `/init` passou contra o
Claude da máquina. Escrever os cenários achou dois defeitos: web e app abriam uma sessão já em
andamento **sem pedir replay** — o celular via só o que viesse depois —, e um `CLAUDE_CONFIG_DIR`
vazio no `.env`, como o exemplo manda, deixava o CLI **sem login** e limpava a marca de confiança
no arquivo errado. Os dois estão corrigidos, com teste. O próximo é o
[plano 05](05-hardening-operations/README.md).

Em 2026-09-26, com o produto de pé pela primeira vez, **o usuário rejeitou a web como estava**: uma
coluna de cartões, a sessão aberta numa pasta de rascunho em vez do projeto, e as telas de trilha e de
regras sem detalhe, sem ajuda e sem explicar o que aconteceu. O pedido foi um **cliente do Claude no
molde do VS Code**, com o foco em abrir, criar, operar e editar arquivos; cada pasta numa aba com o
explorer, o editor e o chat lado a lado; e **uma tela para cada assunto**, completa e com ajuda. Daí
nasceram os planos **06 a 16** — sem inteligência de linguagem, sem depuração e sem git, por decisão
do usuário. Eles começam depois que o 05 fechar, e não dependem do 17
([06 · D-02](06-workbench/decisions.md)).

Planejá-los leu o código com atenção nova e achou **cinco defeitos no que já está entregue**, todos
registrados como task. Os dois mais graves foram **corrigidos em 2026-09-26**, antes dos planos, a
pedido do usuário — validados pelos portões 1–6 e pela cobertura do backend; os portões 8–11 e o
`smoke-live` não rodaram, também por decisão dele:

| Defeito | Onde | Quem corrige |
|---|---|---|
| o subprocesso do Claude herda o `process.env` inteiro do backend — um `Bash` com `env` mostra a senha do banco e a do admin do Keycloak | `adapter/outbound/claude/process-marker.ts` | **corrigido** — [10 · B-13](10-integrated-terminal/F1-pty.md) antecipada (🔄: falta o `smoke-live`) |
| a regra por prefixo casa comando encadeado: `allow Bash(git status:*)` libera `git status && curl … \| sh` | `domain/permission/services/rule-pattern.ts` | **corrigido** — casamento da [13 · B-08](13-rules-management/F1-rules-backend.md) antecipado; junto, o classificador de risco passou a separar no `&` simples |
| `POST /permission-rules` aceita `projectPath` fora da allowlist e de outro dono | `adapter/inbound/http/permission-rules` | [14 · F1](13-rules-management/F1-rules-backend.md) |
| o upsert do repositório de dispositivos regrava `status`, e uma revogação concorrente pode ser desfeita | `DrizzleDeviceRepository.save()` | [15 · B-05](15-devices/F1-devices-backend.md) |
| `turn.completed.costUsd` publica o acumulado da sessão, não o custo do turno | `sdk-message.mapper.ts` | [14 · B-07](14-usage-and-cost/F1-usage-backend.md) |

O parágrafo abaixo descreve o ponto de partida, e continua valendo para o que ainda não foi feito.

---

**O trilho existe e está provado; o produto ainda não fala com o Claude.**

O [plano 00](00-bootstrap/README.md) fechou com `pnpm verify:full` saindo 0 — os onze portões
verdes — e com `pnpm test:e2e:mobile` também verde. O que existe é um walking skeleton
atravessando autenticação, contrato WS, as quatro camadas do backend, o banco, o web e o app.

O que **não** existe ainda: nenhuma chamada a `query()` do Agent SDK, nenhum fluxo de permissão,
nenhum push. Isso é escopo declarado, não omissão — ver o
[escopo do bootstrap](00-bootstrap/README.md#escopo).

Os planos 01 a 05 constroem o produto sobre esse trilho, nesta ordem, e cada um depende do
anterior; os 06 a 16 são o cliente no molde do VS Code, e dizem de quais outros dependem; o 17
empacota o que todos eles entregam, e por isso é o último:

| Plano | Entrega a capacidade de… | Depende de |
|---|---|---|
| [01 — Sessão viva](01-live-session/README.md) | conversar com o Claude, com toda tool auditada e aprovável pela web ✅ | 00 |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | decidir de longe, com device aprovado e push | 01 |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | não repetir a mesma aprovação, e consultar o que foi executado | 01, 02 |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | continuar o que começou antes, inclusive no VSCode | 01 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | ficar ligado sem vazar recurso nem credencial | 01…04 |
| [06 — Workbench](06-workbench/README.md) | abrir uma pasta da máquina numa aba de workbench, várias ao mesmo tempo, e chegar a cada tela pela navegação global | 05 |
| [07 — Explorer e editor](07-explorer-and-editor/README.md) | navegar, criar, operar e editar arquivos sem perder trabalho quando o Claude escreve junto | 06 |
| [08 — Painel do Claude](08-claude-panel/README.md) | conversar com o Claude ao lado do editor, com as sessões da pasta, diffs e o contexto escolhido por `@`, arrasto e `/` | 07 |
| [09 — Busca](09-search/README.md) | achar e substituir em qualquer arquivo da pasta | 07 |
| [10 — Terminal integrado](10-integrated-terminal/README.md) | um terminal na pasta aberta, desligado por padrão | 06 |
| [11 — Configuração do Claude](11-claude-settings/README.md) | ver e mudar modelos, padrões, MCPs, skills e a configuração de projeto numa tela própria | 06, 07, 08 |
| [12 — Auditoria explicada](12-audit-explained/README.md) | ler cada invocação inteira — pedido, decisão, desfecho — com ajuda | 06 |
| [13 — Gestão de regras](13-rules-management/README.md) | criar, testar, simular, ajustar e revogar regras numa tela própria | 06 |
| [14 — Uso e custo](14-usage-and-cost/README.md) | saber quanto se gasta, onde e com o quê, com orçamento | 06 |
| [15 — Dispositivos](15-devices/README.md) | gerir os aparelhos que respondem permissão | 06 |
| [16 — Logs e diagnóstico](16-logs-and-diagnostics/README.md) | ler os logs por `traceId` e ver a saúde da instalação | 06 |
| [17 — Distribuição](17-distribution/README.md) | instalar e atualizar na máquina de quem usa | 05…16 |

---

## Decisões em aberto que bloqueiam plano

Decisão em aberto não impede planejar; impede **começar a fase** que depende dela. Cada uma
está registrada no risco do seu plano.

**Nenhuma decisão trava plano hoje.** As cinco que travavam foram decididas pelo usuário em
2026-09-26: o provedor OIDC (Keycloak próprio — 05 · D-05), a exposição e o certificado (da
infraestrutura — 17 · D-04, D-05), os sistemas operacionais (os três, teste só em Linux — 17 · D-01),
o workbench em React (06 · D-01) e o terminal com as travas (10 · D-01). O que trava os planos 06 a
16 agora não é decisão, é ordem: eles esperam o 05 fechar ([06 · D-02](06-workbench/decisions.md)).

Este é o recorte do que **trava** trabalho. A lista inteira, por fase e com o gap de
cada uma, vive no `decisions.md` de cada plano — e o contador de decisões do painel sai de lá.

O plano 01 saiu desta tabela em 2026-09-19: a [D-11](01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto)
foi medida, a resposta foi a ruim — em diretório confiado o `canUseTool` **não é chamado** — e a
mitigação está entregue e provada pela porta do usuário (S-98).

### Duas escolhas que o plano 01 deixou, e que não travam ninguém

Cenários que ficaram fora do que ele entregou. Nenhum bloqueia um plano; os dois têm dono — e o
segundo já fechou.

O terceiro — **S-38** — foi decidido em 2026-09-19 pela
[D-17](01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é): o produto usa a
semântica HTTP que cada código já tem, `403` para falha de autorização e `404` para registro que
não existe. A regra antiga, que respondia `404` também para "existe e não é seu", foi revertida em
workspace, sessão, `attach` e ping — e a [D-05 do plano 03](03-rules-and-audit/decisions.md#d-05--de-quem-é-a-trilha),
que a herdava, foi corrigida junto.

| O quê | Por quê ficou | Quem assume |
|---|---|---|
| **S-36** — fila estourada fecha com `1013` | o fan-out já é fire-and-forget, então o loop do SDK nunca fica preso; falta o limite de fila e o código de fechamento | [05 — endurecimento](05-hardening-operations/README.md), com o resto dos limites |
| ~~**S-89, S-90** — os números da fixture gravada~~ | **fechado em 2026-09-26, no plano 04**: reescritos como o que é testável — a forma da fixture (formatada, sem diretório descartável nem o home da máquina) e a assimetria no replay. Escrevê-los achou dois defeitos: o fake perguntava ao `canUseTool` por nome de tool (4 perguntas onde o `/init` real fez 2), e as gravações carregavam o home de quem gravou | [plano 04](04-transcript-and-resume/progress.md#decisões-tomadas-durante-a-execução) |

---

## Dívida do bootstrap, e quem a assumiu

O [plano 00](00-bootstrap/progress.md#escopo-reduzido-ou-adiado) registrou o que adiou. Nada
ficou órfão:

| Dívida | Assumida por |
|---|---|
| `session.detach` fora do contrato (S-119) | [01 · B-01](01-live-session/F0-contract.md) |
| Redutor de `message.delta` por `messageId` | [01 · B-32](01-live-session/F5-web-session.md) |
| `e2e/smoke-live/` vazio | [01 · B-41](01-live-session/F6-e2e.md) |
| Tela de device, cenários de auth do mobile, teto do Gradle | [02](02-mobile-approval/progress.md) |
| `LogBuffer` sem endpoint, tela de diagnóstico, `osv-scanner` (Sonar e CI do e2e mobile adiados — 05 · D-07, D-08) | [05](05-hardening-operations/progress.md) |

---

## Histórico

Um registro por marco — plano concluído, escopo movido de um plano para outro, plano criado.
Ciclo de validação é diário do plano, e fica **lá**, não aqui.

| Data | O quê | Detalhe |
|---|---|---|
| 2026-09-26 | **Decisões bloqueantes resolvidas pelo usuário** | Keycloak próprio (05 · D-05, emenda na ADR-010); exposição e certificado são da infraestrutura (17 · D-04, D-05); Linux, macOS e Windows, teste só em Linux (17 · D-01); workbench em React (06 · D-01, ADR-014); seletor só dentro das raízes (06 · D-03); terminal com as travas (10 · D-01, ADR-017); e os planos 06–16 esperam o 05 fechar (06 · D-02). A arquitetura ganhou a seção "Onde o produto roda, e como é alcançado" |
| 2026-09-26 | **Planos 06 a 16 criados** | o cliente no molde do VS Code, a partir da recusa da web pelo usuário: workbench por aba de pasta, arquivos, painel do Claude, busca, terminal, e uma tela por assunto (configuração do Claude, trilha, regras, uso e custo, dispositivos, logs). Inteligência de linguagem e depuração chegaram a ser planejadas e saíram no mesmo dia, antes de publicadas — por isso a numeração foi refeita sem buraco; git fora. O planejamento achou cinco defeitos no que está entregue (ver "Onde o projeto está"). `pnpm plan new` corrigido: punha a linha do plano novo na tabela errada do progresso geral |
| 2026-09-26 | **Plano 04 concluído — F5** | o ciclo pela porta do usuário: S-46…S-51 e S-53 no Playwright (e2e 45/45), S-48 também no `integration_test` do app, e S-52 no `smoke-live` contra o Claude real (`pnpm test:e2e:live` 2/2). O backend roteirizado grava o que reproduz e escreve os `Write` no `cwd`. Corrigidos no caminho: o primeiro `session.attach` dos dois clientes passou a mandar `resumeFromSeq: 0` (S-88), e `CLAUDE_CONFIG_DIR` vazio deixou de chegar ao CLI. `pnpm verify:full` 0; `pnpm test:e2e:mobile` 9/9 |
| 2026-09-26 | **Plano 04, F3 e F4 concluídas; escopo movido para o plano 05** | F3: menu vindo de `supportedCommands()` por `GET /sessions/:id/commands`, filtro por metadado no backend, cache por versão do CLI e workspace, comando inexistente recusado com `INVALID_INPUT`, `/init` pelo fluxo normal. Fechou também a dívida S-89/S-90 do plano 01. F4: desfazer nosso — prévia por `GET /sessions/:id/checkpoints`, `session.rewindFiles`/`session.rewound` nas três pontas, alteração manual preservada, sem link, atômico, auditado antes do disco, alcance pela conversa (migration `0013`) e purga em job. `pnpm verify:full` 0. Movidos para o [plano 05](05-hardening-operations/progress.md#dívida-herdada-do-plano-04): prompt durante um desfazer, e o prazo no cliente para uma retomada sem resposta |
| 2026-09-25 | **Plano 04, F1 e F2 concluídas** | histórico nas duas pontas e a recarga do `gap`; retomada in-place (nossa), por fork (externa) e por `attach` (viva), auditada antes do subprocesso (migration `0012`). `pnpm verify:full` 0 |
| 2026-09-25 | **Plano 04, F0 concluída** | o histórico lido só pelas funções do SDK, cercado pela allowlist, paginado pela cauda com cursor estável, e a procedência gravada antes do subprocesso (migration `0011`) |
| 2026-09-24 | **Plano 03 concluído — F3 e F4** | F3: retenção de 90 dias (2160 h), purga que se registra na mesma instrução, job e `pnpm db purge`. F4: o ciclo da regra pela porta do usuário, S-41…S-46 e S-92, no Playwright e — S-44, S-46 — no `integration_test` do app. Corrigidos no caminho: revogação simultânea registrada duas vezes, filtro da trilha perdido no login, e a frase do app para resolução por regra. `pnpm verify:full` 0 (e2e 36/36); `pnpm test:e2e:mobile` 8/8 |
| 2026-09-24 | **Plano 03, F2 concluída** | a trilha é consultável: filtro, paginação por cursor estável sob escrita concorrente, índices verificados por plano de execução, e a tela `/audit`. O veredito e o `traceId` nascem com a entrada (D-15, D-16, migration `0009`); da entrada auto-resolvida se abre a regra, inclusive revogada (D-18). `pnpm verify:full` 0. E2E da trilha segue na F4; a trilha no app não tem dono |
| 2026-09-24 | **Plano 03, F1 concluída** | as regras têm tela nas duas pontas, e a aprovação oferece `project`/`always` com o padrão e a validade na própria sugestão (D-12, mudança de contrato nas três pontas); escopo persistido sempre em dois passos (D-14). `pnpm verify:full` 0, com o e2e novo (S-68) revogando pelo navegador |
| 2026-09-24 | **Plano 03, F0 concluída** | a aprovação deixa de ser repetitiva: regra `project`/`always` persistida, com validade e teto, resolvendo antes de notificar e publicando `permission.resolved` com `auto: true`; revogar vale na próxima invocação da sessão já de pé; `deny` sempre vence. [D-09](03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade): **não** se devolve `updatedPermissions` ao SDK. Telas de regra são a F1 |
| 2026-09-24 | **Plano 02 concluído — F3 e F4** | o celular decide: card de permissão, dois passos, biometria, deep link que revalida por `GET /sessions/:id/permissions/:reqId`, extensão de prazo, logout completo e revogação que a tela explica. `pnpm verify:full` 0 (11 portões) e `pnpm test:e2e:mobile` 0 (6/6, API 35). S-54 e S-67 provados com push de verdade, numa variante opt-in (`pnpm test:e2e:mobile:push`, D-26) |
| 2026-09-23 | **Plano 02, F1 concluída** | o transporte de push da plataforma existe em `android/`: canal, serviço, notificação com `tag` e permissão do SO. O plugin de credencial só entra quando o arquivo existe, então o build sem ele segue verde. A lógica sem Android ganhou teste de JVM no portão de unit |
| 2026-09-20 | **Plano 02, F2 concluída; F1 quase** | o celular acompanha uma sessão viva: comandos completos, as três regras do stream, lista de pastas e tela de sessão com os quatro estados. A F1 fechou B-31 e B-32 — o token rotacionado se reenvia sozinho, e o app **diz** quando a notificação não vai chegar. Falta de B-13 só o transporte da plataforma, que por [D-21](02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart) mora fora do Dart. `pnpm verify:full` saiu 0 |
| 2026-09-19 | **Plano 02, F0 concluída; F1 pela metade** | um aparelho prova de onde vem: registro com `(user_id, install_id)`, aprovação a partir do navegador, revogação que fecha o socket já aberto, e a trilha `audit_events` recusando UPDATE por trigger. Do push, só o backend — **B-13, B-31 e B-32 e a F2 inteira ficaram de fora**, com motivo no [diário do plano](02-mobile-approval/progress.md#escopo-reduzido-ou-adiado). `pnpm verify:full` saiu 0 |
| 2026-09-19 | **D-17: o produto usa a semântica HTTP, não uma própria** | `403` é falha de autorização e `404` é registro inexistente. Reverteu a regra de "404 para não confirmar existência" em workspace, sessão, `attach` e ping de diagnóstico, e fechou o S-38 |
| 2026-09-19 | **Plano 01 concluído** | os onze portões verdes, `pnpm test:e2e:live` saiu 0 contra o Claude real (respondeu "pong", US$ 0,274) e `pnpm test:e2e:mobile` saiu 0 com o contrato novo. Quatro cenários ficaram de fora, todos registrados com dono |
| 2026-09-19 | **Plano 01, F5 concluída** | a sessão tem tela: `/sessions/:id` reproduz a conversa a partir do link, o comando de cada tool aparece inteiro, e a fila de permissão conta o tempo, recusa o segundo clique e some sozinha quando outro dispositivo responde. `pnpm verify` saiu 0 |
| 2026-09-19 | **Plano 01, F4 concluída** | o produto pede permissão: `canUseTool` bloqueia o loop, o prazo nega em silêncio, a decisão é auditada e o pedido pendente sobrevive a uma reconexão sem `reinitialize()`. `pnpm verify` saiu 0 |
| 2026-09-19 | **Plano 01, F1 a F3 concluídas** | o produto fala com o Claude: workspace com allowlist em arquivo, sessão viva sobre o Agent SDK, e trilha de auditoria append-only garantida por trigger. `pnpm verify:full` saiu 0 |
| 2026-09-14 | **Plano 00 concluído** | `pnpm verify:full` e `pnpm test:e2e:mobile` saíram 0; onze portões verdes |
| 2026-09-15 | Planos 01…05 e 17 criados | o roteiro do produto, do Agent SDK à distribuição |
| 2026-09-15 | `decisions.md` entrou no formato | decisão em aberto e gap passaram a ser rastreados por plano, com contador |
| 2026-09-15 | **Plano 02 sem decisão em aberto** | 16 decisões fechadas, incluindo o provedor de push (FCM direto) e o escopo em Android; só D-17 segue travada pelo plano 17 |

---

## Como atualizar

1. **Nunca edite um contador à mão.** Marque a task com ✅ no arquivo da fase e rode
   `pnpm plan progress` — ele atualiza o `progress.md` do plano **e** este arquivo.
2. Plano novo: `pnpm plan new <nome>` já o adiciona ao [índice](README.md) e a este arquivo.
3. Marco (plano concluído, escopo movido, decisão destravada): uma linha no histórico acima.
4. Decisão em aberto que passou a bloquear — ou deixou de bloquear — entra e sai da tabela de
   bloqueios **na mesma hora**; é ela que diz onde o trabalho pode começar.
