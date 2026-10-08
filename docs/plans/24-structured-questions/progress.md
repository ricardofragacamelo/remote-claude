# Plano 24 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está **concluído** em 2026-10-08: `pnpm verify:full` com os onze portões verdes e `pnpm test:e2e:mobile` 34/35, com o 05·S-79 aberto como pendência por decisão do usuário ([D-39](decisions.md#f6--e2e)); F6 (E2E) em 2026-10-08, F0…F5 em 2026-10-08
**Última atualização:** 2026-10-08
**Bloqueios:** nenhum. Pendência herdada: 05·S-79 no `test:e2e:mobile` completo (ver [escopo adiado](#escopo-reduzido-ou-adiado))

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-03 | 3/3 | ✅ |
| [F1](F1-backend.md) | B-04…B-10 | 7/7 | ✅ |
| [F2](F2-fixtures.md) | B-11, B-12 | 2/2 | ✅ |
| [F3](F3-web.md) | B-13…B-16 | 4/4 | ✅ |
| [F4](F4-mobile.md) | B-17…B-20 | 4/4 | ✅ |
| [F5](F5-history.md) | B-21, B-22 | 2/2 | ✅ |
| [F6](F6-e2e.md) | B-23…B-25 | 3/3 | ✅ |
| **Total** | **B-01…B-25** | **25/25** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 111 | 0 | 0 | 110 | 1 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 39 | 0 | 0 | 39 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-08 | F0 | 5 — duplicação | a forma das `answers` escrita três vezes nos schemas (resposta, resolvido, histórico) e a `interaction` duas — o gerador não tinha definição compartilhada | o gerador ganhou `$ref` para `schema/definitions/` ([D-28](decisions.md#f0--normas-e-contrato)): `QuestionAnswer` e `QuestionInteraction` escritos uma vez, um tipo cada nas duas pontas, com teste | reinício do portão 1 |
| 2 | 2026-10-08 | F0 | 7 — cobertura | `gates.spec.mjs` roda o `i18n:check` sobre os catálogos reais, e as chaves da B-03 ainda não tinham uso (órfãs) | as chaves entram com o código que as usa: as do push na F1, as do web na F3, as do app na F4 ([D-33](decisions.md#f0--normas-e-contrato)) | reinício do portão 1 |
| 3 | 2026-10-08 | F1 | 5 — duplicação | um `isRecord` privado no `normalizeQuestion` repetia o de `web/src/shared/lib/json.ts` | o domínio não pode importar `src/shared`: a guarda virou `isRecord` público em `domain/shared`, com casos que cobrem seus ramos | reinício do portão 1 |
| 4 | 2026-10-08 | F1 | 7 — cobertura | o `i18n:check` (no `gates.spec`) exige que o catálogo do web traduza todo `messageKey` que o backend emite, e os dois erros novos ainda não estavam lá | `permission.error.answersInvalid` e `permission.error.ruleToolInteractive` entram no web nesta fase — o backend já os emite ([D-33](decisions.md#f0--normas-e-contrato)) | reinício do portão 1 |
| 5 | 2026-10-08 | F2 | 7 — cobertura | `push.flow.spec` S-51 ("no frame arrived") com a máquina em load ~21 e a cobertura do web de outra sessão rodando na mesma árvore; o teste passa isolado (15/15) | nenhuma no código — o teste de tempo conhecido por oscilar sob carga; reinício imediato | reinício do portão 1 |
| 6 | 2026-10-08 | F2 | 7 — cobertura | `drizzle-audit-retention.store.spec` ("every `db.query` at debug") com load ~45: uma consulta lenta sai em `warn`; passa isolado (18/18) | nenhuma no código — outro teste sensível a carga; reinício imediato | reinício do portão 1 |
| 7 | 2026-10-08 | F3 | 5 — duplicação | o leitor de opção do web (`readOption`) repetia o prelúdio do `readOption` do domínio do backend | o leitor do web passou a filtrar os registros antes de ler — a contagem diferente continua falhando fechado — e um `optionOf` monta a opção | reinício do portão 1 |
| 8 | 2026-10-08 | F3 | 7 — cobertura | ramos abaixo de 90 % em `AnsweredQuestions`, `QuestionCard` e `question-of`: as setas ← e ↑, Enter numa aba, Enter e Ctrl/⌘+Enter no "Outro", pergunta sem `header`, a linha vencida e a recusada por regra, a pergunta sem registro nosso — e dois ramos inalcançáveis (contexto nulo, `closest` sem achar) | os caminhos reais ganharam testes; os inalcançáveis saíram do código (contexto com padrão, o card guarda a própria referência) | reinício do portão 1 |
| 9 | 2026-10-08 | F3 | 7 — cobertura | `tunnel.spec.mjs` (o `expect.poll` de 1 s pelo arquivo de pid de um processo filho) sob carga; nada deste plano toca o túnel, e o teste passa isolado (12/12) | nenhuma no código — teste de tempo sensível a carga; reinício imediato | reinício do portão 1 |
| 10 | 2026-10-08 | F3 | 7 — cobertura | backend e web verdes; o passo do app terminou sem teste falho nem limiar (`ELIFECYCLE Command failed.`, sem código) com a swap cheia — o processo foi morto. Sozinho, o mesmo passo passa (99,2 % das linhas) | nenhuma no código; reinício imediato | reinício do portão 1 |
| 11 | 2026-10-08 | F4 | 1 — formatação | `describe-permission.use-case.ts` fora do Prettier depois do campo `interaction` no resolvido | `prettier --write` no arquivo | reinício do portão 1 |
| 12 | 2026-10-08 | F4 | 2 — lint | complexidade 11 em `_ToolCardState.build` (o ramo da pergunta) e em `_PermissionPanelState.build` (o roteamento da pergunta somado ao bloqueio) | o ramo virou `_questionLine`, o bloqueio virou `_blockOf` | reinício do portão 1 |
| 13 | 2026-10-08 | F4 | 5 — duplicação | 8 clones Dart: a moldura do card da tool (o ramo da pergunta copiava a do card), o pé do card (prazo, envio, aviso) igual no plano e na pergunta, e preâmbulos de `build`/`dispose` que o tokenizador do jscpd casa sem olhar os nomes | `_toolFrame` no card da tool; `CardFooter` com o prazo opcional no `permission_card_view`; a ordem das declarações dos `build` novos | reinício do portão 1 |
| 14 | 2026-10-08 | F5 | 1 — formatação | três arquivos do backend da F5 (o seguidor, o módulo do transcript e o spec do `QuestionHistory`) fora do Prettier depois da costura | `prettier --write` nos três | reinício do portão 1 |
| 15 | 2026-10-08 | F5 | 5 — duplicação | dois clones de janela de tokens: o `_record` novo do mapper de eventos da sessão, logo depois do `_text`, casava com `wireText`+`wireInstant`; e o bloco de imports do `DrizzleQuestionRecordSource` repetia o do repositório de pedidos | o `_record` virou expressão `switch` e foi para antes do `_text`; o adaptador tira os tipos do port (`QuestionRecord['status']`) e importa o contexto numa linha só | reinício do portão 1 |
| 16 | 2026-10-08 | F6 | 5 — duplicação (`verify:full`) | o `questions_test.dart` repetia o preâmbulo de cada teste (o app olhando o navegador e a resposta pelo celular), a lista das respostas e a conferência do "Outro" na linha | `watching`, `answeredBy`, `seeTheOtherAnswer` e a lista `answers` uma vez só no arquivo; a suíte do app passou de novo (3/3) | reinício do portão 1 |
| 17 | 2026-10-08 | F6 | 7 — cobertura (`verify:full`) | backend (99,74 %) e web (99,77 %) verdes; o passo do app foi morto no meio (`ELIFECYCLE Command failed.`, sem código, 1809 testes passando e nenhum falho) com load ~21 e 6 GB de swap — os testes de outro projeto rodando na máquina. O mesmo quadro do ciclo 10 | nenhuma no código; reinício imediato | reinício do portão 1 |
| 18 | 2026-10-08 | F6 | `pnpm test:e2e:mobile` (o `verify:full` verde, 11 portões) | 34 de 35: `limits_test` S-79 (plano 05) — o Keycloak recusou a renovação com "Offline user session not found" antes do ponto que o teste prepara; nada do plano 24 toca auth nem o teste. A suíte `limits` sozinha passou (6/6) | nenhuma no código — teste de tempo sensível a carga; reinício da suíte completa | reinício do `test:e2e:mobile` |
| 19 | 2026-10-08 | F6 | `pnpm test:e2e:mobile` | 34 de 35 de novo, o mesmo 05·S-79 (a renovação recusada escapa como erro não tratado; o resto passa, a suíte `questions` inclusive) | nenhuma no código: S-79 falhou nas duas corridas completas e passou sozinho — não é carga aleatória | ✗ |
| 20 | 2026-10-08 | F6 | — (diagnóstico de S-79) | um `ProviderObserver` temporário no harness: com ele, a suíte completa passou 35/35 e a `limits` 2 de 2 (a terceira caiu no `compose up`: a porta do Keycloak ocupada pelo e2e de outro projeto). O único provider que falha com o `HttpException` é o `authControllerProvider`, o esperado; o Riverpod 3 só reporta como não tratado o erro de provider **síncrono** ou de callback de `listen` que lança, e nenhum dos dois apareceu — o observador muda o tempo e esconde a corrida. O plano 22 viu o mesmo (ciclos 15-17), com a bisseção apontando o `permission_mapper.dart`, que o plano 24 também muda | observador retirado; **parado e escalado** — três ciclos sem progresso no mesmo portão | ⛔ |
| 21 | 2026-10-08 | F6 | — (diagnóstico de S-79, decidido pelo usuário: investigar) | a sonda ganhou o `onError` do `ProviderContainer`, que imprime de onde o Riverpod reportaria um erro como não tratado: duas corridas completas com ela — 35/35, e 34/35 com S-79 verde e 04·S-48 caindo no preparo (o backend respondeu 500: `statement timeout` de 11 s no upsert de `devices` ao aprovar o aparelho). O `onError` nunca disparou. Lendo o Riverpod 3.3.2: provider assíncrono nunca reporta o próprio erro como não tratado, `AsyncValue.value` não relança, o retry só nasce de `build` que lança — e o único `.future` do app (`DeviceController`) trata o erro. As duas falhas de S-79 e a de S-48 vieram com a máquina carregada pelos testes de outro projeto; as corridas verdes, com ela calma | sonda retirada; corrida limpa com a máquina calma | — |
| 22 | 2026-10-08 | F6 | `pnpm test:e2e:mobile` (sem sonda, e só com o `onError`) | sem sonda, S-79 falhou de novo (a terceira de três); só com o `onError` do container — que não imprime nada no fluxo normal — passou 35/35, e o `onError` não disparou. Placar: sem sonda 0 de 3, com qualquer sonda 4 de 4 — e a sonda que nunca roda muda o resultado, o que descarta o tempo dos `debugPrint`. O erro também não passa pelos handlers do app (`installErrorHandlers` é só do `main.dart`), nem pela tela de entrada (lê o `AsyncError` como valor), nem por container de teste anterior (descartado no teardown, renovação cancelada no `onDispose`) | sonda retirada (arquivo igual ao do `verify:full` verde); escalado de novo ao usuário | ⛔ |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-08 | D-08: uma regra de allow deixa de aprovar `ExitPlanMode` (toda a `HUMAN_ONLY_TOOLS`) | uma regra de allow aprovava planos sem ninguém ver | B-07; comportamento existente do plano 23 |
| 2026-10-08 | D-28: `$ref` no gerador de contratos, `minItems`, e `preview` ausente em vez de `null` | o gerador não tinha nenhum dos três, e a duplicação dos schemas é portão | B-02; [05](../../architecture/shared/05-websocket-protocol.md#definições-compartilhadas--ref) |
| 2026-10-08 | D-33: as chaves de texto da B-03 entram na fase que as usa (F1, F3, F4) | chave declarada e não usada é órfã, e o `i18n:check` — também dentro do portão 7 — recusa | B-03, B-10, B-13…B-16, B-17…B-20 |
| 2026-10-08 | D-36: no app, a sessão guarda a `question` do `tool.completed` crua, e o domínio de `permission` a lê | a feature `session` não importa o domínio de outra, e nenhum barrel exporta dados | B-22 |
| 2026-10-08 | D-37: o e2e prova a recusa pela linha e pelo `permission.resolved`; o prazo de pergunta do stack de e2e vai a 15 s | o Claude roteirizado repete a resposta gravada qualquer que seja o veredito; responder em passos não cabia com folga em 5 s | B-23, B-24; `scripts/lib/stack.mjs` |
| 2026-10-08 | D-39: o plano fecha com o e2e do app 34/35, e o 05·S-79 vira pendência própria | decisão do usuário, depois de cinco ciclos sem achar a causa | B-25, S-111 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-08 | o `pnpm test:e2e:mobile` completo com saída 0 (S-111): o 05·S-79 falha nas corridas completas | a renovação recusada no meio de um turno escapa como erro não tratado só nas corridas completas sem instrumentação; a causa não foi achada em cinco ciclos (18-22), e nada deste plano toca a autenticação ([D-39](decisions.md#f6--e2e)) | pendência própria: a corrida da renovação do app (planos 05 e 22), a abrir como task ou plano — o diário dos ciclos 18-22 é o ponto de partida |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | o SDK muda o formato de `answers` ou o texto do `tool_result` | 🔲 aberto | — |
| R-02 | o modo estendido vira padrão e chegam perguntas sem opções | 🔲 aberto | — |
| R-03 | o gerador de contratos não tem `oneOf` | 🔲 aceito | fora deste plano; volta quando a `interaction` `plan` entrar |
| R-04 | a regravação das fixtures depende do modelo cooperar | 🔲 aberto | — |
| R-05 | um app desatualizado mostra o card genérico | 🔲 aberto | falha fechada (S-23) |
| R-06 | rascunho perdido por reconexão ou replay | 🔲 aberto | — |
| R-07 | regras de allow para `AskUserQuestion` já gravadas | 🔲 aberto | — |
| R-08 | texto da pergunta enorme ou com marcação estranha | 🔲 aberto | — |
| R-09 | o spec e a fixture atuais quebram na mesma mudança | 🔲 aberto | — |
| R-10 | o plano 22 ainda aberto mexe nos mesmos arquivos | 🔲 aberto | — |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
