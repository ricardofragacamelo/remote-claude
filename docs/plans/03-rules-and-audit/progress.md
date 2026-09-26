# Plano 03 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano fechou com a F4 em 2026-09-24
**Última atualização:** 2026-09-25
**Bloqueios:** nenhum

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-rules.md) | B-01…B-06 | 6/6 | ✅ |
| [F1](F1-rules-ui.md) | B-07…B-10 | 4/4 | ✅ |
| [F2](F2-audit-query.md) | B-11…B-15 | 5/5 | ✅ |
| [F3](F3-retention.md) | B-16…B-19 | 4/4 | ✅ |
| [F4](F4-e2e.md) | B-20…B-23 | 4/4 | ✅ |
| **Total** | **B-01…B-23** | **23/23** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 92 | 0 | 0 | 92 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 22 | 0 | 0 | 22 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-24 | F0 | 1 — formatação | nove arquivos novos ou tocados fora do Prettier | `prettier --write` só neles | reiniciado do portão 1 |
| 2 | 2026-09-24 | F0 | 3 — tipos | `it.each` com linhas de formato diferente inferido como união estreita | tipo explícito da tabela | reiniciado do portão 1 |
| 3 | 2026-09-24 | F0 | 5 — duplicação | os getters da `PermissionRule` repetiam os do `Device`, e o fim do `findById` repetia o do repositório de device | a entidade voltou a campos `readonly` no construtor; o `findById` desestrutura a linha | reiniciado do portão 1 |
| 4 | 2026-09-24 | F0 | 7 — cobertura | `permission-rule.mapper.ts` só era exercitado pela integração, sem os caminhos de linha ilegível | unit do mapper, incluindo escopo e decisão desconhecidos | `pnpm verify` 0 |
| 5 | 2026-09-24 | F0 | — | — | — | **`pnpm verify:full` 0** — onze portões verdes; integração 132,8 s, e2e 25/25 |
| 6 | 2026-09-24 | F1 | 1 — formatação | seis arquivos TS novos fora do Prettier, e os `.g.dart` gerados por um `build_runner` rodado à mão, que pula o `dart format` do script | `prettier --write` só neles; geração refeita por `node scripts/mobile.mjs generate` | reiniciado do portão 1 |
| 7 | 2026-09-24 | F1 | 2 — lint | import não usado no teste de widget da tela de regras | import removido | reiniciado do portão 1 |
| 8 | 2026-09-24 | F1 | 3 — tipos | o teste do service lia `revokedAt`, que o tipo do web não expõe | a asserção compara a resposta inteira | reiniciado do portão 1 |
| 9 | 2026-09-24 | F1 | 5 — duplicação | cinco clones: leitura do wire nos dois mappers do app, o preâmbulo de dois `build`, e a moldura das rotas do web | `wire_fields.dart` no app; `Screen` e `SignedIn` em `web/src/app/`; preâmbulos reordenados | reiniciado do portão 1 |
| 10 | 2026-09-24 | F1 | 7 — cobertura (o `i18n:check` roda dentro dela) | `permissionErrorRuleNotFound` declarada e nunca usada: faltou a entrada em `translateFailure` | a entrada, e o teste dela | reiniciado do portão 1 |
| 11 | 2026-09-24 | F1 | 7 — cobertura | a integração do HTTP esperava `project` num pedido aberto sem workspace | a expectativa corrigida: sem workspace não há regra de projeto a oferecer | **`pnpm verify` 0** |
| 12 | 2026-09-24 | F1 | — | — | — | **`pnpm verify:full` 0** — onze portões verdes; integração 147,4 s, e2e 26/26 (S-68 pelo navegador, 1,3 s) |
| 13 | 2026-09-24 | F2 | 5 — duplicação | o preâmbulo de imports de `AuditTrail.tsx` repetia o de `WorkspaceSelector.tsx` | imports reordenados | reiniciado do portão 1 |
| 14 | 2026-09-24 | F2 | 7 — cobertura | `AuditFilterForm.tsx` com funções em 85,7 %: nenhum teste digitava a sessão | o teste de aplicar filtros digita a sessão e confere o filtro enviado com ela | reiniciado do portão 1 |
| 15 | 2026-09-24 | F2 | 7 — cobertura | `audit.controller.ts` com ramos em 85,7 %: nenhuma requisição **válida** com filtros chegava pela borda HTTP | integração HTTP com todos os filtros juntos (S-72) e a borda final do período (S-24) | **`pnpm verify` 0** |
| 16 | 2026-09-24 | F2 | 7 — cobertura (no `verify:full`) | todos os 1661 testes passaram; a suíte `permission-rules.gateway.spec.ts` falhou no `afterAll`, com o Docker respondendo `409 cannot remove container… container is running` ao `container.stop()` do testcontainers | nenhuma no código: a suíte não foi tocada nesta fase e o erro é do daemon sob carga, entre o stop e o remove. Registrado para ser tratado como defeito do `startPostgres` se voltar | reiniciado do portão 1 — não se repetiu |
| 17 | 2026-09-24 | F2 | — | — | — | **`pnpm verify:full` 0** — onze portões verdes; integração 126,7 s (backend 338, web 166), e2e 26/26 |
| 18 | 2026-09-24 | F3 | 1 — formatação | dez arquivos novos ou tocados fora do Prettier | `prettier --write` só neles | reiniciado do portão 1 |
| 19 | 2026-09-24 | F3 | 3 — tipos | o typedef `PurgeSummary` do script não declarava `triggeredBy`, e o fixture do teste era inferido com `status: string` | o campo no typedef; o fixture tipado por JSDoc | reiniciado do portão 1 |
| 20 | 2026-09-24 | F3 | 7 — cobertura | `device-expiry.job.ts` com funções em 75 %: depois da extração do `PeriodicJob`, nenhum teste disparava o agendador, e o `run()` nunca era chamado | teste do job de aparelhos que dispara, varre e confere o rearme | **`pnpm verify` 0** |
| 21 | 2026-09-24 | F3 | — | — | — | **`pnpm verify:full` 0** — onze portões verdes; integração 152,7 s (backend 361, web 166), e2e 29/29 (S-89, S-40 e S-91 pelo `pnpm db purge`) |
| 22 | 2026-09-24 | F4 | 7 — cobertura | nove testes de integração do web em telas que a fase não tocou (aparelhos, sessão, fila), oito por estouro de 5 s; carga de 43 em 12 núcleos — os daemons do Gradle que o `pnpm test:e2e:mobile` deixou de pé, mais o emulador | nenhuma no código: a cobertura do web sozinha passou 562/562. Daemons do Gradle parados (`gradlew --stop`); o emulador, que já estava de pé, ficou | reiniciado do portão 1 |
| 23 | 2026-09-24 | F4 | — | — | — | **`pnpm verify:full` 0** — onze portões verdes; integração 139,5 s (backend 365, web 167), e2e 36/36 (os sete novos: S-41…S-46 e S-92). À parte, sem ser portão: `pnpm test:e2e:mobile` 8/8 no emulador, com S-44 e S-46 pelas telas do app |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-24 | [D-09](decisions.md#d-09--a-regra-nossa-é-a-única-autoridade) — não se devolve `updatedPermissions` | regra entregue ao SDK é aplicada pelo CLI sem `canUseTool`, e não sai de uma sessão viva: B-05 e B-03 quebrariam. Decidido pelo dono do produto | B-04 revista; [backend/04](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão) |
| 2026-09-24 | [D-10](decisions.md#d-10--dois-caminhos-para-nascer-uma-rotina) — `permission.resolve` e `POST /permission-rules` pela mesma rotina | os códigos 400/422 da D-01 e D-02 pressupõem um pedido com padrão e validade | API `/permission-rules`, `PERMISSION_RULE_NOT_FOUND`, duas variáveis de ambiente |
| 2026-09-24 | [D-11](decisions.md#d-11--o-mais-restritivo-até-onde-o-canusetool-alcança) — `deny` sempre nega; `allow` não auto-aprova em `plan` | "o mais restritivo" só alcança o que passa pelo `canUseTool` | B-06; limitação de `acceptEdits` declarada abaixo |
| 2026-09-24 | Regra que resolve **publica** `permission.resolved` com `auto: true` | a B-03 pede; antes a regra de `session` resolvia sem anunciar | muda o S-60 do [plano 01](../01-live-session/scenarios.md), cujo teste foi atualizado para o comportamento novo |
| 2026-09-24 | Falha da trilha ao conceder **revoga** a regra recém-criada antes de relançar | uma regra que responde sem ninguém poder prestar contas dela é o que a trilha existe para impedir | `GrantPermissionRuleUseCase` |
| 2026-09-24 | Pedido resolvido **enquanto** as regras são lidas não é perguntado de novo | a leitura é uma espera nova entre registrar e perguntar; sem a checagem, um pedido já respondido ganharia prazo e card | `RequestPermissionUseCase`; o teste unit do bridge passou a esperar um tick real |
| 2026-09-24 | [D-12](decisions.md#d-12--o-alcance-vem-na-pergunta) — a sugestão de `project`/`always` carrega `pattern` e `lifetimeMs` | a B-08 pede a validade à vista, e derivar no cliente seria um segundo matcher ou um número escrito à mão | contrato WS (schema, TS e Dart), `requestedPayload`, as duas telas |
| 2026-09-24 | [D-13](decisions.md#d-13--perto-de-expirar-é-sete-dias) — perto de expirar é sete dias, no cliente | a D-02 pediu o sinal e não o limiar | `usePermissionRules`, `PermissionRule.isExpiringSoonAt` |
| 2026-09-24 | [D-14](decisions.md#d-14--escopo-persistido-sempre-pede-o-segundo-passo) — escopo persistido sempre em dois passos | "não perguntar por 90 dias" num toque é o acidente que o segundo passo existe para impedir | `PermissionQueue.stepFor` ganhou o escopo; card do web e do app |
| 2026-09-24 | Falha ao revogar mantém a linha, em vez de trocar a lista pelo erro | a regra continua respondendo; esconder a lista esconderia exatamente o que a tela mostra (S-21) | `usePermissionRules`, `RuleListController` — diferente do padrão de `useDevices` |
| 2026-09-24 | O app ganhou `ApiClient.delete` e a operação de log `permission.rule.revoke` (`info`) | revogar é mudança do que roda sem perguntar, o mesmo tipo de fato que registrar um aparelho | `core/network`, `core/logging` |
| 2026-09-24 | O fake do SDK cunha um `requestId` por chamada de `canUseTool`, não por run | repetido entre turnos da mesma sessão, o segundo turno herdava a resposta do primeiro e mascarava a revogação (S-09) | `test/fakes/agent-sdk/scripted-query.ts` |
| 2026-09-24 | [D-15](decisions.md#d-15--a-correlação-nasce-com-a-entrada) — o veredito (pedido, `auto`, regra, escopo, quem, de onde) é gravado **com** a entrada de decisão | juntar `permission_requests` na leitura faria `audit` ler outro módulo, e a resposta depender de uma tabela reescrita | migration `0009`, `AuditVerdict`, `RecordDecisionOnResolved` |
| 2026-09-24 | [D-16](decisions.md#d-16--o-traceid-é-o-do-turno) — o `traceId` da entrada é o do turno, adotado no `UserPromptSubmit`; o hub carimba o trace em escopo em todo evento | o SDK roda a sessão inteira no contexto do `session.start`: sem isso, um trace por sessão | `SessionRunner`, `SessionHub`, [03-logging](../../architecture/shared/03-logging.md#traceid--como-propaga) |
| 2026-09-24 | [D-17](decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro) — "trilha de outro" é filtrar pela sessão de outra pessoa → `403`; sessão sem entrada → página vazia | não há tabela de sessões; o texto da B-12 e do S-26 ainda dizia `404`, que a D-05 já tinha revertido | B-12, S-26, S-73; texto corrigido |
| 2026-09-24 | [D-18](decisions.md#d-18--a-regra-revogada-tem-endereço) — `GET /permission-rules/:ruleId` em qualquer estado, e `/rules/$ruleId` no web | a D-04 promete a regra revogada "com o estado explicado", e a listagem a omite de propósito | `DescribePermissionRuleUseCase`, `RuleRow` com `revoked`, `RuleDetail` |
| 2026-09-24 | A leitura da trilha é um módulo Nest à parte (`AuditQueryModule`) | `AuthModule` importa `AuditModule`, e o guard da rota precisa do `AuthModule`; além disso, nenhum módulo que escreve recebe como ler | `infrastructure/modules/audit-query.module.ts` |
| 2026-09-24 | O fake do SDK cunha `tool_use_id` próprio a partir do segundo turno — nas mensagens e nos hooks; o primeiro é a gravação byte a byte | repetido entre turnos, o segundo turno era uma **reentrega** do primeiro, e a trilha — que descarta reentrega de propósito — não gravava nada dele. Mascarava o S-76, e mascarava em silêncio o hook do segundo turno em toda suíte de vários turnos | `test/fakes/agent-sdk/scripted-query.ts` |
| 2026-09-24 | De uma `Read` saem só `file_path`, `offset`, `limit` e `pages` — lista de permissão | o campo que vaza é o que ninguém pensou em negar | `disclosedInput`, [backend/03](../../architecture/backend/03-modules.md#audit) |
| 2026-09-24 | [D-19](decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga) — `audit_purges`, uma linha por lote, gravada pela mesma instrução que apaga | `audit_events` exige dono e sujeito, e um registro gravado depois do `DELETE` abria uma janela sem rastro | migration `0010`, `DrizzleAuditRetentionStore` |
| 2026-09-24 | [D-20](decisions.md#d-20--a-trilha-são-as-duas-tabelas) — a purga varre `audit_entries` e `audit_events`, independentes | as duas têm o mesmo piso, e a falha de uma não pode deixar a outra crescer | `PurgeAuditTrailUseCase` |
| 2026-09-24 | [D-21](decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário) — o piso da trigger passa a `interval '2160 hours'` | `interval '90 days'` oscila uma hora com o horário de verão do fuso da sessão, e o código conta 90 × 24 h | migration `0010` reescreve as duas funções; as triggers e as migrations aplicadas ficam intocadas |
| 2026-09-24 | [D-22](decisions.md#d-22--o-job-o-botão-de-desligar-e-o-que-o-comando-lê) — primeira purga um minuto após o boot; `off` literal; o comando lê só três variáveis | a D-07 não dizia nenhum dos três | `AuditPurgeJob`, `loadDatabaseConfig`, `RC_AUDIT_*` |
| 2026-09-24 | O `DeviceExpiryJob` passou a estender `PeriodicJob` | o job da purga repetiria o arme, o rearme e o desligamento dele | `infrastructure/jobs/periodic-job.ts`; testes do job de aparelhos intactos |
| 2026-09-24 | O store da purga ouve `error` no cliente que segura durante a execução | o pool só ouve clientes ociosos; uma conexão derrubada no meio de um lote emitiria `error` sem ouvinte e derrubaria o processo — foi o teste de interrupção (S-37) que mostrou | `DrizzleAuditRetentionStore` |
| 2026-09-24 | No stack efêmero do e2e o job da purga fica `off` | o job acordaria um minuto após o boot e disputaria com a spec as mesmas linhas e o mesmo lock | `ephemeralEnvironment`; o job é provado nas suítes do backend |
| 2026-09-24 | O `db.mjs` lê o relatório da **última linha que é um relatório**, não da última linha | `pnpm --filter … exec` escreve a própria queixa de exit code no stdout depois do comando — justo quando a purga falha | `scripts/lib/purge-report.mjs`, `runReporting` |

| 2026-09-24 | S-45 e B-23 passam a dizer `403 FORBIDDEN` | a [D-05](decisions.md#d-05--de-quem-é-a-trilha) já nomeava o S-45 como `403`, e a [D-17](decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro) corrigiu o S-26 e a B-12 sem levar junto as duas linhas da F4. Texto velho, não conflito: nada a escalar | [scenarios.md](scenarios.md), [F4](F4-e2e.md) |
| 2026-09-24 | S-92 entra na matriz — a purga com uma sessão aberta | a B-23 pede "a purga não afeta a trilha da sessão corrente" e a matriz não tinha linha para isso. É `conc`: a purga roda **com** a sessão de pé, e ela segue gravando depois | [scenarios.md](scenarios.md) |
| 2026-09-24 | `saveRevocation` diz se **esta** chamada revogou; só ela entra na trilha | duas revogações simultâneas liam a regra ativa, as duas registravam `permission.ruleRevoked` e a perdedora respondia o próprio instante, não o que a linha guardou. O `UPDATE … WHERE revoked_at IS NULL` já impedia a segunda escrita, mas nada olhava o resultado. Foi a S-46 que mostrou, antes de rodar: escrevendo o teste | `PermissionRuleRepository.saveRevocation` → `RuleRevocation`; `RevokePermissionRuleUseCase`; o fake em memória; [backend/03](../../architecture/backend/03-modules.md#permission) |
| 2026-09-24 | `/audit` volta do login **com** os filtros | `returnTo="/audit"` fixo: o link de uma trilha filtrada, aberto deslogado, caía na trilha inteira — o contrário de "a trilha filtrada é um link". A S-43 abre esse link, e mostrou | `auditLocation` em `web/src/app/AuditRoute.tsx`; [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria) |
| 2026-09-24 | O app diz "por uma das suas regras" em toda resolução automática que não é prazo | a frase dizia "uma regra desta sessão", e desde a F0 a regra de projeto e a de sempre também publicam `auto: true`. O evento não traz o escopo, então a frase não o diz. Na S-44 pelo app era o próprio celular que tinha concedido a regra de sempre | `permissionOutcomeAllowedByRule`/`RefusedByRule` nos dois idiomas; [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) |
| 2026-09-24 | As specs da F4 terminam revogando **toda** regra do usuário, dê o caso certo ou errado | uma regra `always` que sobrevivesse a um caso falho responderia a escrita de todas as specs seguintes da mesma pilha, e a falha apareceria longe da causa | `afterEach` de `rule-cycle.spec.ts` e `trail-isolation.spec.ts`; `revokeEveryRule` no app |
| 2026-09-24 | O S-41 prova o pedido seguinte numa **segunda** sessão | na mesma sessão, uma regra `session` responderia igual, e o teste não distinguiria `always` de `session` | `rule-cycle.spec.ts` |
| 2026-09-24 | A S-46 conta a revogação lendo `audit_events` no banco | nenhuma tela lista a trilha de conta; é a única prova de "uma revogação". As duas respostas iguais e o `GET` da regra são pela porta do usuário | `trail-isolation.spec.ts`; comentário de `e2e/fixtures/environment.ts` |
| 2026-09-24 | Chamada HTTP, entrada no navegador, fim de sessão e purga viraram fixture do e2e | cada spec nova repetiria o que `devices.ts`, `rules.spec.ts` e `retention.spec.ts` já faziam à mão — e o portão de duplicação tem limiar zero | `e2e/fixtures/{api,rules,retention}.ts`, `openSignedIn`, `closeSession`; no app, `integration_test/support/signed_in_app.dart` |
---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-24 | **B-04 como escrita** — devolver `updatedPermissions` ao SDK | [D-09](decisions.md#d-09--a-regra-nossa-é-a-única-autoridade): quebraria revogação na sessão viva e a visibilidade do que a regra autorizou. A tarefa entregou a garantia oposta, provada por teste | revista, não adiada — reabre se o SDK ganhar como retirar regra da sessão viva |
| 2026-09-24 | `deny` nosso sobre edição em sessão `acceptEdits` | o CLI aprova edição nesse modo sem chamar o `canUseTool`; fechar exigiria decidir no hook `PreToolUse`, que a ADR-011 mantém só registrando ([D-11](decisions.md#d-11--o-mais-restritivo-até-onde-o-canusetool-alcança)) | sem dono ainda — candidato ao [plano 05](../05-hardening-operations/README.md), junto dos limites |
| 2026-09-24 | S-08 em nível de integração | o `deny` das settings de projeto é aplicado pelo **CLI**, que a suíte hermética não roda; está medido na descoberta §8.2. O que é nosso — nenhuma regra devolvida, `settingSources: ['project']` — está provado em unit | a matriz registra o nível real (unit) |
| 2026-09-24 | `project`/`always` nos `suggestions` do `permission.requested` | oferecê-los é das telas que dizem o alcance com todas as letras; o backend já aceita os quatro escopos | [F1](F1-rules-ui.md) — B-08, B-10 · **entregue na F1**, com D-12 |
| 2026-09-24 | F1 — o ciclo "a próxima execução pergunta de novo" pela porta do usuário | o S-16 prova a linha saindo da tela e a regra saindo do servidor; que o pedido seguinte volta a perguntar está provado na integração do backend (S-09) e é o S-42 da F4 | [F4](F4-e2e.md) · **entregue na F4**: revogar pela tela `/rules` faz a sessão já aberta perguntar de novo |
| 2026-09-24 | F1 — a trilha como segundo ponto de entrada de `/rules` | a D-04 exige dois; a trilha nasce na F2 | [F2](F2-audit-query.md) — B-15 · **entregue na F2**, com D-18 |
| 2026-09-24 | F1 — o `integration_test` do app para a tela de regras | precisa do emulador e não é portão; os cenários do app rodam em unit e widget, e o de duas pontas (S-44) é da F4 | [F4](F4-e2e.md) · **entregue na F4**: `integration_test/rule_cycle_test.dart` concede pelo card, revoga pela tela de regras e disputa a revogação com o navegador (S-44, S-46), 8/8 no emulador |
| 2026-09-24 | E2E das regras | a fase pede `pnpm verify` e `pnpm test:integration`; o ciclo pela porta do usuário é a [F4](F4-e2e.md) (S-41…S-46). O e2e existente segue rodando no `verify:full` | [F4](F4-e2e.md) · **entregue na F4** |
| 2026-09-24 | F2 — E2E da trilha | a fase pede `pnpm verify` e `pnpm test:integration`; a trilha pela porta do usuário é o S-43 e o S-45 da [F4](F4-e2e.md). Os três níveis existem: unit, integração com PostgreSQL e socket reais, e a tela com o roteador real | [F4](F4-e2e.md) · **entregue na F4**: S-43 pela API e pela tela, S-45 pelas duas |
| 2026-09-24 | F2 — a trilha no app | a B-13 é só do web. O app lista e revoga regras (F1), mas não tem tela de trilha — e portanto não tem o segundo ponto de entrada da D-04 | sem dono ainda — nenhuma fase pede a trilha no app |
| 2026-09-24 | F2 — veredito nas decisões gravadas antes da `0009` | reconstruí-lo seria a trilha afirmar o que não registrou; a tela diz que a ligação não existe | não se recupera, por desenho ([D-15](decisions.md#d-15--a-correlação-nasce-com-a-entrada)) |
| 2026-09-24 | F3 — retenção de `permission_requests` | não é trilha — é o estado de um pedido, reescrito ao resolver —, não tem trigger nem piso, e a F3 fala da trilha ([D-20](decisions.md#d-20--a-trilha-são-as-duas-tabelas)). Cresce sem limite | sem dono ainda — candidato ao [plano 05](../05-hardening-operations/README.md) |
| 2026-09-24 | F3 — a trilha da purga numa tela | `audit_purges` é consultável por SQL e o job loga cada execução; nenhuma tela mostra "o que a purga levou" | sem dono ainda |
| 2026-09-24 | F3 — S-88 prova a fronteira de 2160 h sob um fuso não-UTC, **não** a diferença para o calendário | a diferença só aparece numa janela que atravessa a volta do horário de verão, e isso depende da data em que a suíte roda; um teste que só falha em certos meses é flaky por construção | a razão está na [D-21](decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário) e no comentário da `0010` |

| 2026-09-24 | F4 — a S-46 pelo app não é simultânea como pela API | o toque no botão e a requisição do "navegador" saem da mesma thread do teste; a do navegador sai antes, e o toque chega com ela em voo. A simultaneidade de verdade está provada na integração (duas escritas com instantes diferentes, e `Promise.all` contra o PostgreSQL) e no e2e pela API | a razão está no comentário do teste |
---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Regra larga demais reintroduz o furo do `settingSources` | 🔲 aberto | matcher é regra pura, com fronteiras próprias (S-05…S-07) |
| R-02 | `always` é, na prática, "não me pergunte mais" | 🔲 aberto | a tela diz isso sem eufemismo (S-17), e revogar é um clique |
| R-03 | Trilha grande torna consulta lenta e purga longa | ✅ mitigado | consulta: o plano de execução sobre 40 mil linhas usa `(user_id, seq DESC)` e `(session_id, seq DESC)`, sem varredura e sem ordenação (S-28). Purga: lotes de mil sobre o índice novo em `at`, sem bloquear escrita (S-38) |
| R-04 | Purga e append-only convivem mal | ✅ mitigado | D-08: trigger barra `DELETE` dentro do piso (S-52); purga por janela, em lote, sob lock (S-51), e cada lote registrado na mesma instrução que o apaga (S-85, D-19) |

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
