# Plano 00 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Atualizado a cada ciclo de trabalho. Os **contadores** — barras, linha de cada fase, total e
contagem de cenários — saem de `pnpm plan progress`, lidos dos arquivos de fase e do
`scenarios.md`. O resto é escrito à mão.

---

## Estado atual

**Fase corrente:** nenhuma — **F0…F7 concluídas**, B-40 fechada com a primeira execução verde do
`integration_test` do Flutter
**Última atualização:** 2026-09-16
**Bloqueios:** nenhum. Um achado em aberto, que não bloqueia o plano: **S-119** — o app envia
`session.detach`, comando que não existe em `packages/contracts` nem no backend, e volta como
`INVALID_INPUT`/`unknownCommand`. Não foi corrigido aqui porque comando WS é contrato e se muda
nas três pontas de uma vez ([05](../../architecture/shared/05-websocket-protocol.md)); vai para o
plano seguinte.

**Como está provado:** `pnpm verify:full` foi executado inteiro e **saiu com código 0** — os onze
portões verdes, pela primeira vez desde que o plano começou. O portão 9 agora tem comando:
`pnpm test:e2e` sobe uma stack efêmera em portas aleatórias, roda as 10 specs e derruba tudo,
saindo com o código dos testes.

E o que faltava provar está provado: `pnpm test:e2e:mobile` **saiu com código 0** — `All tests
passed!`. Fecha S-62 e S-116, e a execução ainda achou dois defeitos novos (S-118, corrigido, e
S-119, em aberto). O emulador rodou cercado por cgroup — 4 núcleos e 7 GB de teto rígido —, e a
máquina ficou de pé do começo ao fim; a receita está na [F6](F6-scripts-e2e.md#como-rodar-sem-derrubar-a-máquina).

| Portão | | Portão | |
|---|---|---|---|
| 1 formatação | ✅ 4,0 s | 7 cobertura | ✅ 140,7 s |
| 2 lint | ✅ 6,6 s | 8 integração | ✅ 88,6 s |
| 3 tipagem | ✅ 7,2 s | 9 e2e | ✅ 32,5 s · 10 specs |
| 4 arquitetura | ✅ 20,4 s | 10 segurança | ✅ 6,7 s |
| 5 duplicação | ✅ 1,4 s | 11 contrato e i18n | ✅ 0,3 s |
| 6 unit | ✅ 48,0 s | | |

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
```

**O que o primeiro e2e encontrou.** Três defeitos no front que **nenhum** nível anterior alcançava,
todos no caminho que todo usuário percorre no primeiro segundo: o `ApiClient` chamava `fetch` com o
receptor errado e nenhum request saía do browser; o `401` de `/auth/refresh` era re-tentado
renovando, e a renovação esperava por si mesma; e o callback do login reprovava a si mesmo ao ser
montado duas vezes. Mais um quarto na ponta mobile: o app Android não compilava, por um placeholder
de manifest que o `flutter analyze` não tem como ver. Estão na matriz como S-113…S-116.

**O que ainda não está provado:** a execução verde do `integration_test` do Flutter. Tudo o mais da
F6 está verde e repetível.

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-foundation.md) | B-01…B-06, B-48, B-49, B-52 | 9/9 | ✅ |
| [F1](F1-infrastructure.md) | B-07…B-10, B-50 | 5/5 | ✅ |
| [F2](F2-contracts.md) | B-11…B-14 | 4/4 | ✅ |
| [F3](F3-backend.md) | B-15…B-23, B-51 | 10/10 | ✅ |
| [F4](F4-web.md) | B-24…B-30 | 7/7 | ✅ |
| [F5](F5-mobile.md) | B-31…B-36 | 6/6 | ✅ |
| [F6](F6-scripts-e2e.md) | B-37…B-40 | 4/4 | ✅ |
| [F7](F7-gates-ci.md) | B-41…B-47 | 7/7 | ✅ |
| **Total** | **B-01…B-52** | **52/52** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 119 | 1 | 0 | 118 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 6 | 0 | 0 | 5 | 1 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).
Registrar o vermelho é o que permite ver padrão — três ciclos seguidos caindo no mesmo portão
é sinal de problema de desenho, não de descuido.

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-13 | F0 | 1 — formatação | 6 arquivos fora do estilo do Prettier | `pnpm format` | verde no reinício |
| 2 | 2026-09-13 | F0 | 5 — duplicação | `run` e `runAttached` de `scripts/lib/exec.mjs` compartilhavam 9 linhas | extraído `invoke()`, a única diferença virou parâmetro | 0 clones |
| 3 | 2026-09-13 | F0 | 6 — unit | `.env.example` tinha comentário por bloco, não por variável — o teste de B-05 reprovou | comentário próprio para cada variável | 105 unit verdes |
| 4 | 2026-09-13 | F0 | 6 — unit | teste do CLI do `doctor` dependia da máquina (falta `docker compose` aqui) | passou a exigir **coerência** entre saída e código de saída, não um ambiente específico | 8 integração verdes |
| 5 | 2026-09-13 | F1 | 1 — formatação | 3 arquivos novos fora do estilo | `pnpm format` | verde no reinício |
| 6 | 2026-09-13 | F1 | 5 — duplicação | os dois clients OIDC do realm do Keycloak compartilham 16 linhas | `infra/**` excluído no `.jscpd.json` — ver decisões | 0 clones |
| 7 | 2026-09-13 | F1 | 6 — unit | `kill()` não derrubava processo que não lidera grupo próprio: `process.kill(-pid)` dava `ESRCH` e o erro era engolido | fallback para o pid puro quando o grupo não existe | 11 verdes em `proc.spec` |
| 8 | 2026-09-13 | F1 | 8 — integração | `pnpm dev` **saía sozinho** depois de imprimir o quadro: sem processo em watch (F3/F4 não existem), nada segurava o event loop | handle explícito de foreground, liberado no cleanup | 7 verdes contra Docker real |
| 9 | 2026-09-13 | F2 | 2 — lint | `no-unused-vars` no rest-destructuring usado para omitir campo no teste | helper `without()`, sem tocar no config do ESLint | verde |
| 10 | 2026-09-13 | F2 | 3 — tipagem | frame não podia estreitar `payload` herdado do envelope, e o guard recastava um valor já estreitado | `Omit<Envelope, …>` no frame; guard usa o valor estreitado | verde |
| 11 | 2026-09-13 | F2 | 5 — duplicação | `BANNER` e `docComment` duplicados entre os dois emissores; e o Dart gerado clonava a si mesmo | extraído `contracts-emit.mjs`; Dart passou a ser `protocol.g.dart`, que a exclusão de gerado já cobria | 0 clones |
| 12 | 2026-09-13 | F2 | 6 — unit | `messageSchemas` relativizava caminho duas vezes e lia os schemas **do repositório**, não os do diretório recebido | relativização só no fim do walk | 12 verdes em `contracts-io.spec` |
| 13 | 2026-09-14 | F3 | 1 — formatação | 22 arquivos novos fora do estilo | `pnpm exec prettier --write backend` | verde no reinício |
| 14 | 2026-09-14 | F3 | 5 — duplicação | o guard `safeParse` + `toValidationError` estava copiado nos dois handlers WS, e os dois adapters de identidade compartilhavam 5 linhas de import | extraído `payloadOf(frame, schema)`; pares `import { X }` + `import type { X }` colapsados numa linha | 0 clones |
| 15 | 2026-09-14 | F3 | 5 — duplicação | os dois handlers WS ainda compartilhavam import + construtor, porque ambos injetavam o `SessionHub` | o transporte saiu do handler e entrou no `WsCommandContext` (`attach`, `replay`, `publish`); `adapter/inbound/ws` deixou de importar o hub | 0 clones, e uma dependência a menos |
| 16 | 2026-09-14 | F3 | 7 — cobertura | 3 arquivos abaixo de 90 % em `branches`: o ramo não-HTTP do interceptor, o logger sem destino, e o token sem `sub` | um teste para cada ramo — nenhum limiar tocado | 98,8 % statements · 97,6 % branches |
| 17 | 2026-09-14 | F3 | 4 — arquitetura | o `dependency-cruiser` dizia "no violations" **sem olhar nada**: as regras casavam o nome do pacote, e a ferramenta casa o caminho **resolvido** | padrões passaram a casar `node_modules/<nome>/`, e `test/unit/architecture` passou a provar que cada regra dispara | 7 regras, todas provadas |
| 18 | 2026-09-14 | F3 | 7 — cobertura | `database/cli.ts`, entrada do `pnpm db`, entrou na medição com 0 % | excluído com justificativa, como `main.ts`; a lógica dele mora em `operations.ts`, coberta por integração | verde |
| 19 | 2026-09-14 | F4 | 2 — lint | `react-hooks/set-state-in-effect`: o `isSending` da tela era mantido em sincronia por um efeito | passou a ser **derivado** do nonce em voo — sem efeito, sem render em cascata | verde |
| 20 | 2026-09-14 | F4 | 2 — lint | `jsx-a11y/heading-has-content`: o `CardTitle` repassava `children` por spread, e a regra não enxerga | `children` explícito | verde |
| 21 | 2026-09-14 | F4 | 4 — arquitetura | o `eslint-plugin-boundaries` v7 **não classificou um único arquivo**: o portão passava sem inspecionar nada | trocado por `no-restricted-imports` por escopo de pasta, e `test/unit/architecture/web-chain.spec.ts` prova cada regra disparando | 13 regras provadas |
| 22 | 2026-09-14 | F4 | 5 — duplicação | os primitivos gerados do shadcn/ui repetem a mesma assinatura | `web/src/shared/components/ui/**` excluído no `.jscpd.json` — território gerado, ver decisões | 0 clones |
| 23 | 2026-09-14 | F3+F4 | 5 — duplicação | **no repositório inteiro** apareceram 6 clones que nenhum workspace vê sozinho: a regra de config back ↔ web, o limiar de cobertura nos dois `vitest.config.ts`, o preâmbulo dos dois `tsconfig.json`, o `repoRoot` de oito scripts, e a regra cross-feature escrita quatro vezes no ESLint | extraídos `packages/config` (`ConfigurationError` + `parseEnvironment`), `scripts/lib/coverage.mjs`, `scripts/lib/paths.mjs` e a constante `CROSS_FEATURE`; os comentários dos dois `tsconfig.json` passaram a dizer coisas diferentes, porque são runtimes diferentes | 0 clones |
| 24 | 2026-09-14 | F2 | 6 — unit | `contracts-guards.spec` fixava os 4 `FRAME_TYPES` do handshake, e a fatia vertical acrescentou 5 | a lista esperada passou a ser a do contrato atual — o teste existe para **notar** a mudança, e notou | 262 verdes |
| 25 | 2026-09-14 | F1 | 8 — integração | `stack.spec` esperava `backend — not created yet`; agora o workspace existe e a linha é `backend watch` | a asserção passou a aceitar as duas formas, que é o que ela sempre quis dizer | 27 verdes contra Docker real |
| 26 | 2026-09-14 | F4 | 7 — cobertura | o teste que roda o ESLint de verdade estourou o timeout padrão de 5 s na primeira chamada (resolver o flat config custa ~6 s) — **flaky por construção** | aquecimento em `beforeAll` e prazo explícito para a ferramenta; nenhuma asserção enfraquecida. Três execuções seguidas verdes | 217 verdes |
| 27 | 2026-09-14 | F6 | `test:e2e:mobile` — fora do portão | emulador cercado com `MemoryHigh=3G`, **abaixo** do working set anônimo real (~3,5 GB): o kernel recuperou página sem ter o que recuperar e as threads de vCPU travaram (`detected a hanging thread 'QEMU2 CPU0 thread'`) | teto rígido folgado e **sem** `MemoryHigh`; 4 núcleos, `MemoryMax=7G` | emulador estável de ponta a ponta |
| 28 | 2026-09-14 | F6 | `test:e2e:mobile` — fora do portão | **S-118**: o teste sobrescrevia a configuração mas não o `appLoggerProvider`, que lança por desenho fora do boot — o primeiro widget que o lia derrubava a árvore com `ProviderException` | passou a usar `bootstrapOverrides`, o mesmo helper do `main.dart`, em vez de repetir metade do boot à mão | `All tests passed!`, exit 0 |

| 27 | 2026-09-14 | F5 | 2 — lint | `riverpod_lint` (e o `custom_lint` que só existe para hospedá-lo) exige Dart ≥ 3.13; o toolchain deste repositório é 3.12.2, e a resolução do `pub` reprovava | os dois saíram do `pubspec.yaml`; as regras que interessam ficam no `dart analyze` estrito e no teste de arquitetura | verde |
| 28 | 2026-09-14 | F5 | 2 — lint | `public_member_api_docs` exigia comentário em **todo** construtor e **todo** valor de enum — 55 avisos de "Creates a X" | a regra saiu do conjunto, e os membros que carregam informação de verdade (os estados de `ConnectionStatus`, os campos de `FailureDetail` e de `LogContext`) ganharam documentação | verde |
| 29 | 2026-09-14 | F5 | 2 — lint | `prefer_initializing_formals` em 20 construtores | convertidos para initializing formal **privado** (`required this._x`), que o Dart 3 expõe no call site pelo nome público — nenhuma chamada mudou | verde |
| 30 | 2026-09-14 | F5 | 6 — unit | o `SessionStreamController` lia o **próprio** provider para responder `lastSeq`: `A provider cannot depend on itself` | passou a ler o próprio `state`; o teste que o pegou é o que prova o replay resumindo do `seq` certo | 30 verdes |
| 31 | 2026-09-14 | F5 | 6 — unit | `WsClient.statuses` era um `async*`: o valor atual chegava um microtask depois da inscrição, e uma tela montada antes da primeira transição não via estado nenhum | virou `Stream.multi`, que emite **na inscrição** | 38 verdes em `ws_client_test` |
| 32 | 2026-09-14 | F5 | 5 — duplicação | 8 clones no mobile: o preâmbulo de `build` repetido entre telas, o `Padding`+`Column` de cada estado, e os corpos de `signIn` e `renew` | extraídos `ContentColumn`, `identifierStyle()` e `_complete()`; a tela de ida e volta virou `_SignOutAction` + `_RoundTrip` + `_ConnectionLine`, que é o que [mobile/04](../../architecture/mobile/04-ui.md) pede de qualquer modo | 0 clones |
| 33 | 2026-09-14 | F7 | 4 — arquitetura | `dart run import_lint` lista as violações e **sai 0 de qualquer jeito** — o terceiro portão deste repositório incapaz de reprovar, depois do `dependency-cruiser` e do `eslint-plugin-boundaries` | passou a rodar atrás de `scripts/mobile.mjs arch`, que lê a saída e sai com a verdade; `test/integration/scripts/gates.spec.mjs` vê o portão reprovar | 9 regras, todas provadas |
| 34 | 2026-09-14 | F7 | 5 — duplicação | `verify-workspace.mjs` e o novo `lib/verify.mjs` compartilhavam o laço de relatório, e `i18n-check` e `scan-security` compartilhavam a varredura de diretório | extraídos `reportOutcome`/`reportVerdict` e `scripts/lib/files.mjs` | 0 clones |
| 35 | 2026-09-14 | F7 | 7 — cobertura | o portão de cobertura da raiz, que passou a existir nesta fase, encontrou **14** arquivos de `scripts/lib` abaixo da barra | teste para todo caminho alcançável; ramo impossível **removido** onde dava (`version`, `ports`, `plan-progress`), e os três que sobraram no `proc` — a chamada de `taskkill`, o erro que não é `ESRCH`, a corrida com a saída do processo — marcados com `/* v8 ignore */` **e a justificativa na linha** | 99,45 % statements · 95,78 % branches |
| 36 | 2026-09-14 | F7 | 11 — i18n | o `i18n:check` recém-escrito achou 3 chaves órfãs no catálogo do web: `common.action.cancel`, `.signIn` e `.signOut` | apagadas, e o teste que afirmava sobre uma delas passou a afirmar sobre `common.action.retry`, que existe | verde nas duas famílias |
| 37 | 2026-09-14 | F7 | 7 — cobertura | o número do mobile mudava entre execuções: o teste de arquitetura escreve fixtures dentro de `lib/` enquanto o `flutter test --coverage` mede | `lib/**/_arch_*.dart` declarado como exclusão, com a razão no próprio config | estável |

| 38 | 2026-09-14 | F6 | 9 — e2e | o login pelo navegador reprovava com `Invalid parameter: redirect_uri`: o realm registrava `http://localhost:5173/*`, e a stack efêmera serve o front numa porta aleatória. O curinga de porta (`localhost:*`) **não** é aceito pelo Keycloak | os redirects do client web passaram a ser **sem porta** (`http://localhost/*`), que é o tratamento de loopback da RFC 8252 e casa qualquer porta. Verificado contra um Keycloak real antes de escrever | login verde |
| 39 | 2026-09-14 | F6 | 9 — e2e | **nenhum** request saía do browser: `ApiClient` guardava `private readonly http = fetch` e o chamava como `this.http(...)`, o que faz do cliente o receptor — o browser responde "Illegal invocation" antes de um byte sair. Invisível para o jsdom, que não reclama do receptor | o default virou `(input, init) => globalThis.fetch(input, init)`, e um teste afirma que o receptor é o global (S-113) | o front fala com o backend |
| 40 | 2026-09-14 | F6 | 9 — e2e | com o request funcionando, a tela passou a **carregar para sempre**: o `401` de `/auth/refresh` era re-tentado renovando, e a renovação é a própria chamada — a promessa esperava por si mesma | `RequestOptions.renewable`, `false` nas três chamadas de sign-in, com o porquê no tipo (S-114) | tela decide em milissegundos |
| 41 | 2026-09-14 | F6 | 9 — e2e | o callback reprovava com `state did not match` **depois** de ter trocado o código com sucesso: montado duas vezes, a segunda montagem encontrava o `state` já consumido pela primeira | `completeLogin` deduplica pelo código enquanto a troca está em voo — o mesmo idioma do `renewSession` —, e esquece assim que ela termina (S-115) | login verde |
| 42 | 2026-09-14 | F6 | 9 — e2e | o replay (S-27) afirmava sobre um stream que ainda estava chegando: o `ack` sai **antes** dos eventos que ele anuncia | o teste espera o último `seq` anunciado antes de ler a lista. Nada no produto mudou: a ordem estava certa, a asserção é que era cedo | S-27 e S-28 verdes |
| 43 | 2026-09-14 | F6 | 9 — e2e | o React do bundle era o de **desenvolvimento**: o Vite entrega `process.env.NODE_ENV` ao bundle, e a stack efêmera exporta `NODE_ENV=test` para o backend | o build e o `preview` do web rodam com `NODE_ENV=production`; o backend continua em `test` | o e2e exercita o artefato real |
| 44 | 2026-09-14 | F6 | e2e do mobile | o app Android **não compilava**: o `flutter_appauth` declara um intent filter com o placeholder `appAuthRedirectScheme`, e o merger do manifest recusa sem valor. Nenhum portão da F5 alcançava isso — `flutter analyze` e `flutter test` não constroem o APK | `manifestPlaceholders["appAuthRedirectScheme"]` no `build.gradle.kts`, apontando para o mesmo esquema registrado no realm (S-116) | correção aplicada, **execução verde não confirmada** — ver [escopo](#escopo-reduzido-ou-adiado) |
| 45 | 2026-09-14 | F6 | 6 — unit | o `env-example` reprovou o `playwright.config.ts`: ele lia `process.env['CI']` para escolher o reporter, e `CI` não é variável deste repositório | reporter fixo em `list`. Saída escolhida pelo ambiente é saída que ninguém consegue reproduzir quando o CI fica vermelho | verde |
| 46 | 2026-09-14 | F6 | 6 — unit | `eslint-config.spec` estourou os 5 s padrão: resolver o flat config custa segundos e acontece na **primeira** chamada, não no construtor — o primeiro `it` pagava a conta. Mesmo defeito do ciclo 26, no outro arquivo | aquecimento no `beforeAll` e prazo explícito de hook. Teste cujo resultado depende de quem rodou primeiro é flaky por construção | verde |
| 47 | 2026-09-14 | F6 | 6 — unit | seis testes do `auth_controller` e do `app_test` quebraram sozinhos: a fixture fixava 2026-09-14 12:00 e o grafo real de providers lê o relógio de parede. Às 12:48 daquele dia a sessão passou a precisar de renovação — **bomba-relógio**, não regressão | a fixture passou a ser relativa a um `now` capturado no carregamento; a regra de renovação continua testada com relógio injetado onde ela mora | verde, em qualquer dia |
| 48 | 2026-09-14 | F6 | 7 — cobertura | `dartDefines` sem teste, e três `?? ''` que **nada alcança** — `ephemeralEnvironment` sempre devolve aquelas chaves | teste para `dartDefines`, e um typedef nomeado no lugar de `Record<string, string>`: sem o tipo largo não há `undefined` a silenciar, e some o ramo impossível (a regra do ciclo 44 do F7) | 100 % em `stack.mjs` |
| 49 | 2026-09-14 | F6 | 7 — cobertura | `Timeout calling "onTaskUpdate"`: `gates.spec` segura a thread do worker por 48 s dentro de um `spawnSync`, e o vitest desiste do worker que parou de responder. 467 testes verdes, e a execução vermelha por um erro que não é de nenhum teste | `runAsync` em `scripts/lib/exec.mjs` — capturar sem bloquear — e os dois specs de integração passaram a usá-lo | sem erro não tratado |
| 50 | 2026-09-14 | F6 | 5 — duplicação | as duas linhas de `...(options.cwd === undefined ? {} : …)` apareceram em três spawns | extraído `spawnLocation`, com a razão de existir no doc: `{ cwd: undefined }` não é o mesmo que omitir `cwd` | 0 clones |
| 51 | 2026-09-14 | F6 | 7 — cobertura | `lib/app/app.dart` em 85,7 %: o construtor `const` nunca **executa**, porque `const RemoteClaudeApp()` é dobrado na constante em tempo de compilação. Sozinho o arquivo media 100 %; na suíte inteira, 0 naquela linha | o widget test monta o app com uma `Key` de runtime e afirma que ele responde por ela — o construtor passa a rodar, e a asserção diz algo verdadeiro sobre o widget | 100 % em `app.dart` |

| 38 | 2026-09-14 | F7 | 10 — segurança | a primeira execução do `scan:security` acusou 21 violações das regras do produto, **todas falsas**: `client.query(sql)` e `pool.query(sql)` do migrator casavam com o padrão de `query(` | o padrão passou a exigir a chamada **nua**, que é como o Agent SDK é importado; o teste que "provava" o contrário estava errado — passava um `repository.query({...})` que já trazia as duas opções | 93 arquivos, 0 violações |
| 39 | 2026-09-14 | F7 | 10 — segurança | o `pnpm audit` reprovou de verdade: `multer` < 2.3.0, negação de serviço por índice de array gigante em nome de campo, transitivo pelo `@nestjs/platform-express` | `pnpm.overrides` fixando `multer >= 2.3.0` — a correção que o portão pede, não uma exceção ao aviso | 0 advisories `high` |
| 40 | 2026-09-14 | F7 | 11 — contrato | `dart format` reindentava o `protocol.g.dart`, e aí o `contracts:check` reprovava; regenerar reprovava o `format:check`. Os dois estavam certos pelas próprias regras, e reescreviam um ao outro | o emissor passou a marcar `// dart format off` no gerado — território de gerador, do qual o formatador não tem o que dizer, como o analyzer já assumia | os dois verdes |
| 41 | 2026-09-14 | F7 | 5 — duplicação | os dois jobs do `ci.yml` repetiam as oito linhas de checkout, setup e install | viraram `.github/actions/setup`, uma composite action — que é também o que impede a versão do Node e a do Flutter de divergirem entre jobs | 0 clones |

Os ciclos 2 e 3 são o portão fazendo o que devia: o `jscpd` achou duplicação que eu não tinha
visto, e o teste do `.env.example` reprovou o próprio `.env.example` que eu tinha acabado de
escrever. O ciclo 4 é o oposto — o portão estava certo e o **teste** estava errado.

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente. Decisão
registrada só aqui é decisão que se perde.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-13 | Estado da task fica no **fim do título** da task, no arquivo da fase | `plan --progress` precisa de uma fonte da verdade por task; marcar onde o trabalho acontece e derivar o resto impede o diário de divergir do plano | [formato de plano](../README.md#o-que-cada-arquivo-contém), `scripts/lib/plan-progress.mjs` |
| 2026-09-13 | Saída de script passa por `scripts/lib/ui.mjs` (`process.stdout.write`), nunca `console` | mantém `no-console` ligado em **todo** o repositório, sem exceção no config — exceção no config exigiria ADR | `eslint.config.mjs`, todos os scripts |
| 2026-09-13 | `jscpd` com `threshold: 0` | [09](../../architecture/shared/09-code-quality.md#linhas-repetidas) pede "**zero** blocos duplicados acima do limiar"; 3 % é a métrica do Sonar, que ainda não existe. Exclusão declarada no config, nunca por comentário | `.jscpd.json` |
| 2026-09-13 | `secrets-scan.mjs` cai na imagem Docker quando não há `gitleaks` | Docker já é pré-requisito duro (R-05). A alternativa era o hook passar em silêncio em quem não tem o binário — portão que se pula sozinho não é portão | `.husky/pre-commit`, `README.md` |
| 2026-09-13 | Prettier **não** formata `*.md` | reflui tabela e edita amostra de código dentro do documento (chega a inserir vírgula em JSON de exemplo). O que guarda a documentação é o `docs:check` | `.prettierignore` |
| 2026-09-13 | Aliases ficam no `tsconfig.base.json` e cada workspace declara `"baseUrl": "."` | `paths` resolve contra o `baseUrl` de quem estende; sem isso os aliases apontariam para a raiz do repositório | `tsconfig.base.json`, `scripts/tsconfig.json` |
| 2026-09-13 | `doctor` aceita **as duas formas** de Compose v2: plugin `docker compose` e binário `docker-compose` | são a mesma ferramenta com os mesmos argumentos. Exigir o plugin reprovava máquina com Compose perfeitamente utilizável — foi o "bloqueio" registrado para a F1, que não existia | `scripts/lib/compose.mjs`, `scripts/lib/prerequisites.mjs` |
| 2026-09-13 | Volume do Postgres monta em `/var/lib/postgresql`, não em `/var/lib/postgresql/data` | `postgres:18` mudou a convenção: os dados vão para um subdiretório com o nome da versão, o que permite `pg_upgrade --link` sem cruzar mount. Montar no caminho antigo põe o cluster onde o entrypoint não procura, e o container entra em restart-loop | `docker-compose.yml` |
| 2026-09-13 | O audience mapper fica **em cada client**, não num client scope compartilhado | declarar `clientScopes` no realm **substitui** os built-in do Keycloak: `profile`, `email` e `roles` deixam de existir, e o token perde as claims que o backend usa para provisionar o usuário | `infra/keycloak/realm-remote-claude.json` |
| 2026-09-13 | `infra/**` excluído do `jscpd` | formato de export de produto de terceiro: dois clients OIDC públicos necessariamente repetem as mesmas flags de fluxo, e reordenar chave para enganar o detector seria pior que declarar a exclusão. Mesma categoria de `**/migrations/**`, que já estava lá | `.jscpd.json` |
| 2026-09-13 | Projeto compose vem de `COMPOSE_PROJECT_NAME`, com default `remote-claude` | é a variável do próprio Compose, não uma invenção nossa; é o que permite à suíte subir uma stack descartável sem derrubar o `pnpm dev` de quem está desenvolvendo | `scripts/lib/stack.mjs` |
| 2026-09-13 | Guard gerado **não** valida pertinência a `enum`; valida `const` | `const` é checagem real de compatibilidade (`v: 1`). `enum` fechado em runtime tornaria toda adição de locale ou de `kind` um breaking change para app já publicado na loja | `scripts/lib/contracts-typescript.mjs` |
| 2026-09-13 | Enum vira `String` no Dart, e union de literais no TypeScript | o app publicado precisa sobreviver a um valor acrescentado depois que ele saiu; um `enum` fechado em Dart lançaria | `scripts/lib/contracts-dart.mjs` |
| 2026-09-13 | `connection.ready` é `kind: "ack"`, e o schema mora em `acks/` | conflito entre o [05](../../architecture/shared/05-websocket-protocol.md#handshake) (ack) e a tabela da F2 (`events/`). Perguntado, conforme o AGENTS.md; o 05 é o documento normativo, e a tabela da F2 foi corrigida | [F2](F2-contracts.md), `packages/contracts/schema/acks/` |
| 2026-09-13 | `pnpm doctor`: Node, pnpm e Docker reprovam; Flutter, `gitleaks` e porta ocupada avisam | nenhum dos três impede o repositório de funcionar, e porta fixa ocupada se resolve por variável. `--strict` transforma aviso em reprovação para o CI | `scripts/lib/prerequisites.mjs` |
| 2026-09-14 | **R-02: prompt concorrente é enfileirado**, não rejeitado. `SESSION_ALREADY_RUNNING` saiu do catálogo | o SDK já enfileira nativamente (medido, §8.6) e é o que a UI do Claude Code faz; o `409` era política nossa, e entregava uma experiência pior do que a que vem de graça | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md), [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), [backend/03](../../architecture/backend/03-modules.md), [backend/06](../../architecture/backend/06-realtime.md) |
| 2026-09-14 | Backend e web são **ESM**, com `module: "Preserve"` | `verbatimModuleSyntax` do `tsconfig.base.json` torna CommonJS um erro de compilação, e afrouxá-lo exigiria ADR. `Preserve` é o que sobra: specifier sem extensão e alias de path, que é o que o `tsx` e o Vite resolvem | `backend/tsconfig.json`, `web/tsconfig.json` |
| 2026-09-14 | `emitDecoratorMetadata` **desligado**; todo parâmetro injetado leva `@Inject(TOKEN)` | sem metadata não há transformador extra na cadeia (nem SWC, nem passo de build), e o token passa a ser explícito — a forma que [backend/01](../../architecture/backend/01-clean-architecture.md) pede de qualquer modo | `backend/tsconfig.json`, os módulos do Nest |
| 2026-09-14 | O backend roda por `tsx`, sem artefato compilado | ele roda na máquina do usuário, ao lado do Claude Code; um passo de build entre `pnpm dev` e o processo é atrito sem contrapartida no bootstrap | `backend/package.json` |
| 2026-09-14 | Validação de borda com **Zod**, não `class-validator` | sem `emitDecoratorMetadata` não existe tipo refletido para validar contra; um schema é um valor, reusável pelo teste. [09](../../architecture/shared/09-code-quality.md) já elege Zod para estreitar `unknown` | `backend/src/shared/validation/`, handlers WS |
| 2026-09-14 | O gateway roteia por **tabela de handlers**, não por `@SubscribeMessage` | o `WsAdapter` do Nest roteia pelo campo `event`; o envelope do contrato roteia por `type`. O contrato manda ([05](../../architecture/shared/05-websocket-protocol.md)), e o gateway continua sem regra — só encontra o handler | `backend/src/infrastructure/websocket/app.gateway.ts` |
| 2026-09-14 | O `ack` sai **antes** de qualquer evento causado pelo comando | um cliente que recebe o resultado antes de saber que o comando foi aceito não distingue "ainda processando" de "perdido" | `WsCommandOutcome.publish()`, [05](../../architecture/shared/05-websocket-protocol.md) |
| 2026-09-14 | PK de `sessions` é `text` com ULID do domínio, não `uuid` com `gen_random_uuid()` | a identidade vem do `IdGenerator`, então um default do banco significaria o banco decidindo quem é a entidade. E ULID ordena por tempo de criação, que é o que o torna legível num log | `backend/src/infrastructure/database/schema/session.schema.ts` |
| 2026-09-14 | O backend ganhou `POST /auth/session`, `/auth/refresh` e `/auth/logout` | [web/07](../../architecture/web/07-auth.md) exige o refresh token num cookie `httpOnly`, e só um servidor põe um. Sem esses três endpoints a B-29 não é implementável como está escrita | `backend/src/adapter/inbound/http/auth/` |
| 2026-09-14 | A regra de arquitetura do web é `no-restricted-imports` por escopo, não `eslint-plugin-boundaries` | o plugin, na v7, não classificou **nenhum** arquivo deste repositório e reportou sucesso sem inspecionar nada. Portão que passa sem olhar é pior que portão nenhum. As quatro regras de [09](../../architecture/shared/09-code-quality.md) continuam, com os mesmos nomes na mensagem | `eslint.config.mjs`, `web/test/unit/architecture/` |
| 2026-09-14 | Toda regra de arquitetura tem um teste que a vê **falhar** | as regras do `dependency-cruiser` casavam o nome do pacote e não o caminho resolvido: sete regras ligadas, zero inspecionando. Só um teste sobre fixtures propositalmente erradas pega isso | `backend/test/unit/architecture/`, `web/test/unit/architecture/` |
| 2026-09-14 | `web/src/shared/components/ui/**` fora do `jscpd` | território gerado do shadcn/ui ([web/03](../../architecture/web/03-ui-system.md)), mesma categoria de `packages/contracts/src` e `*.g.dart`. Reescrever o gerado para enganar o detector seria desfeito na próxima regeneração | `.jscpd.json` |
| 2026-09-14 | O front não tem variáveis próprias: as `VITE_*` são derivadas do `.env` compartilhado | uma segunda cópia de `RC_BACKEND_PORT` com outro prefixo é uma segunda coisa para manter em dia. `web/env.ts` deriva, e o Vite e o Vitest injetam o mesmo conjunto | `web/env.ts`, `web/vite.config.ts`, `web/vitest.config.ts` |
| 2026-09-14 | O logger do backend não usa `pino-pretty` | o transport roda em worker thread e, sob `tsx`, é uma peça a mais entre o processo e a primeira linha de log. A saída é JSON em todo ambiente, e a do próprio Nest passa pelo mesmo logger | `backend/src/shared/logging/logger.ts`, `nest-logger.ts` |
| 2026-09-14 | `riverpod_lint` e `custom_lint` ficam de fora | exigem Dart ≥ 3.13 e o toolchain é 3.12.2; entram quando o SDK subir. O `dart analyze` estrito e o `import_lint` cobrem o que importa hoje | `mobile/pubspec.yaml` |
| 2026-09-14 | `public_member_api_docs` fica de fora | pede doc em todo construtor e todo valor de enum; "Creates a X" ao lado de `X({required this.y})` é ruído que dilui os comentários que dizem alguma coisa | `mobile/analysis_options.yaml` |
| 2026-09-14 | `dart format` com `page_width: 100` | a mesma largura do Prettier nas outras duas pontas. Largura diferente por módulo gera diff de ruído em quem transita entre eles | `mobile/analysis_options.yaml` |
| 2026-09-14 | `jscpd` também mede Dart; `dart_code_metrics` saiu | o pacote foi descontinuado e o sucessor é comercial. O `jscpd` tokeniza Dart, e a medição passa a ser a mesma nas três pontas — foi ele que achou os 8 clones do ciclo 32 | `.jscpd.json`, [09](../../architecture/shared/09-code-quality.md#configuração) |
| 2026-09-14 | A **composition root** de cada feature do mobile fica na raiz da feature, não em `presentation/` | um caso de uso mora em `domain/`, que é Dart puro, então a anotação do Riverpod não pode ficar ao lado dele; e `presentation/` não pode alcançar `data/` — é a regra `presentation_cannot_reach_data`, que pegou exatamente isso. Sobra a raiz da feature | `mobile/lib/features/*/\*_providers.dart` |
| 2026-09-14 | Todo portão do Dart passa por `scripts/mobile.mjs` | o ferramental não devolve código de saída honesto: `import_lint` sai 0 com violações na tela, e `flutter test --coverage` escreve um relatório que nada lê | `scripts/mobile.mjs`, `package.json` |
| 2026-09-14 | A barra de cobertura do mobile é sobre **linhas**, e só | o `lcov.info` do `package:coverage` carrega `DA` e nada mais: não há `BRDA` nem `FN`. Medir `branches` nesta ponta não é possível, e fingir que sim seria pior que dizer | `scripts/mobile.mjs`, [README do plano](README.md#riscos-e-decisões-em-aberto) (R-06) |
| 2026-09-14 | A cobertura da raiz mede `scripts/lib/**`; os CLIs de `scripts/*.mjs` ficam fora, com justificativa | um CLI é um processo, não um módulo: ninguém o importa, e o que ele deve é código de saída e saída legível — contrato verificado em `test/integration/scripts/`, rodando-o. Mesma razão pela qual o backend exclui `main.ts` | `vitest.config.mjs` |
| 2026-09-14 | `pnpm lint`, `format:check`, `test:unit`, `test:integration` e `test:coverage` incluem o módulo Flutter | análise estática é obrigatória nos **três** módulos; uma lista separada é como um deles fica isento em silêncio | `package.json` |
| 2026-09-14 | Ramo impossível se **remove**, não se testa nem se ignora | `?? 0` sobre um grupo de regex que sempre casa é um ramo que nada alcança — e um ramo inalcançável no relatório é uma mentira. Onde não dá para remover (a chamada de `taskkill` num host POSIX), `/* v8 ignore */` **com a razão na linha** | `scripts/lib/version.mjs`, `ports.mjs`, `plan-progress.mjs`, `proc.mjs` |
| 2026-09-14 | O e2e do mobile **não é portão obrigatório** | emulador + build Gradle custa minutos e gigabytes por execução, e a primeira execução inviabilizou a máquina. Verificação cara demais para caber no ciclo de correção é verificação que alguém desliga; declarar opcional é melhor que deixar desligar em silêncio | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#por-que-o-e2e-de-mobile-não-bloqueia), R-07, `package.json` |
| 2026-09-14 | Redirect do client web no realm é **sem porta** (`http://localhost/*`) | o Keycloak não aceita curinga na posição da porta, e a stack efêmera serve o front numa porta aleatória. Loopback sem porta casa qualquer porta, pela RFC 8252 — verificado contra um Keycloak real antes de adotar | `infra/keycloak/realm-remote-claude.json` |
| 2026-09-14 | Um client `remote-claude-e2e` com **direct grant**, usado só por teste automatizado | a aba externa do sistema não se dirige por harness. Era a decisão que a F1 deixou em aberto ("se precisar de token sem navegador, é decisão de quem precisar") — quem precisou foi a ponta mobile | `infra/keycloak/realm-remote-claude.json`, `mobile/integration_test/support/` |
| 2026-09-14 | O e2e do web roda contra o bundle **buildado e servido**, com `NODE_ENV=production` | é o artefato que o usuário recebe; e qualquer outro `NODE_ENV` embarca o React de desenvolvimento, que invoca todo efeito duas vezes e não é o que roda em produção | `scripts/run-e2e-local.mjs`, `web/vite.config.ts` |
| 2026-09-14 | Os cenários compartilhados viajam ao app por `--dart-define`, não por leitura de arquivo | num device não existe repositório para ler. O runner lê `e2e/scenarios/*.json` e compila dentro — uma fonte só, alcançável pelas duas pontas | `scripts/lib/stack.mjs`, `scripts/mobile.mjs`, `mobile/integration_test/support/e2e_environment.dart` |
| 2026-09-14 | `adb reverse` em vez de reescrever as URLs para `10.0.2.2` | o `iss` do token tem que bater com o que o backend foi configurado para aceitar; trocar o host muda o `iss`. Encaminhar a porta mantém as duas pontas lendo **o mesmo** `e2e/.env` | `scripts/mobile.mjs` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-13 | Metade **Dart** de S-68 (`print()`) e S-69 (`dynamic`) | ~~não há módulo Flutter para o `dart analyze` reprovar~~ — **fechado na F5**: `avoid_print: error` e o analyzer estrito, com um teste que escreve a violação e vê o portão reprovar | entregue |
| 2026-09-13 | S-52 verificado contra código que **ainda não existe** | o teste varre `backend/src`, `web/src`, `packages` e `e2e` em busca de `process.env.X` — hoje não há leitura nenhuma. O extrator é testado contra fixtures, e o portão acusa na primeira variável não declarada | vigiar na [F3](F3-backend.md), com B-16 |
| 2026-09-13 | `pnpm verify` / `verify:full`, `lint:arch`, cobertura | ~~são a entrega da F7~~ — **entregues**; `verify` sai 0, e `verify:full` fica vermelho no portão 9 até a F6 | entregue |
| 2026-09-14 | `run-e2e-local.mjs` e o `--project-name` aleatório por execução | é B-37, da [F6](F6-scripts-e2e.md). A F1 entregou o que ele vai usar: `findFreePort`, `purgeStaleProjects` e o projeto compose por variável | [F6](F6-scripts-e2e.md) |
| 2026-09-14 | `pnpm dev` **não sobe backend nem web** | não existem ainda (F3 e F4). O script diz `not created yet` e sobe a metade que existe, em vez de falhar num diretório ausente | [F3](F3-backend.md), [F4](F4-web.md) |
| 2026-09-14 | Cenários de nível **e2e** da F3 e da F4 — S-19, S-27, S-28, S-29, S-37, S-61 | o arnês (Playwright, stack efêmera) é a [F6](F6-scripts-e2e.md). O comportamento está provado nos níveis que existem: replay e `gap` por unit e integração, PKCE e `state` por unit, o handshake contra um provedor OIDC real local por integração | [F6](F6-scripts-e2e.md) |
| 2026-09-14 | S-05, S-06 e S-08 — as checagens do `i18n:check` | ~~o script é a B-45~~ — **fechado na F7**, e a primeira execução achou 3 chaves órfãs de verdade | entregue |
| 2026-09-14 | A terceira regra do stream — `message.delta` acumulado por `messageId` | o contrato do bootstrap não carrega `message.delta`. Um redutor para um evento que não existe é código morto; entra com os eventos de mensagem | plano seguinte |
| 2026-09-14 | Tela de gerenciamento de device, e logout no `end_session_endpoint` do provedor | [web/07](../../architecture/web/07-auth.md) os descreve, e nenhum é tarefa da F4. O logout local — cookie, estado e cache — está feito | plano seguinte |
| 2026-09-14 | Envio em lote dos logs do browser para o backend | `LogBuffer` e `beaconShipper` existem e estão cobertos, mas não há endpoint que os receba; criar um sem a rota do outro lado seria metade de um caminho | [F7](F7-gates-ci.md) |
| 2026-09-14 | Nenhum client do realm tem `directAccessGrants` | a B-08 pede web e mobile com PKCE, e só. O login por senha dos usuários de teste é exercido pelo navegador na [F6](F6-scripts-e2e.md); se a [F3](F3-backend.md) precisar de token sem navegador para S-29, é decisão dela | [F3](F3-backend.md) |
| 2026-09-14 | Schemas só do handshake e do erro | é o que a B-11 pede. O comando e o evento da fatia vertical entram na [F3](F3-backend.md), e o contrato completo do [05](../../architecture/shared/05-websocket-protocol.md) entra com as features | [F3](F3-backend.md) |
| 2026-09-14 | `dart analyze` / `dart format` sobre o Dart gerado | não há projeto Flutter para rodá-los; o arquivo é gerado sem `dynamic` e testado pelo lado do emissor | [F5](F5-mobile.md) |
| 2026-09-14 | **A F6 inteira**, e com ela o portão 9 | a entrega pedida foi F5 e F7. `pnpm test:e2e` não existe, então o portão 9 de `verify:full` não tem comando — e `verify:full` **não sai 0**. Está dito aqui em vez de o portão ser afrouxado para parecer verde | [F6](F6-scripts-e2e.md) |
| 2026-09-14 | `integration_test/` do Flutter (B-40) | é da F6, e exige emulador | [F6](F6-scripts-e2e.md) |
| 2026-09-14 | Cenários de autenticação do **mobile** | entram com o registro de device, como a própria [F5](F5-mobile.md#cenários-cobertos) diz. O que existe hoje é o fluxo: aba externa do SO, credencial no armazenamento seguro, renovação deduplicada — todos cobertos por unit | plano seguinte |
| 2026-09-14 | `branches` e `functions` na cobertura do mobile | o `lcov.info` do Dart não os carrega. Não é escopo cortado por conveniência: não existe o dado | R-06 |
| 2026-09-14 | Envio em lote dos logs do celular para o backend | o `LogBuffer` existe e está coberto, mas continua sem endpoint que o receba — mesmo estado do web | plano seguinte |
| 2026-09-14 | `osv-scanner` e o quality gate do SonarQube | o `pnpm audit` cobre a dependência vulnerável hoje; `osv-scanner` e o Sonar exigem infraestrutura que este plano não levanta. O `semgrep` roda, pela imagem oficial | plano seguinte |
| 2026-09-14 | Tela de diagnóstico que liga `debug` em release | `levelFor(isRelease, debugRequested)` já aceita o pedido e está coberto; falta a tela que o faz | plano seguinte |
| 2026-09-14 | ~~**Execução verde do `integration_test` do Flutter** (S-62, S-116)~~ | **fechado** — `pnpm test:e2e:mobile` saiu 0 com o emulador cercado por cgroup. A execução achou S-118 (corrigido) e S-119 (em aberto) | entregue |
| 2026-09-14 | **S-119** — `session.detach` não existe no contrato nem no backend | o app o envia e leva `INVALID_INPUT`/`unknownCommand`. Corrigir é mudar comando WS, o que exige schema, backend, web, mobile e o [05](../../architecture/shared/05-websocket-protocol.md) na mesma mudança — escopo de plano, não de correção de passagem | plano seguinte |
| 2026-09-14 | `-Xmx8G -XX:MaxMetaspaceSize=4G` em `mobile/android/gradle.properties` | é o default do template Flutter, e sozinho promete 12 GB de JVM. Não foi alterado porque a execução passou com a cerca de cgroup por fora; continua sendo um teto alto demais para uma máquina de desenvolvimento | plano seguinte |
| 2026-09-14 | Job de e2e mobile no CI | seria configuração não verificada num pipeline que hoje é verde; e a decisão é que ele não bloqueia merge. Entra junto com a máquina/runner que o suporte | plano seguinte |
| 2026-09-14 | `e2e/smoke-live/` está vazio | o bootstrap deliberadamente não fala com o Claude ([escopo](README.md#escopo)). O diretório, a exclusão no `playwright.config.ts` e o porquê existem; a primeira spec entra com o Agent SDK | plano seguinte |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | `allow` de projeto em diretório confiado | 🔲 aberto | verificar antes de produção |
| R-02 | `409` vs enfileirar prompt | ✅ decidido | **enfileira.** `SESSION_ALREADY_RUNNING` saiu do catálogo; os quatro documentos normativos foram atualizados |
| R-03 | 90 % desde o primeiro commit | 🔄 monitorar | o portão passou a existir por workspace: `perFile` nas quatro dimensões, sobre unit + integração. Backend 98,8 % · web 99,5 % · mobile 99,4 % · `scripts/` 99,4 %. O risco de teste de fachada continua, e se vigia em review — são os cenários de erro que dizem se o número significa algo |
| R-04 | Dart gerado fora de sincronia | ✅ mitigado | B-14 entregue: `pnpm contracts:check` reprova **os dois** alvos, e S-02 prova o caso do Dart |
| R-05 | Docker obrigatório | ✅ aceito | sem alternativa; `gitleaks` e `semgrep` rodam pela imagem oficial quando o binário não está na máquina |
| R-06 | Cobertura do Flutter só mede linhas | ✅ aceito | o `lcov.info` do Dart não carrega `BRDA` nem `FN`. Backend 98,8 % e web 99,5 % continuam nas quatro dimensões; o mobile está em 99,4 % de linhas, com 0 arquivos abaixo da barra |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque-a com ✅ no arquivo da fase, atualize os cenários cobertos
   em [scenarios.md](scenarios.md) e rode `pnpm plan progress` — os contadores daqui saem de lá,
   e a mesma execução atualiza o [progresso geral](../progress.md). Progresso de fase é
   registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md).
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso.
