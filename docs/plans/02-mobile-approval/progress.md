# Plano 02 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — F0 a F4 concluídas, com todos os cenários da F4 passando (S-54 e S-67 pela variante com push de verdade, D-26)
**Última atualização:** 2026-09-24
**Bloqueios:** nenhum. Só [D-17](decisions.md) segue ⛔, travada pelo
[plano 06](../06-distribution/decisions.md), e ela não impede fase nenhuma deste plano.

**F0 fechada em 2026-09-19**, nas três pontas. Um aparelho é registrado, aprovado a partir do
navegador e revogado, e a revogação alcança o socket que já estava aberto.
[D-18](decisions.md#d-18--o-que-a-revogação-consegue-prometer) e
[D-19](decisions.md#d-19--de-qual-aparelho-vem-este-socket) saíram dali.

**F1 em 2026-09-19 (backend) e 2026-09-20 (app).** B-08…B-12 fecharam o módulo `notification`;
B-31 e B-32 fecharam em 2026-09-20 — o app reenvia o token rotacionado sozinho, e diz com todas as
letras quando a notificação não vai chegar. **B-13 fechou em 2026-09-23**, e com ele a F1: o lado
Dart já existia e era testado, e o **transporte da plataforma** passou a existir em `android/`,
onde [D-21](decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart) o põe — a outra
ponta do canal, o serviço que recebe, o canal de notificação Android e a permissão do SO. O
arquivo de credencial continua sendo de quem opera; sem ele o build compila e o app **diz** que não
recebe notificação.

**F2 concluída em 2026-09-20.** O app acompanha uma sessão viva: comandos completos, as três
regras do stream, lista de workspaces e tela de sessão com os quatro estados, `detach`
obrigatório e l10n nos dois idiomas. Ela foi aberta **antes** de a F1 fechar, o que o protocolo
normalmente não permite; foi decisão explícita de quem pediu o trabalho, e está registrada aqui
em vez de silenciada. O que travava a F1 — o transporte de push — não bloqueia nada da F2.

**F3 e F4 concluídas em 2026-09-24.** O celular decide: card com o comando inteiro, dois passos para
o destrutivo, biometria com PIN como degrau de baixo, deep link que revalida no servidor, extensão
de prazo e logout que desregistra o push antes de apagar a credencial. `pnpm verify:full` saiu 0 com
os onze portões, e `pnpm test:e2e:mobile` saiu 0 no emulador API 35 — 6/6. Rodar no aparelho achou
um problema de layout real que nenhum widget test pegaria (ciclo 29).

**O `build_runner` travava por um motivo que ninguém tinha diagnosticado:** ele **pergunta**, na
entrada padrão, se pode sobrescrever um arquivo gerado que está desatualizado. Como os gerados são
commitados, isso acontece sempre; e como não há ninguém para responder, o build fica a 1 % de um
núcleo indefinidamente — foram cinquenta minutos numa medição, e a leitura na hora foi "a máquina
está ocupada". A opção que calava a pergunta, `--delete-conflicting-outputs`, não existe mais
nesta versão. `scripts/mobile.mjs generate` passou a **apagar os gerados antes de gerar**, e o
build inteiro voltou a levar segundos.

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
| [F0](F0-device.md) | B-01…B-07, B-30 | 8/8 | ✅ |
| [F1](F1-push.md) | B-08…B-13, B-31, B-32 | 8/8 | ✅ |
| [F2](F2-mobile-session.md) | B-14…B-19 | 6/6 | ✅ |
| [F3](F3-mobile-permission.md) | B-20…B-25, B-33 | 7/7 | ✅ |
| [F4](F4-e2e.md) | B-26…B-29, B-34 | 5/5 | ✅ |
| **Total** | **B-01…B-34** | **34/34** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 89 | 0 | 0 | 89 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 26 | 0 | 0 | 25 | 1 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-19 | F0 | 3 · tipagem | `WsCommandContext` ganhou `installId`, e o builder de teste que monta um contexto não tinha o campo | campo adicionado ao `aWsContext`, com default `null` (navegador) | verde |
| 2 | 2026-09-19 | F0 | 6 · unit | o modelo de contrato passou a carregar `frame: boolean`, e o teste que compara a mensagem inteira comparava sem ele | asserção atualizada, mais um caso novo para o `x-kind: "http"` | verde |
| 3 | 2026-09-19 | F0 | 8 · integração | o `beforeEach` limpava `audit_events`, que a trigger de retenção recusa apagar — a limpeza derrubava 27 dos 28 casos | a trilha **não** é limpa: as asserções passam a ser escopadas por `subject_id`. Uma trilha que o teste apaga não seria uma trilha | verde |
| 4 | 2026-09-19 | F0 | 8 · integração | duas asserções liam `error.message`, que no driver é o invólucro `Failed query: …` e casa com qualquer falha | passaram a ler `error.cause.message`, que é o que o banco respondeu | verde |
| 5 | 2026-09-19 | F0 | 5 · duplicação | nove clones, e o limiar é 0. Três eram reais: quatro use cases de device com o mesmo construtor, as duas trilhas append-only com as mesmas colunas e índices, e dois hooks web com o mesmo carregamento e os mesmos quatro estados | `DeviceContext` (mesmo argumento do `PersistenceContext`), `trailColumns` + `keysetIndexes`, e `useLoad` + `LoadedList` — o portão apontou duplicação que era desenho faltando | verde, 0 clones |
| 6 | 2026-09-19 | F0 | 9 · e2e | S-79 falhou uma vez e passou na reexecução, com o mesmo código. `lastSeqOf` lê o **último** frame, não o maior, então qualquer frame sem `seq` chegando depois zera a asserção — fragilidade do helper do plano 01, exposta por máquina em load 31 | nenhuma: 19/19 na reexecução. Registrado aqui em vez de mascarado mexendo numa asserção de outro plano | verde |
| 7 | 2026-09-19 | F1 | 3 · tipagem | o gate de arquitetura recusou `jose` fora de `adapter/outbound/identity/`, e o adapter de push assina uma asserção JWT | a regra passou a excetuar `adapter/outbound/push/` **para `jose` apenas**, com uma regra nova recusando cliente OIDC ali — o alvo da regra é conhecimento de OIDC se espalhando, não uma primitiva de cripto | verde |
| 8 | 2026-09-19 | F1 | 7 · cobertura | três arquivos abaixo de 90 %: `PushTokenRejectedError` nunca construído, `device-reach.use-cases` sem o caminho de device ausente, e `push-credentials` com um ramo inalcançável | o erro morto foi **apagado** (o desenho usa `PushDelivery`, não exceção), os outros dois ganharam teste. Ao cobrir o terceiro apareceu um vazamento real: a mensagem citava o parser, e o parser de JSON do V8 cita a entrada — que é um arquivo com chave privada | verde |
| 9 | 2026-09-19 | F0 | 6 · unit (mobile) | o controller lia `ref.watch(authControllerProvider)` e tratava "carregando" como "ninguém logado", então não registrava quem estava; e o teste do log esperava `INFO` onde o logger escreve `info` | passou a `await ref.watch(authControllerProvider.future)`, que é o que "espere a sessão" significa | verde |
| 10 | 2026-09-19 | F0 | 6 · widget | o banner não mostrava a falha: no Riverpod, um build que falha enquanto o provider ainda assenta chega como `AsyncLoading` **com** erro, e o `switch` pelas três classes casava `AsyncLoading` primeiro | passou a ler o que o estado **significa** (`error`, depois `hasValue`) em vez de que classe ele é. O portão achou um bug de verdade: registro que falha ficaria "Registrando…" para sempre | verde |
| 11 | 2026-09-19 | F1 | 9 · e2e | o backend do stack efêmero deixou de subir: as três variáveis de push são obrigatórias no schema, e `scripts/lib/stack.mjs` não as escrevia. Só apareceu no `verify:full` — nenhum portão isolado sobe o stack | acrescentadas ao ambiente hermético, apontando para `push.invalid` e sem arquivo de credencial, que é exatamente o caso que [D-20](decisions.md#d-20--onde-vive-o-segredo-e-o-que-ele-não-pode-derrubar) diz que **não** derruba o boot | verde |
| 12 | 2026-09-19 | F0 | 7 · cobertura | `useDevices` em 85,7 % de ramos: o caminho em que uma aprovação responde **depois** de a lista ter sido recarregada não tinha teste — e é o que impede um device velho de voltar à tela | teste de hook com o `reload` em voo, que é uma ordenação que a tela renderizada não segura parada | verde |
| 13 | 2026-09-20 | F2 | 4 · arquitetura | `presentation` importando `data`: os dois controllers liam o frame com um mapper de `data/mappers/` | o frame vira **evento de domínio** no mapper, e o fold passou para `Conversation.apply`. A regra estava certa e o desenho ficou melhor: as três regras do stream agora se testam sem JSON, sem socket e sem widget | verde |
| 14 | 2026-09-20 | F1 | 6 · unit (mobile) | o teste de rotação que falha não via falha nenhuma: `DeviceController.refresh` guardava o erro no próprio estado com `AsyncValue.guard`, então quem pediu o reenvio nunca ficava sabendo | `refresh` passou a **responder** se o registro passou. Bug real: a condição do [D-13](decisions.md#d-13--o-token-que-morre-calado) — a aprovação de longe parando de chegar — ficaria invisível | verde |
| 15 | 2026-09-20 | F2 | 6 · unit (mobile) | "Ref usado depois de descartado": o callback de `lastSeq` entregue ao `follow` sobrevive ao provider, e lia `state` | passou a ler um campo. Bug real, e no pior lugar possível: estourava **dentro** da reconexão do socket, depois de o usuário sair da tela | verde |
| 16 | 2026-09-20 | F2 | 6 · unit (mobile) | dois hábitos de teste errados de uma vez: `container.read` sem ouvir deixa um provider `autoDispose` ser descartado entre asserções, e um laço em `isLoading` nunca termina porque build que falha chega como `AsyncLoading` **com** erro | os testes passaram a segurar o provider com `listen`, e a esperar por "valor **ou** erro". A segunda metade é a mesma lição do ciclo 10, agora num teste em vez de num widget | verde |
| 17 | 2026-09-20 | F2 | 5 · duplicação | três clones, limiar 0: duas telas repetindo o `Scaffold`+`AppBar`, dois widgets repetindo `Padding`+`Column` alinhada ao início, e dois `build` com o mesmo preâmbulo | `ContentColumn` já existia para o segundo caso e ninguém usou; o primeiro virou `AppScreen`; o terceiro sumiu ao dividir o card nos seus pedaços. Zero clones — de novo, duplicação apontando desenho faltando | verde, 0 clones |
| 18 | 2026-09-20 | F2 | 7 · cobertura | doze arquivos abaixo de 90 %, e a causa mais teimosa foi sutil: duas expressões `const` idênticas são **a mesma instância**, então `expect(a, b)` responde por identidade e o `props` da igualdade nunca roda | teste de fiação para os providers novos, testes de widget para os ramos de card e lista, e igualdade comparada sem `const`. 99 arquivos, 99,3 % | verde |
| 19 | 2026-09-20 | F2 | 7 · cobertura | **os 1401 testes passaram** e o portão caiu na limpeza: `HTTP 409 — container is running` ao remover um container do testcontainers. O daemon tinha 29 containers e dois `ryuk` concorrentes, de outra suíte rodando na mesma máquina | nenhuma, e nada foi apagado: container de outro projeto não é nosso para remover, e um `docker rm` largo derrubaria a suíte de alguém no meio. Verde na reexecução, com o mesmo código. Registrado como contenção de infraestrutura — é a mesma classe do ciclo 6, e o que ela pede é daemon isolado, não mudança de código | verde |
| 20 | 2026-09-24 | F3 | 6 · unit (mobile) | o logout nunca esquecia o push token: `signOut` punha o estado em `loading` **antes** de rodar os passos, o `DeviceController` — que observa o auth — reconstruía, e o `onDispose` dele desregistrava o passo antes de ele rodar | os passos rodam antes de o estado mudar. Bug real, e era exatamente o S-50: o aparelho seguiria notificado pela conta que saiu | verde |
| 21 | 2026-09-24 | F3 | 6 · unit (mobile) | troca de usuário sem logout: a continuação assíncrona do `close()` marcava `closed` por cima da conexão que o `connect()` seguinte já tinha aberto | `_settleClosed` só reporta a closure quando não existe socket novo | verde |
| 22 | 2026-09-24 | F3 | 6 · widget | a revalidação que falha foi pedida quatro vezes: o Riverpod 3 re-tenta sozinho provider com erro | `retry` desligado na consulta — as falhas que chegam ali (`403`, corpo ilegível) não mudam com repetição, e o "tentar de novo" é da pessoa | verde |
| 23 | 2026-09-24 | F3 | 6 · widget | a fila na tela da sessão mostrava o desfecho em vez do card | não era bug: o teste usava o relógio real, e o pedido do builder já tinha passado do prazo — o card vencido saiu como negado, que é a regra. Relógio fixado no teste | verde |
| 24 | 2026-09-24 | F3 | 7 · cobertura | `permission_lookup.dart` a 81 %: os `props` das consultas e visões nunca rodavam, porque instâncias `const` idênticas comparam por identidade — a mesma lição do ciclo 18 | testes com instâncias construídas em tempo de execução | verde |
| 25 | 2026-09-24 | F4 | 5 · duplicação | 11 clones, limiar 0: preâmbulos de `build` repetidos, a linha de explicação escrita duas vezes (card de permissão e card de tool), e passos repetidos nos dois e2e | `NoteLine` em `core/widgets/`, `ContentColumn` aceitando alinhamento, `workspaceFor` nas fixtures do Playwright (usado também pelo spec do plano 01) e helpers no e2e do app. 0 clones | verde |
| 26 | 2026-09-24 | F4 | 9 · e2e | 02·S-53 e 02·S-55 caíram em `SESSION_LIMIT_REACHED`: fechar o socket **não** encerra a sessão, e o backend segura dez ao mesmo tempo | cada teste novo encerra, com `session.close`, a sessão que abriu | verde no ciclo seguinte |
| 27 | 2026-09-24 | F4 | 8 · integração | dois arquivos do backend não chegaram a rodar: `[vitest-worker]: Timeout calling "fetch"` e `"resolveId"` ao carregar módulos — 232/232 dos testes que rodaram passaram. A máquina estava com a swap cheia, com um emulador e a stack e2e de outro projeto de pé | nenhuma, e nada foi derrubado: o backend não mudou desde o ciclo anterior, em que o mesmo portão passou. Mesma classe dos ciclos 6 e 19 — contenção de máquina, não código | verde na reexecução (11 portões) |
| 28 | 2026-09-24 | F4 | e2e mobile | o walking skeleton esperava 2 `Card`s e achou 3 — o banner de device da F0 também é um `Card`, e a asserção envelheceu sem ninguém ver porque o e2e do app não é portão; e o fluxo novo tocava o primeiro `ListTile` da tela, que durante a transição era a **chave de biometria** da tela inicial | contagem restrita à lista de round trips; o toque, aos `ListTile` da lista de workspaces | 2 de 6 |
| 29 | 2026-09-24 | F4 | e2e mobile | dois achados do aparelho real. **Produto:** numa tela de 411×786 dp, banners + fila (limitada a metade da **tela**) + composer estouravam a coluna da sessão, e o "mais tempo" ficava fora da área visível. **Harness:** o teste abria o socket antes de existir `installId` — o `main.dart` real chama `ensure()` antes —, e a revogação respondia `closed: 0` | a área de cima passou a ser limitada pela altura **disponível**, com banners e fila rolando juntos; o harness faz o que o `main.dart` faz; os toques rolam até o alvo | interrompido: o VS Code caiu e levou o emulador |
| 30 | 2026-09-24 | F4 | e2e mobile | nenhum portão: a execução anterior morreu com o editor, e deixou dois containers da stack efêmera | containers e volumes **daquele** projeto de compose removidos, emulador religado na mesma imagem | **6/6**, `exit 0` |
| 31 | 2026-09-24 | F4 | e2e push | o diálogo do SO nunca veio: o `PushController` — que pede a permissão, registra o token **e** transforma o toque numa navegação — só era construído por uma tela com o banner de push. Na tela inicial, nunca | bug real do produto: quem ficasse na tela inicial não seria notificado, e um toque que abrisse o app ali não iria a lugar nenhum. O controller passou a viver no escopo do app; o teste que cobre isso falha sem a correção | avançou |
| 32 | 2026-09-24 | F4 | e2e push | o push do pedido falhou com `connect timeout` de 10 s ao buscar o token de acesso do provedor; a retirada, segundos depois, entregou com `200` | nenhuma — rede intermitente, conferida em seguida (IPv4, IPv6 e `fetch` abaixo de 0,4 s). **Achado registrado:** uma única falha do provedor perde a notificação, porque não há nova tentativa ([D-05](decisions.md) decidiu "sem segundo canal", não "sem nova tentativa") | reexecutado |
| 33 | 2026-09-24 | F4 | e2e push | o diálogo aparecia (`GrantPermissionsActivity` no logcat) e o `patrol` não o via: procura por id de recurso do controlador do AOSP, e esta imagem traz o do fornecedor; e ler a bandeja enquanto a notificação chega devolve `StaleObjectException` | diálogo achado e respondido pelo **texto** do botão; notificação esperada e tocada numa ação só, `tapOnNotificationBySelector` pelo título | avançou |
| 34 | 2026-09-24 | F4 | e2e push | `INSTALL_FAILED_INSUFFICIENT_STORAGE`: a AVD pessoal estava com 95 % da partição de dados, e nada disso era deste projeto | AVD **dedicada** `remote_claude_api35`, mesma imagem, 16 GB de dados, por decisão de quem pediu. A AVD antiga ficou intocada | **1/1**, e a suíte hermética 6/6 na AVD nova |
| 35 | 2026-09-24 | F4 | 5 · duplicação | dois clones entre o e2e do app e o teste do `patrol`: o preâmbulo de login e o "abrir sessão pela lista" | `signedInOnThisDevice` e `sessionOpenedFromTheList` no suporte compartilhado; os dois testes de aparelho rodados de novo depois disso | 0 clones |
| 36 | 2026-09-24 | F4 | 1 · formatação | o `patrol` escreve `patrol_test/test_bundle.dart` a cada execução, e o portão o achou | artefato de build: no `.gitignore` do módulo, e apagado pelo script ao fim da execução | verde |
| 37 | 2026-09-24 | F4 | e2e mobile | **verde falso:** `flutter test integration_test` instalou o app, não rodou teste nenhum e saiu 0 — o script confiava só no código de saída. Na reexecução, 6/6 | o script passou a exigir no relatório do runner um teste que passou (`+N: All tests passed!` no `flutter`, `Successful: N` no `patrol`, N > 0); regra pura em `scripts/lib/android.mjs`, com teste | verde |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-15 | As 16 decisões do plano fechadas ([decisions.md](decisions.md)) | quatro já estavam respondidas em fase, cenário ou documento normativo e continuavam abertas; oito gaps não tinham registro nenhum | R-01 fechado; tarefas novas em F0, F1, F3 e F4, ainda fora das fases e da matriz |
| 2026-09-19 | [D-19](decisions.md#d-19--de-qual-aparelho-vem-este-socket): `client.installId` no handshake, e `x-install-id` em toda requisição HTTP do app | B-04 não era implementável sem ele — não há como fechar "as connections daquele device" se nenhuma connection sabe de qual device é | mudança de contrato: schema, TypeScript e Dart regerados, [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) atualizado, e as três pontas na mesma entrega |
| 2026-09-19 | [D-18](decisions.md#d-18--o-que-a-revogação-consegue-prometer): revogar faz a credencial parar de valer **aqui**, não no provedor | o backend é Resource Server e nunca vê o refresh token do app, que renova direto no provedor; não há o que revogar lá sem guardar credencial | [S-08](scenarios.md) reescrito para o que o teste prova; [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) diz agora o que a revogação **não** faz |
| 2026-09-19 | A trilha de fatos de conta ganha tabela própria, `audit_events`, em vez de alargar `audit_entries` | S-13 exige registro/aprovação/revogação em `audit`, e `audit_entries` é moldada em torno de uma invocação: `session_id`, `tool_name` e `input` não têm valor honesto para "este celular foi aprovado" | [backend/03-modules](../../architecture/backend/03-modules.md#audit) e [backend/05-persistence](../../architecture/backend/05-persistence.md#os-fatos-de-conta); migration `0007_devices.sql` |
| 2026-09-20 | [D-21](decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart): o fornecedor de push fica atrás de um `MethodChannel`, fora do Dart | receber push exige a biblioteca do fornecedor, e um `import` dela é o nome dele dentro de `lib/` — que o S-26 recusa por regra de máquina. Abrir exceção na regra é o anti-padrão que o AGENTS.md rejeita por nome | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil); `core/notifications/` e o estado "indisponível" na UI |
| 2026-09-20 | A lista da F2 é a de **workspaces**, não uma lista de sessões | não há endpoint de "minhas sessões", e não deve haver aqui: a allowlist é decidida na máquina que roda o backend, e sessão é o que nasce de uma pasta | [F2 · B-17](F2-mobile-session.md); `features/workspace/` no app |
| 2026-09-20 | `scripts/mobile.mjs generate` apaga os gerados antes de gerar | o build_runner **pergunta** na entrada padrão se pode sobrescrever gerado desatualizado, e como os gerados são commitados ele pergunta sempre. Sem ninguém para responder, trava indefinidamente — e `--delete-conflicting-outputs` não existe mais nesta versão | [scripts/mobile.mjs](../../../scripts/mobile.mjs); a nota do `build_runner` no topo deste arquivo |
| 2026-09-23 | O plugin de credencial do push é aplicado **só quando** `google-services.json` existe | era o motivo de o transporte ter ficado fora: o plugin recusa o build sem o arquivo. Condicionado, o build sem credencial compila e o canal responde `unavailable`, que é o estado que o D-21 já previa | [F1 · B-13](F1-push.md); `mobile/android/app/build.gradle.kts` e [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil) |
| 2026-09-23 | `node scripts/mobile.mjs test:native` entra no portão de unit | a lógica do transporte que não depende de Android tem teste de JVM, e teste que nenhum portão roda é teste que não existe. `androidx.core` fica em 1.17.0: a 1.19 exige `compileSdk` 37 e AGP 9.1, e o Flutter desta versão fixa 36 | `package.json` (`test:unit`) e [scripts/mobile.mjs](../../../scripts/mobile.mjs) |
| 2026-09-24 | [D-22](decisions.md#d-22--revalidar-é-perguntar-não-esperar) a [D-25](decisions.md#d-25--o-que-a-chave-desliga): revalidar por consulta HTTP, desregistrar o push **antes** do logout, vários assinantes por sessão no `WsClient`, e a chave de biometria desligando o pedido e não a regra | cada uma destravava uma tarefa da F3 que não era implementável como estava escrita | `GET /sessions/:sessionId/permissions/:requestId` no backend; [mobile/03](../../architecture/mobile/03-state-and-data.md) e [mobile/07](../../architecture/mobile/07-auth.md) corrigidos |
| 2026-09-24 | `4401` passa a ser **anunciado** pelo `WsClient`, e o app pede o status do aparelho por `GET /devices` | revogar com o app aberto derrubava o socket e a tela seguia dizendo "aprovado" (S-56); re-registrar para descobrir apagaria o push token a cada token expirado | `WsClient.rejections`, `DeviceController.recheck`, `app/session_scope.dart` |
| 2026-09-24 | `permission.resolved` automático, negado e **sem autor** é o prazo; com autor, é regra | o app lia todo `auto` como "regra desta sessão", e o pedido vencido aparecia com a frase errada | `permission_mapper.dart` |
| 2026-09-24 | `scripts/mobile.mjs generate <pasta>` limpa só a pasta que vai regerar | limpava todo `lib/` e regerava uma pasta: o compile seguinte falhava em features que ninguém tinha tocado | [scripts/mobile.mjs](../../../scripts/mobile.mjs) |
| 2026-09-24 | O e2e do app recebe **todos** os cenários que roda num `RC_SCENARIO` só, por nome de arquivo | um define por cenário cresceria a linha de comando a cada cenário | `scripts/mobile.mjs`, `integration_test/support/e2e_environment.dart` |
| 2026-09-19 | O gerador de contratos aceita `x-kind: "http"` — um payload compartilhado que **não** é frame | o `device-register` do [plano](README.md#árvore-resultante) é contrato das três pontas e viaja por HTTP; declará-lo como `command` poria `device.register` em `FRAME_TYPES`, oferecendo ao cliente um frame que o gateway não tem handler para atender | `scripts/lib/contracts-{model,typescript,dart}.mjs` e os testes deles |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-19 | O recebimento de push no app — **B-13, B-31, B-32** | leitura conservadora demais: "precisa de aparelho". Só a **entrega** precisa; o código do app e os testes dele não | **revertido em 2026-09-20**: B-31 e B-32 fechados, B-13 com todo o lado Dart feito |
| 2026-09-19 | A **F2 inteira** — B-14…B-19 | a F1 não tinha fechado, e o protocolo não deixa a próxima fase começar antes | **revertido em 2026-09-20**: feita por decisão explícita de quem pediu, com a exceção de ordem registrada acima |
| 2026-09-24 | Nova tentativa do push quando o provedor falha | uma falha pontual de rede perde a notificação (ciclo 32); D-05 fechou "sem segundo canal", e nova tentativa não foi decidida [plano 05 · B-25](../05-hardening-operations/F0-limits.md#b-25--nova-tentativa-do-push-), com a política em aberto no D-09 de lá |
| 2026-09-24 | A **biometria real** no emulador | o prompt é do SO e a AVD não tem bloqueio de tela; o e2e usa um `ConfirmingLock`, como já substituía a aba de login e o Keychain | a regra está provada no gate (unit) e nos argumentos do plugin (`biometricOnly: false`, unit). Continua o R-03 |
| 2026-09-24 | Tema `AppCompat` para o diálogo de biometria no Android ≤ 8 | o `local_auth` pede `Theme.AppCompat` para não quebrar em Android 8 e anterior; o app não tem essa dependência e o escopo testado é API 35 | registrado como risco; `minSdk` é o do Flutter (24). Decisão do [plano 06](../06-distribution/README.md), que fecha o escopo de SO |
| 2026-09-20 | O **transporte de push da plataforma** — a parte que falta de B-13 | biblioteca do fornecedor, canal de notificação Android e `google-services.json`. Ligar o plugin do Gradle sem o arquivo de credencial **quebra o build do APK**, e trocaria um portão verde por um vermelho para entregar algo que só um aparelho exercita | **revertido em 2026-09-23**: o plugin é aplicado só quando o arquivo existe, então o build sem ele segue verde. Fica de fora apenas o arquivo, que é de quem opera, e a entrega num aparelho, que é a [F4](F4-e2e.md) |

---

## Dívida herdada do plano 00

O que o [bootstrap](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado) adiou e **este**
plano assume. Item herdado sem dono vira item esquecido.

| Herdado | Onde fecha |
|---|---|
| Tela de gerenciamento de device | B-06 — **fechado em 2026-09-19** |
| Cenários de autenticação do mobile, que entram com o registro de device | B-07, S-01…S-14 — **fechados em 2026-09-19** |
| Logout no `end_session_endpoint` do provedor | B-25 |
| `-Xmx8G` default do template Flutter | B-29 |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Qual provedor de push | ✅ fechado | **FCM direto**, Android só ([D-03](decisions.md), [D-12](decisions.md)); o nome não sai da configuração |
| R-02 | Push é um terceiro no caminho de uma decisão de segurança | 🔲 aberto | mitigado: payload sem conteúdo, e a tela revalida no servidor |
| R-03 | Biometria não é confiável em emulador de CI | 🔲 aberto | regra testada por widget com autenticador fakeado |
| R-04 | Notificação entregue depois do `expiresAt` | 🔲 aberto | tratado como caso normal — S-57 |
| R-05 | O e2e do app é caro e já derrubou uma máquina | 🔲 aberto | cgroup da F6 do bootstrap + teto do Gradle (B-29) |

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
