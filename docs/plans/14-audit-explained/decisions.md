# Plano 14 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

Todas as decisões abaixo mexem numa tabela cujo desenho o [plano 03](../03-rules-and-audit/README.md)
já fechou com cuidado. A régua para cada recomendação é a mesma: **nenhuma garantia de lá afrouxa** —
append-only por trigger, piso de 2160 horas, purga por janela que se registra na mesma instrução,
leitura escopada por quem pergunta, e "nada é juntado na leitura" quando a resposta é sobre quem
autorizou ([03 · D-15](../03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)).

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde gravar o **desfecho** da invocação, e o que dele se grava | quais hooks disparam em cada desfecho e com que campos — o spike da B-01 mede; se o código de saída do `Bash` existe fora do texto do erro | B-02, B-07, B-08 | — | 🔲 |
| D-02 | A invocação como unidade é montada no backend ou agrupada no cliente | nenhum técnico — é escolha de onde a paginação fica correta | B-03, B-10 | — | 🔲 |
| D-03 | Uma linha do tempo única com `audit_events`, ou dois endpoints | se um cursor composto sobre duas sequências fica simples o bastante para testar | B-03, B-11 | — | 🔲 |
| D-04 | De onde vêm a pasta, a conversa, o turno e o título de cada invocação | quanto custa ler títulos do SDK por página de facetas; quantas entradas antigas têm `session_origins` | B-02, B-07, B-09, B-12 | — | 🔲 |
| D-05 | Como distinguir "anterior a esta versão", "em execução" e "não concluiu" numa invocação sem desfecho | nenhum técnico — é desenho | B-07, B-10 | — | 🔲 |
| D-06 | O que a trilha diz sobre **quem** e **de onde** | se a resolução pelo celular sabe o aparelho no momento de gravar; se o IP vale o dado pessoal que é | B-09, B-21 | — | 🔲 |
| D-07 | O que responde o endereço de uma invocação que a retenção removeu | se o ULID cunhado pelo domínio é confiável como momento da entrada | B-04, B-13 | — | 🔲 |

### D-01 — onde mora o desfecho

Hoje a trilha registra a **intenção** (a linha `recorded`, no `PreToolUse`) e a **decisão** (`allowed`
ou `denied`, quando houve pergunta). O que aconteceu depois — executou, falhou, foi interrompida,
quanto demorou — não é gravado em lugar nenhum: o `PostToolUse` alimenta só o `session_file_states`
do desfazer, e o `PostToolUseFailure` não está registrado (`session-runner.ts`, de propósito: falha
não muda arquivo). O SDK oferece os dois hooks
com `duration_ms` e, no de falha, `error` e `is_interrupt`; oferece também o `PermissionDenied`, que
dispara quando o próprio CLI recusa.

Opções:

- **(a) a mesma tabela, com uma decisão nova.** `audit_entries.decision` ganha `concluded`, e colunas
  anuláveis `outcome` (`succeeded` · `failed` · `interrupted` · `refused`), `duration_ms` e
  `exit_code`. O índice único `(session_id, tool_use_id, decision)` que a `0006` criou já garante
  **um** desfecho por invocação (S-12); a trigger, o piso, a purga e o registro em `audit_purges` valem
  sem uma linha nova de SQL — `audit_purges.trail` só aceita `entries` e `events`, e uma tabela nova
  exigiria mexer nele. Custo: `input` é `NOT NULL`, e repetir o input do `Write` numa terceira linha
  é peso morto — a linha de desfecho grava `'{}'` e uma `CHECK` diz que só ela pode;
- **(b) tabela própria** (`audit_outcomes`), com trigger e piso iguais. Limpa na forma, e cara: uma
  terceira tabela para a purga varrer, a `CHECK` de `audit_purges.trail` alterada, e a garantia de
  append-only escrita pela terceira vez;
- **(c) um `kind` em `audit_events`.** Não serve: evento de conta exige sujeito e rótulo, e o desfecho
  é de uma invocação — o mesmo erro que a própria `audit_events` evitou ao não alargar a outra.

