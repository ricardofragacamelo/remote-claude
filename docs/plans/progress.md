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

**Última atualização:** 2026-10-09

```
00-bootstrap             ████████████████████ 100%   ✅ concluído
01-live-session          ████████████████████ 100%   ✅ concluído
02-mobile-approval       ████████████████████ 100%   ✅ concluído
03-rules-and-audit       ████████████████████ 100%   ✅ concluído
04-transcript-and-resume ████████████████████ 100%   ✅ concluído
05-hardening-operations  ████████████████████ 100%   ✅ concluído
06-workbench             ████████████████████ 100%   ✅ concluído
07-explorer-and-editor   ████████████████████ 100%   ✅ concluído
08-claude-panel          ████████████████████ 100%   ✅ concluído
09-chat-layout           ████████████████████ 100%   ✅ concluído
10-mobile-chat-layout    ████████████████████ 100%   ✅ concluído
11-search                ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
12-integrated-terminal   ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
13-claude-settings       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
14-audit-explained       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
15-rules-management      ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
16-usage-and-cost        ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
17-devices               ██░░░░░░░░░░░░░░░░░░   9%   🔄 em andamento
18-logs-and-diagnostics  ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
19-distribution          ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
20-dev-public            █████████████████░░░  86%   🔄 em andamento
21-rich-previews         ████████████████████ 100%   ✅ concluído
22-live-history          ████████████████████ 100%   ✅ concluído
23-fluid-permissions     ████████████████████ 100%   ✅ concluído
24-structured-questions  ████████████████████ 100%   ✅ concluído
25-mobile-file-browser   ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
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
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | 5/5 | 22/22 | 77/77 | 14/14 | ✅ |
| [06 — Workbench](06-workbench/README.md) | 7/7 | 40/40 | 210/210 | 33/33 | ✅ |
| [07 — Explorer e editor](07-explorer-and-editor/README.md) | 9/9 | 61/61 | 360/360 | 26/26 | ✅ |
| [08 — Painel do Claude](08-claude-panel/README.md) | 7/7 | 58/58 | 275/275 | 25/25 | ✅ |
| [09 — Layout do chat](09-chat-layout/README.md) | 6/6 | 32/32 | 92/92 | 19/19 | ✅ |
| [10 — Layout do chat no app](10-mobile-chat-layout/README.md) | 11/11 | 48/48 | 177/178 | 30/31 | ✅ |
| [11 — Busca](11-search/README.md) | 0/4 | 0/25 | 0/174 | 8/8 | 🔲 |
| [12 — Terminal integrado](12-integrated-terminal/README.md) | 0/4 | 0/26 | 2/175 | 13/13 | 🔄 |
| [13 — Configuração do Claude](13-claude-settings/README.md) | 0/5 | 0/47 | 0/213 | 22/22 | 🔲 |
| [14 — Auditoria explicada](14-audit-explained/README.md) | 0/5 | 0/38 | 0/151 | 0/14 | 🔲 |
| [15 — Gestão de regras](15-rules-management/README.md) | 0/5 | 0/36 | 8/223 | 1/19 | 🔄 |
| [16 — Uso e custo](16-usage-and-cost/README.md) | 0/5 | 0/33 | 0/123 | 0/15 | 🔲 |
| [17 — Dispositivos](17-devices/README.md) | 1/5 | 3/32 | 13/132 | 4/16 | 🔄 |
| [18 — Logs e diagnóstico](18-logs-and-diagnostics/README.md) | 0/5 | 0/34 | 0/116 | 2/16 | 🔲 |
| [19 — Distribuição](19-distribution/README.md) | 0/4 | 0/19 | 0/38 | 3/8 | 🔲 |
| [20 — Dev public](20-dev-public/README.md) | 0/1 | 6/7 | 38/41 | 8/8 | 🔄 |
| [21 — Rich previews](21-rich-previews/README.md) | 5/5 | 23/23 | 74/74 | 17/17 | ✅ |
| [22 — Histórico ao vivo](22-live-history/README.md) | 8/8 | 37/37 | 130/130 | 18/18 | ✅ |
| [23 — Permissões fluidas](23-fluid-permissions/README.md) | 6/6 | 19/19 | 100/100 | 14/14 | ✅ |
| [24 — Perguntas estruturadas](24-structured-questions/README.md) | 7/7 | 25/25 | 110/111 | 39/39 | ✅ |
| [25 — Navegador de arquivos no app](25-mobile-file-browser/README.md) | 0/8 | 0/32 | 0/153 | 18/24 | 🔲 |
| **Total** | **103/153** | **555/875** | **2160/3642** | **390/477** | 🔄 |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

---

## Onde o projeto está

**Em 2026-10-05, onze planos estão concluídos — 00 a 10.** O produto (00…05), o cliente no molde do
VS Code (06…09) e o app no mesmo molde (10): conversar com o Claude da máquina pelo navegador e pelo
celular, com toda tool auditada e aprovável, regras, histórico e retomada, pastas em abas, explorer e
editor, o painel do Claude como o plugin do VS Code e o app que abre pastas e sessões como o web.

Em andamento: o [17](17-devices/README.md) (a F3 — o celular fica sabendo que foi aprovado — está
feita), o [20](20-dev-public/README.md) (a F0 espera a verificação à mão da B-06), o
[21](21-rich-previews/README.md) (a B-03 entrou antes do plano), e o [12](12-integrated-terminal/README.md)
e o [15](15-rules-management/README.md), que têm cenários escritos e nenhuma tarefa. Não iniciados: 11,
13, 14, 16, 18, 19, o [22](22-live-history/README.md), criado em 2026-10-04, e o
[23](23-fluid-permissions/README.md), criado em 2026-10-07, o [24](24-structured-questions/README.md), criado em 2026-10-08, e o [25](25-mobile-file-browser/README.md), criado no mesmo dia. Cada marco está no
[histórico](#histórico); os parágrafos abaixo são o relato de quando cada um dos primeiros planos fechou.

Em 2026-09-30 o [plano 06](06-workbench/README.md) fechou, e em 2026-10-01 o
[07](07-explorer-and-editor/README.md): pastas em abas, o explorer e o editor que não perdem trabalho
quando o Claude escreve junto. Em 2026-10-02 fechou o [08](08-claude-panel/README.md), o painel do
Claude ao lado do editor; o usuário reprovou a disposição dele, e o [09](09-chat-layout/README.md) a
refez no molde do plugin do VS Code — fechado em 2026-10-03. O [10](10-mobile-chat-layout/README.md)
pôs o app no mesmo molde, ganhou no caminho o endereço de conexão, a instalação por USB e as pastas e
sessões do web, e fechou em 2026-10-05 com o e2e no emulador, que achou e corrigiu cinco defeitos do app.

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

Em 2026-09-28 o [plano 05](05-hardening-operations/README.md) **fechou**: o sistema aguenta ficar
ligado — limite derivado da RAM, sessão ociosa encerrada, sem subprocesso órfão, rate limit
anunciado, Keycloak próprio como configuração, `osv-scanner` e complexidade nos portões — e a F4
provou tudo isso pela porta do usuário, nas duas pontas. Com ele fechado, os planos 06 a 18 podem
começar.

Em 2026-09-26, com o produto de pé pela primeira vez, **o usuário rejeitou a web como estava**: uma
coluna de cartões, a sessão aberta numa pasta de rascunho em vez do projeto, e as telas de trilha e de
regras sem detalhe, sem ajuda e sem explicar o que aconteceu. O pedido foi um **cliente do Claude no
molde do VS Code**, com o foco em abrir, criar, operar e editar arquivos; cada pasta numa aba com o
explorer, o editor e o chat lado a lado; e **uma tela para cada assunto**, completa e com ajuda. Daí
nasceram os planos **06 a 18** — sem inteligência de linguagem, sem depuração e sem git, por decisão
do usuário. Eles começam depois que o 05 fechar, e não dependem do 19
([06 · D-02](06-workbench/decisions.md)).

Planejá-los leu o código com atenção nova e achou **cinco defeitos no que já está entregue**, todos
registrados como task. Os dois mais graves foram **corrigidos em 2026-09-26**, antes dos planos, a
pedido do usuário — validados pelos portões 1–6 e pela cobertura do backend; os portões 8–11 e o
`smoke-live` não rodaram, também por decisão dele:

| Defeito | Onde | Quem corrige |
|---|---|---|
| o subprocesso do Claude herda o `process.env` inteiro do backend — um `Bash` com `env` mostra a senha do banco e a do admin do Keycloak | `adapter/outbound/claude/process-marker.ts` | **corrigido** — [12 · B-13](12-integrated-terminal/F1-pty.md) antecipada (🔄: falta o `smoke-live`) |
| a regra por prefixo casa comando encadeado: `allow Bash(git status:*)` libera `git status && curl … \| sh` | `domain/permission/services/rule-pattern.ts` | **corrigido** — casamento da [15 · B-08](15-rules-management/F1-rules-backend.md) antecipado; junto, o classificador de risco passou a separar no `&` simples |
| `POST /permission-rules` aceita `projectPath` fora da allowlist e de outro dono | `adapter/inbound/http/permission-rules` | [16 · F1](15-rules-management/F1-rules-backend.md) |
| o upsert do repositório de dispositivos regrava `status`, e uma revogação concorrente pode ser desfeita | `DrizzleDeviceRepository.save()` | [17 · B-05](17-devices/F1-devices-backend.md) |
| `turn.completed.costUsd` publica o acumulado da sessão, não o custo do turno | `sdk-message.mapper.ts` | [16 · B-07](16-usage-and-cost/F1-usage-backend.md) |

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
anterior; os 06 a 18 são o cliente no molde do VS Code, e dizem de quais outros dependem; o 19
empacota o que todos eles entregam, e por isso é o último:

| Plano | Entrega a capacidade de… | Depende de |
|---|---|---|
| [00 — Bootstrap](00-bootstrap/README.md) | o trilho: autenticação, contrato WS, as quatro camadas do backend, o banco, o web e o app atravessados por um walking skeleton, e os onze portões | — |
| [01 — Sessão viva](01-live-session/README.md) | conversar com o Claude, com toda tool auditada e aprovável pela web | 00 |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | decidir de longe, com device aprovado e push | 01 |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | não repetir a mesma aprovação, e consultar o que foi executado | 01, 02 |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | continuar o que começou antes, inclusive no VSCode | 01 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | ficar ligado sem vazar recurso nem credencial | 01…04 |
| [06 — Workbench](06-workbench/README.md) | abrir uma pasta da máquina numa aba de workbench, várias ao mesmo tempo, e chegar a cada tela pela navegação global | 05 |
| [07 — Explorer e editor](07-explorer-and-editor/README.md) | navegar, criar, operar e editar arquivos sem perder trabalho quando o Claude escreve junto | 06 |
| [08 — Painel do Claude](08-claude-panel/README.md) | conversar com o Claude ao lado do editor, com as sessões da pasta, diffs e o contexto escolhido por `@`, arrasto e `/` | 07 |
| [09 — Layout do chat](09-chat-layout/README.md) | conversar com o Claude como no plugin do VS Code: só a conversa rola, o composer sempre à vista, o processamento, a permissão e o plano inline, e os controles na barra da caixa | 08 |
| [10 — Layout do chat no app](10-mobile-chat-layout/README.md) | conversar com o Claude pelo celular no mesmo molde: a conversa na ordem real, o composer acima do teclado com modo, modelo e esforço, o thinking, o processamento, a permissão e o plano inline, a fila e as ações da mensagem | 09 |
| [11 — Busca](11-search/README.md) | achar e substituir em qualquer arquivo da pasta | 07 |
| [12 — Terminal integrado](12-integrated-terminal/README.md) | um terminal na pasta aberta, desligado por padrão | 06 |
| [13 — Configuração do Claude](13-claude-settings/README.md) | ver e mudar modelos, padrões, MCPs, skills e a configuração de projeto numa tela própria | 06, 07, 08 |
| [14 — Auditoria explicada](14-audit-explained/README.md) | ler cada invocação inteira — pedido, decisão, desfecho — com ajuda | 06 |
| [15 — Gestão de regras](15-rules-management/README.md) | criar, testar, simular, ajustar e revogar regras numa tela própria | 06 |
| [16 — Uso e custo](16-usage-and-cost/README.md) | saber quanto se gasta, onde e com o quê, com orçamento | 06 |
| [17 — Dispositivos](17-devices/README.md) | gerir os aparelhos que respondem permissão | 06 |
| [18 — Logs e diagnóstico](18-logs-and-diagnostics/README.md) | ler os logs por `traceId` e ver a saúde da instalação | 06 |
| [19 — Distribuição](19-distribution/README.md) | instalar e atualizar na máquina de quem usa | 05…17 |
| [20 — Dev public](20-dev-public/README.md) | abrir o `pnpm dev` atrás de um túnel HTTPS, num domínio só, e usar o web e o app de fora desta máquina | 05 |
| [21 — Rich previews](21-rich-previews/README.md) | ler PDF como num leitor de verdade, e markdown com tabelas largas e diagramas `mermaid` | 07 |
| [22 — Histórico ao vivo](22-live-history/README.md) | ver ao vivo, no web e no app, a conversa conduzida em outro cliente, como o Claude Code a mostra | 04 |
| [23 — Permissões fluidas](23-fluid-permissions/README.md) | parar de responder a mesma pergunta: Permitir tudo no chip da sessão, e regras que alcançam mais do que o comando exato | 03, 09, 10 |
| [24 — Perguntas estruturadas](24-structured-questions/README.md) | responder, no web e no app, as perguntas que o Claude faz com `AskUserQuestion` — escolha única, múltipla e "Outro" —, e o Claude receber as respostas | 03, 09, 10, 22, 23 |
| [25 — Navegador de arquivos no app](25-mobile-file-browser/README.md) | navegar pela pasta aberta pelo app, também de dentro de uma sessão, e ler os arquivos sem editar — texto com quebra ligável, markdown com diagramas `mermaid`, PDF e imagem, com zoom —, e baixá-los, sem enviar | 07, 10, 22 |

---

## Decisões em aberto que bloqueiam plano

Decisão em aberto não impede planejar; impede **começar a fase** que depende dela. Cada uma
está registrada no risco do seu plano.

**Em 2026-09-26, nenhuma decisão travava plano:** as cinco que travavam foram decididas pelo usuário em
2026-09-26: o provedor OIDC (Keycloak próprio — 05 · D-05), a exposição e o certificado (da
infraestrutura — 19 · D-04, D-05), os sistemas operacionais (os três, teste só em Linux — 19 · D-01),
o workbench em React (06 · D-01) e o terminal com as travas (12 · D-01). O que trava os planos 06 a
18 agora não é decisão, é ordem: eles esperam o 05 fechar ([06 · D-02](06-workbench/decisions.md)).

O que está em aberto **hoje** é a tabela gerada abaixo — uma linha por plano com decisão 🔲, tirada do
`decisions.md` de cada um pelo `pnpm plan progress`. Decisão em aberto trava a fase que ela diz bloquear
(coluna **Bloqueia** do `decisions.md`): é o que falta responder antes de essa fase começar.

<!-- open-decisions:start -->
| Plano | Em aberto | Quantas |
|---|---|---|
| [10-mobile-chat-layout](10-mobile-chat-layout/decisions.md) | D-19 | 1 |
| [14-audit-explained](14-audit-explained/decisions.md) | D-01…D-14 | 14 |
| [15-rules-management](15-rules-management/decisions.md) | D-01…D-06, D-08…D-19 | 18 |
| [16-usage-and-cost](16-usage-and-cost/decisions.md) | D-01…D-15 | 15 |
| [17-devices](17-devices/decisions.md) | D-01…D-12 | 12 |
| [18-logs-and-diagnostics](18-logs-and-diagnostics/decisions.md) | D-02…D-10, D-12…D-16 | 14 |
| [19-distribution](19-distribution/decisions.md) | D-02, D-03, D-06…D-08 | 5 |
| [25-mobile-file-browser](25-mobile-file-browser/decisions.md) | D-02, D-06, D-09, D-10, D-20, D-22 | 6 |
<!-- open-decisions:end -->

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
| 2026-10-09 | **Plano 21 — Rich previews concluído** (F0…F4) | 23/23 tarefas e 74 de 74 cenários. A prévia de PDF virou o leitor do pdf.js: rolagem corrida, zoom e ajustes (também por `Ctrl+=`/`-`/`0` e `Ctrl`+roda), texto selecionável, links pela regra do `Markdown`, PDF com senha só em memória, painel com índice e miniaturas, busca com `Ctrl+F` no leitor, e a posição lembrada por aba. O `Markdown` — prévia, resposta do Claude e plano para aprovar — desenha tabela larga numa caixa que rola e bloco `mermaid` fechado como SVG sanitizado em três camadas ([ADR-020](../architecture/shared/00-decisions.md#adr-020--diagrama-mermaid-é-svg-inline-sanitizado-em-três-camadas)). `pnpm verify:full` com os onze portões verdes; o app Flutter não é tocado pelo plano, e o `test:e2e:mobile` não foi rodado |
| 2026-10-08 | **Plano 24 — Perguntas estruturadas concluído** (F0…F6) | 25/25 tarefas e 110 de 111 cenários. O `AskUserQuestion` deixou de ser uma permissão genérica com o JSON: o backend normaliza a pergunta (`interaction`), valida e entrega as respostas por id ao SDK, com prazo próprio, push e trilha; o web e o app respondem por um card feito para isso — escolha única, múltipla e "Outro", em passos no app, "Não responder" com motivo —, e a linha da tool mostra o que foi respondido, ao vivo e ao reabrir o histórico (também no seguidor do plano 22). `pnpm verify:full` com os onze portões verdes; `pnpm test:e2e:mobile` 34/35: o 05·S-79 (a renovação recusada no meio de um turno escapando como erro não tratado) falha nas corridas completas sem instrumentação e passa com qualquer sonda — a causa não foi achada em cinco ciclos, e o usuário decidiu fechar e abri-lo como pendência própria ([D-39](24-structured-questions/decisions.md#f6--e2e)) |
| 2026-10-08 | **Plano 22 — Histórico ao vivo concluído** (F0…F7) | 37/37 tarefas e 130 cenários. O leitor do web e do app acompanha, ao vivo, a conversa conduzida em outro cliente (assinatura `transcript.follow` com sondagem compartilhada no backend, "N novas", "trabalhando em outro cliente…", reset na cadeia reescrita) e a mostra como o Claude Code: pensamento rotulado e "até N s", autor por turno, título e IN/OUT da ferramenta com a saída completa sob demanda, imagem do prompt. `pnpm verify:full` com os onze portões verdes (e2e do web incluído) e `pnpm test:e2e:mobile` 32/32. No caminho, três defeitos fora do plano, corrigidos com teste: a corrida de duas respostas ao mesmo pedido de permissão e a janela da `PermissionBridge` (plano 23), o `<pre>` de saída sem alcance pelo teclado (F5), e a recusa de renovação que escapava pelo `DeviceController` do app (05·S-79, exposta pelo card do plano 23); e o par `@modelcontextprotocol/sdk` do Agent SDK passou a ser declarado pelo backend (GHSA-6qxp-vccf-f47h) |
| 2026-10-08 | **Plano 25 — Navegador de arquivos no app criado** | a partir da [discovery](../discovery/07-navegador-de-arquivos-no-app.md), por pedido do usuário: o app mostrava a conversa, mas não os arquivos que ela produz. O plano dá ao app um painel de arquivos à direita e um leitor somente leitura (texto, markdown com `mermaid`, PDF, imagem, com zoom) e o download pelo "salvar como" do sistema, sem tocar no web; no backend, só um guard: a pasta é lida só por aparelho aprovado (D-12, pelo usuário). Começa por um spike que escolhe os motores com medida, e conserta antes a sessão que deixava de notificar sob uma tela empilhada (o histórico já tinha o problema) |
| 2026-10-08 | **Plano 24 — Perguntas estruturadas criado** | a partir da [proposta](../discovery/05-perguntas-estruturadas.md), por pedido do usuário: o `AskUserQuestion` aparecia como permissão genérica, com o JSON, e qualquer resposta deixava o Claude com "The user did not answer the questions." O plano normaliza a pergunta no backend (`interaction`), responde por id, valida antes do SDK, e tira as perguntas do alcance das regras de allow — que o alcance "a tool inteira" do plano 23 deixava gravar com um toque |
| 2026-10-07 | **Plano 23 — Permissões fluidas concluído** (19/19 tarefas, 100/100 cenários) | Permitir tudo no chip da sessão, no web e no app, e o alcance das regras (prefixo, linha composta, tool inteira). Unitários, integração e os e2e do web e do app verdes; o `pnpm verify:full` da árvore ainda reprova por trabalho em andamento do plano 22 (`contracts-guards.spec.mjs`, `.env.example`, `failure_messages.dart`) — ver o [diário do plano](23-fluid-permissions/progress.md) |
| 2026-10-07 | **Plano 23 — Permissões fluidas criado** | por pedido do usuário: web e mobile perguntavam o tempo todo, apesar das aprovações e regras. As 11 regras gravadas eram a linha exata e nunca voltaram a casar. O plano traz o modo Permitir tudo no chip da sessão (um modo nosso, o SDK continua em `default`, [ADR-022](../architecture/shared/00-decisions.md)) e o alcance das regras (prefixo, linha composta, tool inteira) |
| 2026-10-05 | **Plano 10 — Layout do chat no app concluído** (F10, o e2e) | 48/48 tarefas e 177 de 178 cenários — a S-140, o APK num celular de verdade pelo cabo, é verificação manual que fica com o usuário; `pnpm test:e2e:mobile` 28/28 em duas rodadas seguidas e `pnpm verify:full` verde. Três suítes novas no emulador: o endereço de conexão (com a troca para outra origem da mesma stack, que a stack do e2e passou a aceitar), as pastas e sessões com o navegador como segundo cliente, e o layout do chat em 360×640 com teclado, em 200 % e nas diretrizes de acessibilidade. O e2e achou e a F10 corrigiu cinco defeitos do app — o `ApiClient` refeito no meio de um build depois de trocar de endereço, o replay perdido da sessão aberta pelo próprio app (sem pasta, modelo, modo e às vezes o primeiro prompt), a pílula que media um card descartado, o chip do modo espremido na barra e o "Encerrar" que tirava a tela da sessão — e dois de acessibilidade. Duas decisões do agente esperam o usuário: D-30 e D-31 |
| 2026-10-04 | **Plano 22 — Histórico ao vivo criado** | a partir da [proposta](../discovery/04-historico-ao-vivo-e-fiel.md): tudo o que o Claude Code mostra de uma conversa chega ao vivo ao web e ao app, mesmo conduzida em outro cliente, e como ele mostra. 8 fases, 37 tarefas, 130 cenários e 17 decisões, respondidas na criação |
| 2026-10-04 | **Plano 10 ganhou as pastas e sessões do web (F7…F9) e a instalação por USB (F6); o E2E voltou a ser a última fase (F10)** | por pedido do usuário: várias pastas abertas (as mesmas abas do web), a tela da pasta e várias sessões com um painel que troca entre elas; e `pnpm mobile:install`, o APK de debug no celular do cabo com os endereços da rede e do `pnpm dev:public`. As fases entraram antes do E2E, que foi renumerado para o fim; F6…F9 concluídas na mesma data |
| 2026-10-04 | **Plano 17 — a F3 concluída: o celular fica sabendo que foi aprovado** | o push `deviceApproved` e o app que se atualiza ao ser aprovado, por pedido do usuário (ele aprovou o celular no navegador, e o celular não ficou sabendo); a fase entrou antes do E2E, que passou a ser a F4 |
| 2026-10-03 | **Plano 21 — Rich previews criado** | o PDF como num leitor de verdade e o markdown com tabelas largas e diagramas `mermaid`, em todo lugar onde markdown aparece. 5 fases, 23 tarefas, 74 cenários e 15 decisões respondidas pelo usuário; a B-03 (o desenho cancelado) entrou antes do plano, ao investigar o defeito |
| 2026-10-02 | **Plano 20 — Dev public criado** | `pnpm dev:public`: a stack do `pnpm dev` atrás de um túnel HTTPS, num domínio só, para usar o web — e depois o app — de fora desta máquina. A F0 ficou com a B-06, a verificação à mão, pendente |
| 2026-10-03 | **Plano 10 ganhou a F5 — Endereço de conexão; o e2e passou a ser a F6** | por pedido do usuário: a tela do app com três radios (interno, externo e outro, com campo de texto), a escolha guardada no aparelho para não se perder. Do endereço, uma origem só, saem API, WS e login; só `https` fora do `localhost`; o encaminhamento do plano 20 passa a valer no modo local, e o backend passa a aceitar uma lista explícita de issuers (D-15, condicionada ao spike da B-25; se ele reprovar, a decisão volta ao usuário). O e2e da F6 prova o layout e o endereço juntos. 6 tarefas, 29 cenários, 8 decisões |
| 2026-10-03 | **Plano 10: as 8 decisões em aberto respondidas pelo usuário** | todas seguem a recomendação, e nenhuma muda tarefa ou cenário: o plano começa agora que o 09 fechou (D-03), um mapa declarado prova que os textos comuns são iguais no web e no app (D-04), o rascunho no toque na pasta (D-05), a regra de barra do 09 medida em 360 dp (D-06), `/` abre a folha de comandos (D-07), id e custo na folha do status (D-08), pressionar e segurar para as ações da mensagem (D-09) e o push da sessão na tela suprimido (D-10, que fechou o gap: em primeiro plano quem notifica é o nativo) |
| 2026-10-03 | **Plano 09 — Layout do chat concluído** (F4, inline; F5, e2e) | 32/32 tarefas e 92 cenários; `verify:full` com os onze portões verdes (e2e 122/122), e o `chat-layout.spec` duas vezes seguidas, 36/36. Inline: o indicador do turno na cauda, o thinking vivo, a permissão e o plano no lugar da tool (ou na cauda até a linha chegar), a linha da decisão, a pílula e o comando `Mod+Alt+P`, a lista de tarefas sobre a caixa, editar, bifurcar e desfazer pela mensagem. Achados: a norma do 03 de foco no negar nunca tinha sido implementada no web; a resposta atrasada não era vigiada (o `respond` passou a devolver o id do frame). A 360×400 o card se responde com o teclado fechado (ver o progresso do plano). O contrato não mudou: o plano 10 começa sem `test:e2e:mobile` pendente deste |
| 2026-10-02 | **Plano 08 — Painel do Claude concluído** (F6, o e2e) | 58/58 tarefas e 275 cenários; `verify:full` com os onze portões verdes (e2e 102/102), `test:e2e:mobile` 15/15 e `test:e2e:live` 3/3. O e2e achou e a F6 corrigiu: o prompt que não aparecia na conversa (o backend passou a dizê-lo, como o contrato já previa), o modo depois de aprovar o plano, o `session.started` atrasado da sessão nascida no rascunho, a rolagem lateral num telefone e o diff que rola sem foco; o `smoke-live` achou a variante `command_lifecycle` que o `uuid` do prompt trouxe. O plano 09 (layout do chat), que esperava a F6, pode começar ([09 · D-01](09-chat-layout/decisions.md#f0--normas)) |
| 2026-10-02 | **Plano 10 — Layout do chat no app criado; os planos 10…19 passaram a 11…20** | o app sai do plano 09 e ganha o seu, com paridade com o painel web (10 · D-01). A renumeração foi feita pelo `pnpm plan new --at 10`, novo nesta data: pastas, títulos, links, âncoras e referências explícitas em docs e comentários de código. As referências soltas ("o 18 empacota"), que a renumeração anterior não tinha tocado, foram revisadas uma a uma pelo sentido |
| 2026-10-02 | **Plano 09: as 16 decisões em aberto respondidas pelo usuário** | treze seguem a recomendação: caixa até 40 % com menu de excesso, enviar/parar híbrido, motivo na tela só para bloqueio real, menu "Commands" sai, alternar modo pela palette, encerrar com diálogo, custo no tooltip e na status bar, permissão na linha da tool, foco que respeita a caixa, tarefas sobre a caixa, desfazer na mensagem e no `⋯`, verbos sorteados, e o app fora do plano (D-03, que virou o plano 10). **Três mudam o plano:** o 09 roda depois da F6 do 08 (D-01), o contrato pode mudar (D-02), e a caixa da sessão encerrada fica ativa e retoma no Enter (D-05). O plano foi revisado para as três na mesma data, e a B-11 ganhou o esforço só no rascunho (08 · D-16) |
| 2026-10-02 | **Plano 09 — Layout do chat criado; os planos 09…18 passaram a 10…19** (hoje 11…20, depois que o 10 entrou) | o usuário reprovou a disposição do painel do 08 e pediu o molde do plugin do VS Code: só a conversa rola, o composer sempre à vista, thinking, processamento e permissão inline, os controles na barra da caixa. O plano entra logo depois do 08; pastas, títulos, links, âncoras e referências dos planos seguintes foram renumerados na mesma data, e as referências deste histórico já usam os números novos. 6 fases, 32 tarefas, 86 cenários e 16 decisões em aberto, com recomendação |
| 2026-10-01 | **Plano 07 concluído — F6, F7 e F8** | o núcleo pela porta do usuário (F6: abrir, editar, salvar no disco, criar de modelo, renomear, apagar, o Claude roteirizado no mesmo arquivo — conflito, comparar, sobrescrever, e o desfazer do turno preservando a edição humana —, abas de pasta, grupos, celular, axe), prévias e transferência (F7: `raw` com `Range` e cabeçalhos da D-18, zip em stream, upload `multipart` em stream com manifesto e `207`, markdown seguro em `shared/` para o plano 08 reusar, imagem e PDF por blob, hexadecimal e texto paginados, upload e download na web) e o histórico local (F8: tabela `file_history_entries` + blobs por hash, purga sob advisory lock, guardar antes de salvar, apagar, restaurar e substituir por upload, restaurar com `If-Match`, apagar com **Desfazer**, Linha do tempo). O e2e achou dois defeitos de acessibilidade — o menu de contexto modal do Radix e o contraste do `vs-dark` —, corrigidos com teste. Executadas juntas, com o `verify:full` só no fim, por pedido do usuário. `pnpm verify:full` 0 (11 portões, e2e 86/86) e `pnpm test:e2e:mobile` 15/15. Escopo reduzido declarado no [diário](07-explorer-and-editor/progress.md#escopo-reduzido-ou-adiado) (pasta vazia no upload, download em stream, cancelar um arquivo do lote). Os planos 08 e 11 podem começar |
| 2026-09-30 | **Plano 06 concluído — F6** | o workbench provado pela porta do usuário: abrir pasta das raízes até a URL com o caminho real, a sessão da aba na pasta dela (o Claude roteirizado, da gravação nova `cwd-turn`, diz o diretório), abas que sobrevivem à recarga, menu Arquivo, paleta, notificação da pasta que sai da allowlist, celular a 360 px e axe nos dois temas. O e2e achou dois defeitos da F3/F4 — toda recarga apagava o layout guardado das abas, e o primeiro `Esc` no centro de notificações fechava só um tooltip —, corrigidos com teste. `pnpm verify:full` 0 (11 portões). Depois dele, e **sem novo `verify:full`** (decisão do usuário ao encerrar): o log de I/O passou a dizer o status real de uma recusa, e o runner do e2e deixou de bloquear o loop que drena o log do backend — o `smoke-live` lia um log parado no boot; validados por checagens direcionadas ([diário, ciclo 34](06-workbench/progress.md#histórico-de-validação)) |
| 2026-09-28 | **Plano 05 concluído (F4)** | os limites pela porta do usuário, nas duas pontas, sobre uma **stack de limites** própria da execução (05 · D-13): teto, ociosidade, ritmo, token que expira no meio do turno e renovação recusada. Os cenários acharam o produto travando sob limite — o iniciador do web preso em "Starting…" e o toque na pasta do app sem efeito no teto, a sessão aberta pela tela inicial tratada como de outro navegador, a primeira requisição de cada carga do web sem token, e o app que continuava "logado" com a renovação recusada — todos corrigidos com teste. O `4429` virou o estado `throttled`, com o motivo na tela. `pnpm verify:full` 0, `pnpm test:e2e:mobile` 15/15, `pnpm test:e2e:live` 2/2. Os planos 06–18 podem começar ([06 · D-02](06-workbench/decisions.md)) |
| 2026-10-01 | **Plano 08, F0, F1 e F2 concluídas** | F0: anexos do prompt, thinking, subagents, compactação, fila, fork e esforço no contrato das três pontas, códigos novos e 18 fixtures gravadas — o spike achou o `@caminho` lido pelo CLI sem `Read` nem auditoria (R-10, que a B-44 fecha) e que o esforço não muda no meio da sessão (D-16). F1: a view "Sessões do Claude" da aba de pasta — em execução aqui, ativas em outro lugar, histórico —, `GET /sessions`, atividade no histórico, subpastas, e os links de sessão e de conversa. F2: markdown seguro, código com copiar e inserir no editor, caminhos que abrem no editor, tools compactas com ANSI, thinking recolhido, subagents aninhados, aprovar plano, resumo e custo do turno, copiar e buscar, e a lista de tarefas nas duas formas do CLI (D-25, `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; o `taskId` do histórico sai do texto do resultado). `pnpm verify:full` 0 (e2e 88/88); `pnpm test:e2e:mobile` 15/15 |
| 2026-09-28 | **Plano 13: as 21 decisões em aberto respondidas pelo usuário** | vinte seguem a recomendação: store de MCP nosso com `strictMcpConfig`, segredo cifrado entregue por `setMcpServers()` e nunca pelo argv, módulo `claude-config`, fixture MCP stdio própria, padrões por usuário e por pasta, catálogo por sessão viva ou sonda efêmera, conta visível a quem tem raiz, teste de conexão com dono neste plano, esta tela dona dos padrões, apertar-vale-já, `.mcp.json` aprovado por digest, regras `mcp__` revogadas quando o programa muda, annotation só sobe risco, indicador de MCP entregue aqui, configuração de projeto lida pelo formato publicado e só leitura, criação pela escrita do 07, shell inline desligado para todas as origens se escapar da aprovação e skills de sistema por leitura tolerante. **Uma muda o plano:** plugins de marketplace entram (13 · D-15), baixados pelo backend para diretório próprio, só de marketplace declarado no arquivo da allowlist, fixados e atualizados só por decisão — nasce a B-47, com S-200…S-213 |
| 2026-09-28 | **Plano 12: as 11 decisões em aberto respondidas pelo usuário** | todas seguem a recomendação, e nenhuma muda tarefa ou cenário: step-up por `auth_time` + `max_age` (300 s, reanexar também exige, falha fechada), texto UTF-8 com fluxo no servidor, scrollback por terminal headless com uma connection por terminal, interruptor por `sub` no arquivo da allowlist, "só do web" por `azp` (o `Origin` com o 19), trilha só do ciclo de vida e nunca as teclas, `node-pty` carregado sob demanda, os limites propostos, shell integration injetada no spawn, perfis detectados + personalizados e xterm com renderizador DOM em chunk próprio. O empacotamento do `node-pty` fica como nota ao [plano 19](19-distribution/README.md) |
| 2026-09-28 | **Plano 11: as 8 decisões em aberto respondidas pelo usuário** | sete seguem a recomendação: `@vscode/ripgrep` fixado com `RC_RIPGREP_PATH`, exclusões da árvore do 07 somadas às do VS Code, o ripgrep como único motor do substituir, aplicar por arquivo como o ADR-013, tetos medidos antes de fechar a F1, cache do localizador com TTL e editor de resultados salvável como `.code-search`. **Uma muda o plano:** a busca e a prévia respondem em fluxo NDJSON desde o início (11 · D-02), sempre com uma linha final `end` ou `error`, e a ordem é montada no cliente. Isso mudou B-03, B-04, B-10, B-11 e B-13 e trouxe os S-163…S-171. O empacotamento do ripgrep virou a D-08 do [plano 19](19-distribution/decisions.md) |
| 2026-09-28 | **Plano 08: as 23 decisões em aberto respondidas pelo usuário** | todas seguem a recomendação, e nenhuma muda tarefa ou cenário: menção por referência lida pelo `Read`, imagem por upload HTTP, diff do input com o snapshot, fila de prompts no backend, subagents encaminhados, `session.setEffort`, editar e reenviar sempre por fork, link na search do workbench, rejeitar por arquivo e por trecho com `revision`, sessão que nasce no primeiro prompt, catálogo com cache e query efêmera, `@` pelo localizador do plano 11. Spikes e medidas da F0 confirmam ou acionam o desvio já decidido |
| 2026-09-28 | **Plano 07: as 20 decisões em aberto respondidas pelo usuário** | todas seguem a recomendação, e nenhuma muda tarefa ou cenário: módulo `files` por porta, trilha antes do disco com `503`, `ETag` sha256 com `If-Match` obrigatório, watch por WS com `seq` por `watchId` e sem replay, fronteira na pasta aberta, Monaco sob demanda. A D-08 (watcher) fica 🔄 até o spike B-19; os números de D-04 e D-16 são provisórios até a medida |
| 2026-09-28 | **Plano 06: as 14 decisões em aberto fechadas pelo usuário** | dez seguem a recomendação. Quatro mudam o plano: as rotas `/sessions/$id` e `/history…` saem sem deep link, e ler, continuar e desfazer conversa antiga pelo web **passa ao [plano 08](08-claude-panel/README.md)** (06 · D-07; o 08 ganhou a D-24); o histórico de notificações vai para o servidor — 30 dias, teto de 200, "lida" sincronizada — com a nova B-40 (06 · D-17); a aba inativa mantém sessões e terminais anexados, o que fecha a D-11 do 08 e a exceção do 12 (06 · D-11); a allowlist recarrega só por `SIGHUP`, e a regra "nunca watch" de backend/03 fica (06 · D-15) |
| 2026-09-26 | **Decisões bloqueantes resolvidas pelo usuário** | Keycloak próprio (05 · D-05, emenda na ADR-010); exposição e certificado são da infraestrutura (19 · D-04, D-05); Linux, macOS e Windows, teste só em Linux (19 · D-01); workbench em React (06 · D-01, ADR-014); seletor só dentro das raízes (06 · D-03); terminal com as travas (12 · D-01, ADR-017); e os planos 06–18 esperam o 05 fechar (06 · D-02). A arquitetura ganhou a seção "Onde o produto roda, e como é alcançado" |
| 2026-09-26 | **Planos 06 a 18 criados** | o cliente no molde do VS Code, a partir da recusa da web pelo usuário: workbench por aba de pasta, arquivos, painel do Claude, busca, terminal, e uma tela por assunto (configuração do Claude, trilha, regras, uso e custo, dispositivos, logs). Inteligência de linguagem e depuração chegaram a ser planejadas e saíram no mesmo dia, antes de publicadas — por isso a numeração foi refeita sem buraco; git fora. O planejamento achou cinco defeitos no que está entregue (ver "Onde o projeto está"). `pnpm plan new` corrigido: punha a linha do plano novo na tabela errada do progresso geral |
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
| 2026-09-15 | Planos 01…05 e 19 criados | o roteiro do produto, do Agent SDK à distribuição |
| 2026-09-15 | `decisions.md` entrou no formato | decisão em aberto e gap passaram a ser rastreados por plano, com contador |
| 2026-09-15 | **Plano 02 sem decisão em aberto** | 16 decisões fechadas, incluindo o provedor de push (FCM direto) e o escopo em Android; só D-17 segue travada pelo plano 19 |

---

## Como atualizar

1. **Nunca edite um contador à mão.** Marque a task com ✅ no arquivo da fase e rode
   `pnpm plan progress` — ele atualiza o `progress.md` do plano **e** este arquivo.
2. Plano novo: `pnpm plan new <nome>` já o adiciona ao [índice](README.md) e a este arquivo.
3. Marco (plano concluído, escopo movido, decisão destravada): uma linha no histórico acima.
4. Decisão em aberto que passou a bloquear — ou deixou de bloquear — entra e sai da tabela de
   bloqueios **na mesma hora**; é ela que diz onde o trabalho pode começar.
