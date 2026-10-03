# Plano 09 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> As 16 primeiras nasceram ao planejar, em 2026-10-02, e foram **respondidas pelo usuário no mesmo dia**.
> Treze seguem a recomendação; **três divergem** (D-01, D-02, D-05) e mudam o plano — ver o
> [progresso](progress.md#decisões-tomadas-durante-a-execução). A D-03 abriu as D-17…D-19, que
> deixaram de ser deste plano quando o usuário pôs o app num plano próprio, o
> [10](../10-mobile-chat-layout/README.md): duas foram para lá e uma foi descartada.

---

## F0 — Normas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Este plano roda antes ou depois da F6 do 08 (o e2e do painel) | a F6 do 08 (S-255…S-272) afirma controles e lugares do layout de hoje | F0 | **2026-10-02 — depois** (diverge da recomendação). A F6 do 08 fecha primeiro, contra o layout de hoje; os e2e dela que afirmam controle ou lugar são reescritos aqui, pelo page object da B-03, e a F5 passa a incluí-los. R-05 deixa de ser risco e vira custo aceito | ✅ |
| D-02 | O contrato WS e HTTP muda? | se algum lugar novo precisa de dado que o stream não manda. Conferido em 2026-10-02: `permission.requested` traz `toolUseId`, o status do turno vem no stream, e thinking (`blockType`) e subagent chegam desde o 08 · F0 | B-01 | **2026-10-02 — pode mudar** (diverge da recomendação). O contrato WS/HTTP fica aberto a evoluir neste plano. Conferido na revisão: o app ([plano 10](../10-mobile-chat-layout/README.md)) vai usar `session.setModel`, `session.setPermissionMode`, `session.cancelQueuedPrompt`, `prompt.queued`/`prompt.dequeued`, `session.start.forkAt`/`effort`, o `blockType` e o `GET /catalog`, que **já existem**. Hoje nada pede mudança. Toda mudança segue o gatilho do AGENTS.md: [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) atualizado e as três pontas na mesma mudança. `pnpm test:e2e:mobile` entra no critério de conclusão de toda fase que mexer no contrato | ✅ |
| D-03 | O app Flutter entra? | o usuário falou da página de chat do web; o app tem telas próprias de sessão e aprovação | escopo | **2026-10-02 — fora deste plano, num plano próprio: o [10](../10-mobile-chat-layout/README.md).** O usuário escolheu primeiro "entra" e, na revisão, mudou: o app ganha o plano 10, logo depois deste, e os planos que eram 10…19 passaram a 11…20. É o que a recomendação dizia, com o escopo que a [10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas) fixou (paridade com o painel web) | ✅ |
| D-17 | O que o app ganha | o app não mostra thinking, desenha as mensagens e depois as tools (fora da ordem), põe a fila de permissão acima da conversa (até metade da tela) e não tem modo, modelo, esforço, fila nem rascunho | — | **2026-10-02 — movida para o plano 10**, que é o plano do app: lá ela é a [10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas) (paridade com o painel web). Fica aqui o número, como manda a convenção | ✅ |
| D-18 | Como as tarefas do app entram nas fases | uma fase própria do app, depois do web, ou web e app juntos em cada fase | — | **2026-10-02 — descartada:** com o app num plano próprio ([D-03](#f0--normas)), as fases deste plano são só do web, e a pergunta não existe mais | ✅ |
| D-19 | A tela que a notificação abre continua? | com o card inline na conversa, a `PermissionPage` avulsa (plano 02) poderia sumir | — | **2026-10-02 — movida para o plano 10:** lá ela é a [10 · D-02](../10-mobile-chat-layout/decisions.md#f0--normas) (a tela da notificação continua) | ✅ |

## F1 — Moldura do painel

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Largura mínima do painel e teto de altura da caixa | a largura mínima que a secondary side bar aceita hoje (o `SizeLimit` do `FolderShell`) e em que largura a barra da caixa deixa de caber | B-08 | **2026-10-02 — segue a recomendação.** A caixa cresce até **40 %** da altura do painel. Abaixo da largura em que a barra cabe, modelo e esforço vão para um menu de excesso, e enviar/parar, modo e `+` nunca saem da barra | ✅ |
| D-05 | Sessão encerrada: o que a caixa faz | o plugin deixa continuar a conversa; aqui, continuar é abrir um subprocesso novo (~222 MB) que conta no teto | B-06 | **2026-10-02 — caixa ativa, Enter retoma** (diverge da recomendação). Como no plugin: enviar numa sessão encerrada retoma pelo fluxo do 04/08 e manda o prompt. A faixa "Sessão encerrada — *motivo*" fica, como aviso. Com o teto cheio, o envio é recusado com o motivo na tela (D-07), e o prompt não se perde | ✅ |

## F2 — Composer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Enviar e parar: um botão que alterna, ou dois | com texto escrito durante o turno, enviar enfileira, e a pessoa ainda pode querer parar | B-10 | **2026-10-02 — segue a recomendação.** Caixa vazia com turno rodando → o botão vira **Parar**. Com texto → **Enviar** (enfileira), e o **Parar** aparece ao lado | ✅ |
| D-07 | O motivo de não enviar: na tela ou só no nome acessível | o 08 · S-215 pede que a caixa diga por que não envia; o usuário achou a linha poluída | B-14 | **2026-10-02 — segue a recomendação.** Caixa vazia → só no nome acessível e no tooltip do botão. Bloqueio real (arquivo sumiu, upload, teto) → na tela, acima da caixa. A S-215 do 08 continua valendo pelo nome acessível | ✅ |
| D-08 | O menu "Commands" (`CommandMenu` em `Disclosure`) sai? | se a completion do `/` (08 · B-50) cobre o que o menu mostra: busca, grupos e as skills de cada origem | B-12 | **2026-10-02 — segue a recomendação: sai.** O botão `/` da barra abre a completion, que já busca e agrupa. A busca por descrição fica na completion, se ela ainda não buscar | ✅ |
| D-09 | Atalho para alternar o modo | o CLI usa Shift+Tab, mas no navegador Shift+Tab é a navegação de foco para trás e não pode ser roubado | B-11 | **2026-10-02 — segue a recomendação.** Comando "Alternar modo" na palette, com atalho configurável e sem padrão que colida (ex. `Ctrl/Cmd+Shift+M`, conferido contra os atalhos do workbench). Shift+Tab fica com o navegador | ✅ |

## F3 — Cabeçalho

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Encerrar sessão pede confirmação? | hoje é um clique num botão vermelho à vista; no menu, o clique errado fica mais fácil e o efeito é irreversível (o subprocesso morre e o desfazer vai embora) | B-17 | **2026-10-02 — segue a recomendação: sim.** Um diálogo diz o que se perde (desfazer e alterações não aceitas) e põe o foco em cancelar | ✅ |
| D-11 | Onde fica o custo da sessão | hoje é uma linha no topo; a status bar já mostra o custo da sessão ativa (08 · B-41) | B-18 | **2026-10-02 — segue a recomendação.** No tooltip do status e na status bar. A linha do topo sai, e o resumo de cada turno continua na conversa | ✅ |

## F4 — Inline

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | Onde o card de permissão aparece | a ordem real entre a linha da tool (o `tool_use` do assistente) e o `permission.requested`, a medir nas fixtures do 08 · B-06 (`tool-turn`, `edit-turn`, `plan-turn`) | B-23, B-24 | **2026-10-02 — segue a recomendação.** No lugar da linha da tool, pelo `toolUseId`. Se o pedido chegar antes da linha, o card fica na cauda e vai para o lugar quando a linha chegar (S-59) | ✅ |
| D-13 | O card que chega recebe o foco? | a norma do 03 põe o foco inicial em negar quando `defaultToNo`. Inline, com a pessoa escrevendo, isso tira o foco da caixa, e um Enter de prompt vira uma resposta | B-25, B-01 | **2026-10-02 — segue a recomendação.** Com o foco na caixa, o foco fica lá, e a pílula e o `aria-live` anunciam o pedido. Sem ninguém na caixa, a regra do 03 vale. `web/03` é atualizado na B-01 | ✅ |
| D-14 | Onde fica a lista de tarefas | hoje fica no topo da conversa e rola junto | B-26 | **2026-10-02 — segue a recomendação.** Ancorada sobre a caixa, recolhida numa linha com o progresso e a tarefa atual, como no plugin | ✅ |
| D-15 | Onde fica o desfazer | hoje é um botão "Undo file changes" que abre a lista de pontos; cada ponto é um prompt | B-27, B-17 | **2026-10-02 — segue a recomendação.** Ação **na mensagem do prompt** ("desfazer arquivos até aqui") e item no menu `⋯` com a lista. Os dois abrem o mesmo diálogo de alcance | ✅ |
| D-16 | O indicador: verbo sorteado ou fixo, e qual glifo | o plugin sorteia verbos ("Deciphering…"). A lista precisa existir em `en` e `pt-BR`, e o glifo não pode ser marca registrada | B-21, B-01 | **2026-10-02 — segue a recomendação.** Lista de ~20 verbos traduzidos (chaves `sessions.working.verbs.*`), sorteada por turno e estável no turno. Glifo: um asterisco nosso (ícone do `lucide`), em `primary`. Com `prefers-reduced-motion`, parado. **Na execução (2026-10-03):** as chaves são `sessions.workingVerb.*`, porque o catálogo não aninha mais de três segmentos (o teste do catálogo reprova `sessions.working.verbs.*`) | ✅ |

## F5 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: a fase prova o que F0…F4 decidiram | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 09-chat-layout`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
