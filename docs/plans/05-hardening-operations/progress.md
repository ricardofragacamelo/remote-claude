# Plano 05 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0 e F1 — implementadas, em validação
**Última atualização:** 2026-09-27
**Bloqueios:** nenhum por decisão — a [D-05](decisions.md) foi decidida em 2026-09-26 pelo usuário:
**Keycloak próprio**, administrado por quem opera a instalação ([emenda da ADR-010](../../architecture/shared/00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial)).
Os planos 06 a 16 esperam este plano fechar ([06 · D-02](../06-workbench/decisions.md)).

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 █████░░░░░░░░░░░░░░░  25%   🔄 em andamento
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-limits.md) | B-01…B-07, B-25…B-27 | 10/10 | ✅ |
| [F1](F1-diagnostics.md) | B-11 | 1/1 | ✅ |
| [F2](F2-identity.md) | B-12…B-15 | 0/4 | 🔲 |
| [F3](F3-gates.md) | B-16, B-19, B-20, B-28 | 1/4 | 🔄 |
| [F4](F4-e2e.md) | B-21…B-23 | 0/3 | 🔲 |
| **Total** | **B-01…B-07, B-11…B-16, B-19…B-23, B-25…B-28** | **12/22** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 59 | 23 | 0 | 36 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 10 | 0 | 0 | 10 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-26 | F0, F1 | 5 — duplicação | 4 clones nascidos da entrega: as duas redações em `redact.ts` percorriam a árvore com o mesmo código; os dois guards de bearer repetiam a resolução do token; o bloco de imports da tela inicial do app ficou igual ao da lista de workspaces ao ganhar `dart:async`; o início do `build` da tela de diagnóstico igualou o da tela de login | um `walk` só em `redact.ts`; uma classe base `CredentialGuard`; `Future.ignore()` no lugar de `unawaited`; a tela de diagnóstico dividida em página e corpo | reinício do portão 1 |
| 2 | 2026-09-26 | F0, F1 | 6 — unit | o teste dos guards gerados (`test/unit/contracts-guards.spec.mjs`) montava um `connection.ready` só com os limites antigos, e o contrato agora exige `maxFramesPerSecond` e `maxAttachedSessions` | exemplo atualizado, mais o caso que recusa o `ready` sem os limites novos; o construtor de frames de teste do app também passou a anunciar o contrato atual | reinício do portão 1 |
| 3 | 2026-09-26 | F1 | 6 — unit (app) | `test/unit/wiring/providers_test.dart` enumera as rotas do app e não conhecia `/diagnostics` — o teste fazendo o que existe para fazer | a rota nova entra na lista. Mesmo portão do ciclo 2, causa diferente: a unit da raiz, do web e do backend já passavam | reinício do portão 1 |
| 4 | 2026-09-26 | F0, F1 | 7 — cobertura | na raiz, dois vermelhos que não eram desta entrega: o `docs-check` sobre os planos 06…19 que outra sessão escrevia ao mesmo tempo (âncoras quebradas, já corrigidas por ela) e o `afterAll` de `run-e2e-local.spec.mjs` preso 600 s fechando os servidores que ocupam portas. Rodada à parte, a cobertura por arquivo desta entrega tinha quatro buracos de ramo: `bearer.guard.ts` (decorators sem o guard), `client-logs.controller.ts` (endereço ausente), `client-logs.dto.ts` (campos opcionais) e, no app, o padrão nulo de `logShippingProvider` | testes unitários do guard, do controller, do `toEntry` e do padrão do provider — backend 99,7 % de linhas e 99,1 % de ramos, app 99,5 % de linhas, todo arquivo ≥ 90 % | reinício do portão 1 |
| 5 | 2026-09-26 | F0, F1 | 2 — lint | o método fictício onde o teste do guard aplica os decorators tinha um parâmetro não usado — `no-unused-vars` | o método passa a devolver o parâmetro; nenhuma regra suprimida | reinício do portão 1 |
| 6 | 2026-09-26 | F0, F1 | 7 — cobertura (raiz) | portões 1–6 verdes; o `afterAll` de `test/integration/scripts/run-e2e-local.spec.mjs` trava 600 s — de novo, e só com `stack.spec.mjs` em paralelo (sozinha, passa em 28 s). A mudança **de outra sessão**, ainda não commitada, em `scripts/start-local.mjs` passou a sondar `localhost:3000/health` e `localhost:5173` (`waitForWorkspaces`); a spec do runner segura justamente essas portas com servidores mudos, a sonda abre conexão num deles e o `server.close()` espera para sempre. Não é desta entrega, e o combinado com o usuário foi não mexer naquele trabalho | nenhuma aqui — escalado ao usuário; portões 8–11 rodados à parte para esta entrega | **bloqueado por terceiro** |
| 7 | 2026-09-26 | F0 | 9 — e2e (rodado à parte) | 3 cenários que estouram o ring buffer (plano 01 · S-28, S-80; plano 04 · S-47) mandavam lotes de 50 frames de uma vez — o rate limit novo (20/s) os recusava e fechava com `4429`. Portão 8 (integração de backend, web e app), 10 e 11 verdes | o fixture `pushPastSeq` passa a respeitar o `maxFramesPerSecond` anunciado no `connection.ready` (lote nunca maior, e espera o segundo fechar quando gasta o orçamento); a pilha efêmera usa 5000 frames/s, porque estourar 1.000 eventos a 20/s levaria quase um minuto por cenário — o cenário que for sobre o rate limit (S-43, F4) fixa o seu. E2E 45/45 | reinício do portão 1 |
| 8 | 2026-09-27 | F0, F1 | 4 — arquitetura, depois 7 — cobertura (raiz) | primeiro, outra sessão rodava `pnpm verify` na mesma árvore e as sondas `_arch_*.dart` da suíte de arquitetura dela estavam no disco quando o portão 4 varreu; rodado de novo sozinho, 1–6 verdes e o 7 parou **só** no mesmo travamento do ciclo 6 (`run-e2e-local.spec.mjs` com `stack.spec.mjs`, pela mudança não commitada em `scripts/start-local.mjs`); 642/642 asserções da raiz passam | nenhuma nesta entrega; a cobertura de backend, web e app e os portões 8–11 já tinham sido provados à parte nos ciclos 4 e 7 | **bloqueado por terceiro** |
| 9 | 2026-09-27 | F0, F1 | 7 — cobertura (raiz) | o mesmo travamento dos ciclos 6 e 8; a outra sessão terminou, com a mudança do `start-local.mjs` ainda na árvore, e o usuário liberou a correção | os servidores que `run-e2e-local.spec.mjs` usa para **ocupar** as portas de desenvolvimento passam a derrubar toda conexão que recebem — ocupar a porta, não servi-la —, e o `close()` do `afterAll` deixa de ter o que esperar. As duas specs juntas: 16/16 | reinício do portão 1 |
| 10 | 2026-09-27 | F0, F1 | nenhum | depois de tirar o envio de log dos clientes (escopo reduzido, abaixo) | — | **11 portões verdes** |
| 11 | 2026-09-27 | F0 | — (e2e de push real, fora do `verify:full`) | S-53 ainda 🟡: o emulador era ligado e desligado à mão, e o `gradlew --stop` também — passo esquecível, e daemon esquecido derruba o portão 7 seguinte | `run-e2e-local.mjs` passa a cuidar do aparelho das corridas do app (`scripts/lib/emulator.mjs`): usa o que já está conectado e o deixa como estava, ou sobe a AVD sem janela em paralelo com a stack e a derruba no teardown (`adb emu kill`, depois o grupo), e para os daemons do Gradle quando o app foi compilado. `pnpm test:e2e:mobile:push` saiu 0 com S-53 provado, e não deixou emulador nem daemon do projeto | reinício do portão 1 |
| 12 | 2026-09-27 | F0, F1 | nenhum | depois do ciclo do emulador em script | — | **11 portões verdes** |
| 13 | 2026-09-27 | F3 · B-28 (antecipada) | nenhum no `verify:full`; antes dele, 5 — duplicação | a refatoração de `RewindBoard._copy` em duas cópias nomeadas deixou os dois construtores iguais (clone de 11 linhas); e o `scripts/mobile.mjs` fora do Prettier | `_withPoints` passa por um construtor nomeado, `RewindBoard._repointed`, que copia o lado do desfazer pela lista de inicialização; Prettier no arquivo. As 27 funções acima de 10 refatoradas — nenhuma supressão; o gerador de contrato passou a emitir guards em lista (`[…].every(Boolean)`), de complexidade fixa | **11 portões verdes** |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-24 | B-25, a nova tentativa do push, entra na F0 | veio do ciclo 32 do [plano 02](../02-mobile-approval/progress.md): uma falha pontual do provedor perdeu a notificação, e o plano 02 a mandou para cá | F0, S-47…S-53 e [D-09](decisions.md), que bloqueia B-25 |
| 2026-09-26 | D-01, D-02, D-03, D-04 e D-09 decididas, todas na opção recomendada | eram o que impedia começar F0 e F1 | [decisions.md](decisions.md) |
| 2026-09-26 | As duas pendências herdadas do plano 04 viram B-26 (prazo da retomada no cliente) e B-27 (prompt durante um desfazer), com S-54…S-58 | o plano as mandou para a F0 "quando ela começar" | F0, [matriz](scenarios.md) |
| 2026-09-26 | B-05 e B-07 ganham cenários próprios, S-59 (sessões anexadas) e S-60 (heartbeat sob carga) | as duas tarefas não tinham linha na matriz | [matriz](scenarios.md) |
| 2026-09-26 | Contrato WS: `session.closed.reason` ganha `idleTimeout`; `connection.ready.limits` ganha `maxFramesPerSecond` e `maxAttachedSessions`; `4429` faz o cliente esperar o `retryAfterSeconds` | mudança de contrato, nas três pontas na mesma entrega | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), `packages/contracts/`, web e app |
| 2026-09-26 | A trava do desfazer sai do caso de uso e vai para a entidade `Session` | o prompt precisa enxergá-la (B-27) | `backend/src/domain/session` |
| 2026-09-26 | `RateLimitedError` vai para `@domain/shared` — **desfeito em 2026-09-27**, com a ingestão de log; voltou para `shared/errors` | a ingestão de log recusava por ritmo na aplicação, que não importa `shared/` | backend |
| 2026-09-26 | O filtro de exceção passa a mapear erro `4xx` exposto do body parser (corpo grande demais, JSON inválido) para o `4xx` dele, em vez de `500` | achado ao escrever S-17: corpo acima de 100 KB respondia `500` | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) |
| 2026-09-26 | O shipper do web troca `sendBeacon` por `fetch` com `keepalive` — **desfeito em 2026-09-27**: o shipper saiu | `sendBeacon` não leva `Authorization` (D-04) | [web/05-logging](../../architecture/web/05-logging.md) |
| 2026-09-26 | `levelFor` vai de `app/bootstrap.dart` para `core/logging/log_level.dart` (o bootstrap o reexporta) | a tela de diagnóstico, que é feature, precisa dele e não pode importar `app/` | mobile |
| 2026-09-26 | O S-25 do plano 04 (`session-resume.spec.ts`) passa a reconhecer a resposta de cada retomada pelo `correlationId` | falhou uma vez sob carga: quem junta já está anexado e pode receber o `session.started` de quem abriu antes do próprio ack — o que o protocolo permite. Os outros dois vermelhos daquela execução eram consequência da sessão que ficou aberta | teste de integração |
| 2026-09-26 | Os testes de integração passam a acreditar numa máquina de 64 GB (`ROOMY_MACHINE`), salvo a suíte que é sobre a capacidade | com o limite derivado da RAM, a capacidade de uma suíte dependeria da máquina que a roda | `backend/test/support/app/test-app.ts` |
| 2026-09-27 | D-06, D-07 e D-08 decididas pelo usuário | eram as últimas em aberto | [decisions.md](decisions.md): claims mínimas sem papel (B-12 ganha S-61); Sonar adiado e e2e mobile só local (B-17, B-18 e S-36 saem; S-40 vai para B-19); [11-validation-protocol](../../architecture/shared/11-validation-protocol.md), [09-code-quality](../../architecture/shared/09-code-quality.md), [10-definition-of-done](../../architecture/shared/10-definition-of-done.md) e [08-authentication](../../architecture/shared/08-authentication.md) |
| 2026-09-27 | **D-10: complexidade ciclomática ≤ 10 por função, no portão 2** — B-28 entra na F3 e é **antecipada** | pedido do usuário, como compensação da D-07: sem o Sonar, nenhum portão media complexidade. Limite escolhido pelo usuário com a medição na mão (27 funções acima de 10) | `eslint.config.mjs` (`complexity`), `mobile/analysis_options.yaml` e `pubspec.yaml` (`dart_code_linter`), `scripts/mobile.mjs analyze` e `scripts/lib/dart-metrics.mjs`; S-62…S-68; [09-code-quality](../../architecture/shared/09-code-quality.md), [11-validation-protocol](../../architecture/shared/11-validation-protocol.md), [10-definition-of-done](../../architecture/shared/10-definition-of-done.md) |
| 2026-09-27 | **O envio de log do web e do app ao backend sai do escopo** — B-08, B-09, B-10 e, na F4, B-24; S-15…S-20, S-22 e S-46; D-03 e D-04 descartadas; o `LogBuffer`/`beaconShipper` do web e o `LogBuffer` do app, herdados do bootstrap, removidos | decisão do usuário: o log do cliente fica no cliente, e o `traceId` que o erro mostra e o backend grava é o que liga os dois lados. Sai também o que só existia para isso: o guard de bearer opcional e a redação por forma de texto. Fica a correção do filtro (corpo acima do limite do parser → `413`, não `500`), que é geral e ganhou testes próprios | F1 vira "Diagnóstico" (só B-11), F4, [matriz](scenarios.md), [decisions.md](decisions.md), [plano 16](../16-logs-and-diagnostics/README.md), [03-logging](../../architecture/shared/03-logging.md) e as docs de logging de web e mobile |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | B-10: persistir o buffer de log do app em disco antes do background, e enviar só em Wi-Fi por padrão — **superado em 2026-09-27** pela linha abaixo | exigiam plugins nativos novos | ia para o plano 17; não vai mais |
| 2026-09-27 | B-17 (quality gate do SonarQube) e S-36 | [D-07](decisions.md), decisão do usuário: sem infraestrutura de Sonar por ora. O portão 12 fica declarado ausente; **complexidade** fica sem portão | **a lugar nenhum por enquanto** — volta como tarefa quando alguém decidir hospedar o Sonar |
| 2026-09-27 | B-18 (job de e2e mobile no CI) | [D-08](decisions.md), decisão do usuário: o e2e mobile segue local, por `pnpm test:e2e:mobile`, sem runner | a lugar nenhum — [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#portões-de-ci) já o declara sob demanda |
| 2026-09-27 | B-08, B-09, B-10 e B-24 — o envio de log do web e do app ao backend, o endpoint que o recebia e o e2e que o provava | decisão do usuário: não é necessário. O log do cliente fica no cliente; o `traceId` liga um erro na tela ao log do backend | **a lugar nenhum** — removido do código e dos planos. O [plano 16](../16-logs-and-diagnostics/README.md), que lia essas linhas, foi ajustado para mostrar só as do backend |

---

## Dívida herdada do plano 00

O que o [bootstrap](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado) adiou e **este**
plano assume. Item herdado sem dono vira item esquecido.

| Herdado | Onde fecha |
|---|---|
| `LogBuffer` e `beaconShipper` do web sem endpoint que os receba | **removidos** em 2026-09-27 — o envio saiu do escopo |
| `LogBuffer` do app sem endpoint que o receba | **removido** em 2026-09-27 — o envio saiu do escopo |
| Tela de diagnóstico que liga `debug` em release | B-11 |
| Logout no `end_session_endpoint` (a metade do web) | B-15 |
| `osv-scanner` | B-16 |
| Quality gate do SonarQube | **adiado** em 2026-09-27 ([D-07](decisions.md)) — portão 12 declarado ausente |
| Job de e2e mobile no CI | **não será feito** por ora ([D-08](decisions.md)) — segue local |

---

## Dívida herdada do plano 04

O que o [plano 04](../04-transcript-and-resume/progress.md#escopo-reduzido-ou-adiado) adiou e
**este** plano assume. Nenhuma tarefa daqui cobre os dois ainda: entram como tarefas da F0 quando
ela começar, com a matriz de cenários de cada uma.

| Herdado | Onde fecha |
|---|---|
| Prazo no cliente para uma retomada (`session.start` com `resumeSessionId`) que não recebe resposta — hoje o backend sempre responde, e sem socket o comando nem sai | [F0 · B-26](F0-limits.md) |
| Prompt que chega **durante** um desfazer: a trava recusa desfazer durante turno, mas não impede um prompt de entrar na fila enquanto os arquivos voltam (cada arquivo em si é atômico) | [F0 · B-27](F0-limits.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Qual provedor OIDC real, e quem administra | ✅ **decidido** 2026-09-26 | bloqueia a F2; o teste continua no Keycloak local |
| R-02 | Limite derivado da RAM pode ficar otimista | ✅ mitigado | fração da RAM **total**, piso e teto configuráveis, limite do cgroup respeitado; fórmula pura e testada (S-01), capacidade dita no boot |
| R-03 | Varredura de órfã pode matar processo alheio | ✅ mitigado | casa por marca própria **e** por backend morto; S-07 prova em processos reais que o sem marca e o de backend vivo ficam |
| R-04 | Ingestão de log aceita texto do cliente | ✅ descartado | a ingestão saiu do escopo em 2026-09-27 |
| R-05 | Sonar e runner de e2e mobile exigem infraestrutura | ✅ **decidido** 2026-09-27 | nenhum dos dois é levantado ([D-07, D-08](decisions.md)); ficam declarados ausentes — nunca fingidos verdes |

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