O que se grava do desfecho é a outra metade da pergunta, e a resposta é curta: **status, duração e
código de saída — nunca a saída**. `tool_response` carrega o conteúdo de um arquivo lido, e o `error`
de um `Bash` que falhou carrega o `stderr` dele; nenhum dos dois entra no banco nem no log (S-10). O
código de saída é o gap: o `BashOutput` do SDK `0.3.277` tem `interrupted` e `returnCodeInterpretation`,
**não** tem campo de código, e a hipótese é que ele só exista no começo do texto do `error`
(`Exit code 1`). A B-01 mede; se for só ali, a regra é extrair o número de um prefixo exato e descartar
o texto, e cenário prova que nada além do número sobrevive.

**Recomendação:** (a) — a mesma tabela, `decision = 'concluded'` com `outcome`, `duration_ms` e
`exit_code`, input `'{}'` por `CHECK`; o `PermissionDenied` vira `outcome = 'refused'` se a B-01
mostrar que ele dispara no `deny` de projeto. Nenhuma garantia do plano 03 precisa ser reescrita, e a
pergunta "o que aconteceu com esta invocação" continua respondida por uma tabela só.

### D-02 — a invocação como unidade

A tela quer ver **uma invocação por linha** — registrada, decidida e concluída juntas. Agrupar no
cliente parece barato e quebra a paginação: a página de 50 **linhas** de `GET /audit-entries` corta
uma invocação ao meio, o grupo muda de tamanho conforme o que chegou, e filtro por desfecho ("só as
que falharam") não tem como ser feito sem trazer tudo.

**Recomendação:** no backend. A leitura pagina **invocações** (`GET /audit/timeline?types=invocations`, pela D-03), com o cursor sobre o
`seq` da âncora (a linha `recorded`, ou a mais antiga que restou quando a retenção levou parte dela —
S-30), keyset descendente como a [D-06 do plano 03](../03-rules-and-audit/decisions.md#d-06--paginar-sobre-o-tempo)
manda. `GET /audit-entries` continua existindo, igual, para quem já o chama (S-70).

### D-03 — uma linha do tempo, ou duas listas

Os fatos de conta (`device.*`, `permission.rule*`, `session.resumed/forked`, `session.filesRewound`)
nunca aparecem na tela hoje. Mostrá-los **junto** das invocações é o que faz a trilha contar uma
história: "concedeu a regra às 10:02 → às 10:15 o `pnpm test` rodou sem perguntar".

Opções:

- **(a) endpoint único** `GET /audit/timeline`, itens com `type: 'invocation' | 'event'`, e cursor
  composto `(seqDeInvocação, seqDeEvento)`: cada página toma das duas cabeças por momento, e o cursor
  guarda o menor `seq` consumido de cada lado. Nada se repete nem some, porque cada metade continua
  sendo keyset descendente da sua tabela (S-43); o que pode acontecer com relógio ajustado para trás é
  a **ordem de apresentação** entre as duas fontes inverter — declarado na ajuda (S-45);
- **(b) dois endpoints**, e o cliente intercala. Duas paginações, dois "carregar mais", e a mesma
  intercalação escrita em TypeScript, sem teste de banco.

**Recomendação:** (a). A lista só de invocações é o mesmo endpoint com `types=invocations`,
e filtro que só invocações têm (tool, decisão, desfecho, busca) tira os eventos sozinho (S-44).

### D-04 — pasta, conversa, turno e título

A entrada da trilha tem o `sessionId` **nosso** (a sessão viva), não a pasta, não a conversa do Claude,
não o turno. Juntar na leitura parece resolver com `session_origins`, e não resolve: aquela tabela
guarda **quem abriu** a conversa, e uma retomada **in-place** não escreve linha nova
([backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)) — a sessão
viva da retomada não aparece nela. O evento `session.resumed` também não carrega o `sessionId` vivo.

Opções:

- **(a) gravar com a entrada**, em colunas novas e anuláveis — `workspace_path`, `claude_session_id`,
  `prompt_id` —, preenchidas pelo runner, que sabe as três no momento do hook. É o mesmo princípio da
  D-15 do plano 03: a entrada diz o que foi, sem depender de outra tabela;
- **(b) juntar sempre na leitura**, com `session_origins` e o registro de sessões vivas. Perde as
  retomadas in-place e toda sessão encerrada antes da `0011`;
- **(c) híbrido:** (a) para as entradas novas, e (b) só como melhor esforço para as antigas, com
  "pasta não registrada" quando não houver linha (S-23).

O **título** é outra conversa: é o `summary`/`customTitle` do SDK, e o `summary` é o primeiro prompt.
Copiá-lo para o Postgres é exatamente o que o `transcript-is-never-persisted` do `lint:arch` proíbe
(plano 04, S-28). O título se **lê** do SDK, pela porta do módulo `transcript`, com o cache por
`lastModified` que ele já tem, e falta de título degrada — pasta e data continuam (S-52).

**Recomendação:** (c), com o título lido na hora e nunca gravado. A leitura de `audit` passa a ter duas
portas de saída novas — para `transcript` (título) e para `session` (sessão viva e procedência) —, e a
B-02 desenha as setas em `backend/03`.

### D-05 — o que uma invocação sem desfecho quer dizer

Uma invocação sem linha de desfecho pode ser três coisas diferentes, e a tela precisa dizer qual:

- **anterior a esta versão** — gravada antes de existir o hook de desfecho;
- **em execução** — a sessão está viva e a tool ainda roda;
- **não concluiu** — a sessão morreu (crash, reinício do backend) antes do `PostToolUse`.

Opções para a primeira: uma coluna anulável `tracks_outcome` gravada `true` nas `recorded` novas
(`NULL` = anterior — sem reescrever linha); comparar com o `seq` do primeiro registro pós-migration
guardado numa tabela de metadados; ou uma data de corte por configuração. Para as outras duas: gravar
um desfecho `abandoned` ao encerrar a sessão (não cobre o crash), ou **derivar na leitura** perguntando
ao módulo `session` se a sessão está viva.

**Recomendação:** `tracks_outcome` na linha `recorded` (a linha diz de si mesma que o desfecho era
esperado), e "em execução" × "não concluiu" derivado na leitura pela porta de sessão viva — é o único
caminho que também acerta depois de um crash, quando ninguém pôde gravar nada (S-31, S-32).

### D-06 — quem e de onde

O briefing imagina "aprovado por Fulano no celular". O código diz outra coisa:

- **não há tabela de usuários.** `resolvedBy` é o `sub` do OIDC, que não é nome; e como cada um só lê a
  própria trilha, e ninguém responde a pergunta de outra pessoa (`PERMISSION_NOT_OWNED`), quem aprovou
  é sempre **você** ou ninguém;
- **`origin` existe e está sempre vazio.** `audit_entries` tem `device_id` e `ip` desde a `0003`, e os
  dois gravadores escrevem `null`. `resolvedFrom` diz só `web` ou `mobile`, sem qual aparelho.

Opções: preencher `device_id` na linha de decisão quando a resposta veio de um celular aprovado (o
contexto do aparelho já está autenticado ali), e ligar ao histórico do aparelho do
[plano 17](../17-devices/README.md); preencher também o `ip`; ou deixar como está e dizer "pelo celular".

**Recomendação:** gravar o `device_id` da resposta vinda do celular, com o nome do aparelho lido na hora
(o aparelho pode ser renomeado; a identidade não muda). O **IP não** — é dado pessoal sem uso na tela, e
um campo que ninguém lê é um campo que vaza sem motivo. A história diz "aprovado **por você**, no
celular «Pixel 8»" — sem inventar um nome que o sistema não tem.

### D-07 — a invocação que passou dos 90 dias

Um endereço permanente vive mais que a linha: depois de 90 dias a purga a leva. Responder `404` diz
"isto nunca existiu", o que é falso. O [doc 04](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http)
tem o status exato — `410`: "existiu, não existe mais, e não volta". O id é um ULID cunhado pelo
`IdGenerator` do domínio com o momento da entrada, e `audit_purges` guarda o `cutoff` de cada lote.

**Recomendação:** `410 AUDIT_ENTRY_PURGED` quando o momento do ULID é anterior ao maior `cutoff` já
purgado daquela trilha, e `404 AUDIT_ENTRY_NOT_FOUND` quando não é (S-58, S-59). A resposta nunca diz
**quantas** linhas a purga levou — `audit_purges` é da máquina inteira, de todos os usuários (S-55).

---

## F1 — Backend da trilha

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Como buscar texto em **todo** o input | o tamanho de um índice de trigramas sobre inputs de `Write` com arquivos inteiros, e o tempo da busca com 100 mil linhas — não medidos | B-07, B-14 | — | 🔲 |

### D-08 — a busca no input

"Onde foi que ele rodou `rm`?" é a pergunta que a busca responde, e ela precisa alcançar qualquer campo:
comando, caminho, padrão, URL — e o conteúdo de um `Write`, que está no input.

Opções:

- **(a) índice de trigramas** (`pg_trgm`, GIN sobre `input::text`, índice de expressão — `CREATE INDEX`
  não reescreve linha nem toca a trigger), com termo mínimo de três caracteres;
- **(b) `ILIKE` sem índice**, restrito ao usuário e ao período, com teto de linhas examinadas e
  `truncated` na resposta;
- **(c) `tsvector`** — busca por palavra, que erra justamente o que se procura aqui (`--force`,
  `/etc/hosts`, `rm -rf`).

O texto buscado é o **mesmo** que a leitura mostraria: de um `Read` só os quatro campos da lista de
permissão (S-65) — a busca não pode virar uma forma de descobrir o que a tela esconde.

**Recomendação:** (a), medido antes na B-14 com a fixture de 100 mil linhas e inputs de `Write`
realistas; se o índice passar do tamanho da própria tabela, (b) com teto e aviso na tela. A extensão
entra por migration, com o plano de reversão no topo, como o [backend/05](../../architecture/backend/05-persistence.md#migrations) exige.

---

## F2 — Tela da trilha

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-09 | Onde mora o nome amigável de cada tool, e como aparece uma tool MCP | o que os planos 08 e 15 vão precisar do mesmo mapa | B-16 | — | 🔲 |
| D-10 | Visões salvas: por visitante (navegador) ou do usuário no servidor | o que o [plano 06](../06-workbench/README.md) decide sobre preferências no servidor (D-10 e D-13 de lá) | B-23 | — | 🔲 |
| D-11 | A lista ordena por outra coisa além do momento? | nenhum técnico — é o que a D-06 do plano 03 permite | B-19, B-20 | — | 🔲 |
| D-12 | Como a tela aberta fica sabendo de entradas novas | se um stream WebSocket fora de sessão (com `seq` próprio) vale para esta tela | B-24 | — | 🔲 |

### D-09 — o nome amigável das tools

Hoje o web traduz sete nomes (`permission.tool.Bash`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`,
`Read`, `WebFetch`) e o resto vira "Use X". Faltam `Glob`, `Grep`, `LS`, `WebSearch`, `Task`, `TodoWrite`,
`BashOutput`, `KillShell`, `ExitPlanMode`, `NotebookRead` — e toda tool MCP, que chega como
`mcp__<servidor>__<tool>`.

Opções: mapa no backend (devolvido pela faceta); mapa no web, em i18n; mapa no web **com** o campo
principal de cada tool (o que se mostra "à vista": `command` do `Bash`, `file_path` do `Edit`, `pattern`
do `Grep`, `url` do `WebFetch`…) e o ícone.

**Recomendação:** um **catálogo de tools no web**, em `web/src/shared/tools/`, com chave de i18n, ícone
lucide e extrator do campo principal por tool; MCP decomposto em "tool, do servidor MCP X"; desconhecida
com nome técnico e ícone genérico. O backend devolve só o nome técnico — quem traduz é o cliente
([02-i18n](../../architecture/shared/02-i18n.md)). É o mesmo catálogo que os cards de tool do
[plano 08](../08-claude-panel/README.md) e o assistente de regra do [plano 15](../15-rules-management/README.md)
vão usar: quem chegar primeiro cria, os outros estendem.

### D-10 — visões salvas

"Comandos que rodaram sem perguntar nesta pasta, últimos 7 dias" é uma visão que alguém reabre toda
semana. Guardá-la no navegador é simples e fica no aparelho; guardá-la no servidor segue o usuário para
o celular — e a [regra de armazenamento do web](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora)
reserva o `localStorage` para conveniência.

**Recomendação:** no servidor, por usuário, **fora** da trilha (visão é preferência mutável, não fato:
não pode morar numa tabela append-only). Se o plano 06 criar um store de preferências do usuário, as
visões moram nele; se não, uma tabela `audit_saved_views` do lado da leitura de `audit`, com teto por
usuário (S-104) e os códigos `AUDIT_VIEW_*`.

### D-11 — ordenar por outra coisa

A lista ordena do mais novo para o mais antigo, por keyset sobre `seq`. Ordenar por duração, tool ou
pasta exigiria offset ou cursor por outra chave — e a D-06 do plano 03 mostrou por que as duas
alternativas pulam e repetem linha numa tabela que cresce durante a leitura. O ascendente tem o mesmo
defeito.

**Recomendação:** só por momento, descendente. O que o usuário quer quando pede "mais antigo primeiro" é
**chegar** a um ponto do passado: um controle "ir para data" (que ajusta o `to`) resolve sem furar a
paginação. Agrupar (por sessão, turno, pasta, tool) é a outra metade do pedido, e mantém a ordem dentro
de cada grupo (B-19). A ajuda diz por que não há "ordenar por".

### D-12 — entradas novas com a tela aberta

A trilha cresce enquanto alguém a lê. Opções: consulta periódica leve (`GET /audit/timeline` com
`after=<seq do topo>`, só contagem), apenas com a aba visível; ou um stream WebSocket de trilha — que o
[protocolo](../../architecture/shared/05-websocket-protocol.md) só admite com `seq` próprio, fora das
sessões, e que seria mudança de contrato nas três pontas.

**Recomendação:** consulta periódica a cada 15 s, só com a aba visível e só quando o período não está
fechado no passado (S-107, S-108), mostrando "N novas" sem mexer na rolagem. O ganho de um stream não
paga a mudança de contrato para uma tela de consulta.

---

## F3 — Eventos e exportação

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-13 | Para onde leva "ir ao ponto exato da conversa" | se o [plano 08](../08-claude-panel/README.md) terá uma rota de conversa endereçável por `toolUseId` quando este plano chegar à F3 | B-27 | — | 🔲 |
| D-14 | Exportar a trilha: formato, teto, se a exportação é auditada, e se há exportação agendada | a [ADR](../../architecture/shared/00-decisions.md) que o plano 03 exigiu antes de qualquer task de exportação | B-30, B-31, B-32 | — | 🔲 |

### D-13 — o ponto exato da conversa

Da invocação, o usuário quer ver **o que o Claude estava fazendo** quando pediu a tool: a mensagem
anterior, o raciocínio, o que veio depois. O `toolUseId` é o id do bloco `tool_use` dentro da mensagem do
transcript, então o ponto é localizável.

Opções: a tela de histórico que já existe (`/history/$conversationId`), com um parâmetro que rola até a
mensagem; o painel de conversa do plano 08 no workbench, com a aba da pasta; ou os dois, conforme o que
existir. Do lado do servidor, `GET /transcripts/:id/messages` ganha `aroundToolUseId` — página de
mensagens em volta daquela, pelo mesmo cache do plano 04.

**Recomendação:** os dois, nessa ordem de preferência — o painel do plano 08 quando ele existir, a tela
de histórico até lá —, e `aroundToolUseId` como parâmetro do transcript, com `INVALID_INPUT` quando o
bloco não está lá (S-121), como o cursor que sumiu já responde
([backend/03](../../architecture/backend/03-modules.md#transcript)).

### D-14 — exportar

O [plano 03](../03-rules-and-audit/README.md) deixou a exportação fora com uma condição explícita:
"superfície nova de vazamento… se aparecer, vira ADR antes de virar task". Apareceu — é pedido do
usuário. O arquivo exportado carrega o input exato, e o input de um `Write` é um arquivo inteiro.

As perguntas: formato (CSV para planilha, JSON Lines para ferramenta); teto (a exportação é síncrona e
sai por streaming); se exportar é fato da trilha; se existe exportação agendada.

**Recomendação:** JSON Lines e CSV, o recorte filtrado, **teto de 10 000 invocações** por arquivo com
`AUDIT_EXPORT_TOO_LARGE` acima (a tela diz a contagem antes e sugere estreitar — S-135); CSV com as
células neutralizadas contra injeção de fórmula (S-130); o `Read` com a mesma lista de permissão da
tela (S-131). **Exportar é fato da trilha**: `audit.exported`, com o filtro e a contagem, gravado
**antes** do primeiro byte — trilha indisponível não exporta (S-129). **Sem exportação agendada**: é um
arquivo com a história inteira da máquina saindo sozinho, sem ninguém olhando, que é o contrário do que
a trilha existe para garantir. A ADR-019 nasce na B-30.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que as anteriores decidirem)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 13`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
