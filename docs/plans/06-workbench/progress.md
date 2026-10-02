# Plano 06 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F6 concluída — o plano está **encerrado** (decisão do usuário, 2026-09-30)
**Última atualização:** 2026-09-30
**Bloqueios:** nenhum

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
| [F0](F0-contract.md) | B-01…B-05 | 5/5 | ✅ |
| [F1](F1-directory-browse.md) | B-06…B-12, B-40 | 8/8 | ✅ |
| [F2](F2-open-folder.md) | B-13…B-16 | 4/4 | ✅ |
| [F3](F3-layout.md) | B-17…B-22 | 6/6 | ✅ |
| [F4](F4-commands.md) | B-23…B-27 | 5/5 | ✅ |
| [F5](F5-screens.md) | B-28…B-34 | 7/7 | ✅ |
| [F6](F6-e2e.md) | B-35…B-39 | 5/5 | ✅ |
| **Total** | **B-01…B-40** | **40/40** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 210 | 0 | 0 | 210 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 33 | 0 | 0 | 33 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 0 | 2026-09-28 | F0 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; o `web/README.md` mudou depois do disparo, então o ciclo seguinte recomeça do 1 |
| 1 | 2026-09-28 | F0 | 7 — cobertura (backend) | 2449/2449 asserções passam; uma suíte, `drizzle-session-origin.repository.spec.ts` (não tocada), falhou no **teardown**: o Docker recusou remover um container ainda rodando (`HTTP 409 … container is running`). Sozinha, 3 de 3 verdes — corrida do daemon sob a carga do `verify:full`, não da entrega | nenhuma no código; reinício honesto do portão 1 | reinício do portão 1 |
| 16 | 2026-09-30 | F3 | 2 — lint | três erros em testes novos: texto em template dentro de JSX (`react/jsx-no-literals`) e dois parâmetros sem uso num `vi.fn` | JSX só com expressões e o `vi.fn` tipado pelo genérico; e, na mesma volta, o anexo das sessões das abas passou do `WorkbenchRoute` para a moldura — sair do workbench desanexava as abas (teste novo em `ClaudeSideBar.spec`) | reinício do portão 1 |
| 17 | 2026-09-30 | F3 | 5 — duplicação (limiar 0) | 2 clones: o nome da pasta pelo último segmento, escrito no service do `workspace`, nas abas e na pergunta de fechar; e o gatilho de menu com tooltip do menu de conta e do de gerenciar | `folderName` em `shared/lib/folder-name.ts` (três features o usam); `RailMenuTrigger` em `app/` | reinício do portão 1 |
| 18 | 2026-09-30 | F3 | 7 — cobertura | 1–6 verdes; a suíte de scripts roda o `i18n:check`, que achou `workbench.tabs.none` órfã — o seletor de abas deixou de usá-la quando a aba ativa passou a existir sempre | chave removida nos dois idiomas | reinício do portão 1 |
| 19 | 2026-09-30 | F3 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; cobertura por arquivo toda na barra |
| 20 | 2026-09-30 | F3 | 10 — segurança (`osv-scanner`) | portões 1–9 verdes, e2e incluso (o `limits` já lendo a sessão da side bar); dois advisories de `@grpc/grpc-js@1.14.4` (GHSA-f596-whhp-79r4, GHSA-m9gg-hp2v-232j), transitivo de `testcontainers` → `dockerode` no backend — não vieram da entrega | override `@grpc/grpc-js` → `^1.14.5`, mantendo a linha; nenhum advisory ignorado | reinício do portão 1 |
| 21 | 2026-09-30 | F3 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): cobertura 402 s, integração 279 s, e2e 137 s, segurança e contratos limpos |
| 2 | 2026-09-28 | F0 | 10 — segurança (`osv-scanner`) | portões 1–9 verdes, e2e incluso; advisory publicado para `multer@2.3.0` (GHSA-3pph-fpjx-jg34, DoS por escrita órfã em upload abortado; corrigido na 2.4.0), transitivo de `@nestjs/platform-express` — não veio da entrega | o override `pnpm.overrides.multer` sobe de `>=2.3.0` para `>=2.4.0`; o advisory não foi ignorado | reinício do portão 1 |
| 3 | 2026-09-28 | F0 | nenhum | depois do `multer` 2.4.0 | — | **11 portões verdes** (`pnpm verify:full` saiu 0) |
| 4 | 2026-09-29 | F1 | 1 — formatação | 25 arquivos novos da F1 fora do Prettier | `prettier --write` só neles | reinício do portão 1 |
| 5 | 2026-09-29 | F1 | 2 — lint | `parseArguments` do `pnpm allowlist` com complexidade 14 (teto 10) | opções numa tabela (`Map`) e posicionais numa função própria; comportamento igual, testes intactos | reinício do portão 1 |
| 6 | 2026-09-29 | F1 | 5 — duplicação (limiar 0) | 7 clones: `close`/`forget` do repositório de pastas, a entidade de notificação com os getters da `Device`, `omitting`/`redact`, os dois jobs de varredura, as duas listagens de pastas e dois casos de uso de uma linha | `letGo` no repositório; entidade com parameter properties; `omitting` por cópia; base `SweepJob` (o `DeviceExpiryJob` passou a usá-la, logs iguais); `RevalidatedFolders` compartilhada pelas listagens | reinício do portão 1 |
| 7 | 2026-09-29 | F1 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; 172 arquivos na barra de cobertura, 99,5 % das linhas |
| 8 | 2026-09-29 | F1 | 7 — cobertura (backend), no `verify:full` | 2761/2762 asserções passam; a que falhou é do plano 05 (`push.flow.spec`, S-51): "no frame arrived" depois de 15 s, sob a carga do `verify:full`. Sozinha, 3 de 3 verdes, e verde no ciclo 7 com o mesmo código — a corrida de carga já vista no plano 05 (ciclos 20 e 26 de lá), não da entrega | nenhuma no código; reinício honesto do portão 1 | reinício do portão 1 |
| 9 | 2026-09-29 | F1 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): integração 285 s, e2e 151 s, segurança e contratos limpos |
| 10 | 2026-09-29 | F2 | 5 — duplicação (limiar 0) | 4 clones: o trio `isLoading/error/reload` em `useRoots` e `useOpenFolders`; os dois botões da linha do recente; e duas listas de import iguais às de `UndoPanel` e `SessionScreen` — sintoma de o diálogo reimplementar os estados de lista e de o `FolderGate` montar um `Panel` à parte | `stateOf(query)` e `QueryState` nos hooks; `RowAction`; os três estados que não são linhas saem do `LoadedList` para o `ListStatus` compartilhado, que o diálogo passa a usar; a recusa do `FolderGate` vira `section` como o resto do workbench | reinício do portão 1 |
| 11 | 2026-09-29 | F2 | 7 — cobertura | a suíte de scripts rodou o `docs:check`, que achou o link para a âncora da D-24 sem a seção; e, medida à parte, a cobertura do web: `WorkbenchRoute` com um ramo inalcançável (`folder ?? ''`, que o `beforeLoad` já excluía) e `WelcomeScreen` sem o caso de fechar o diálogo | seção D-24 escrita; o `validateSearch` do `/workbench` devolve `folder` sempre como texto e o ramo passa para a rota, coberto pelo S-03; teste de `Esc` na boas-vindas, que devolve o foco ao botão | reinício do portão 1 |
| 12 | 2026-09-29 | F2 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; 172 arquivos na barra de cobertura, 99,5 % das linhas |
| 13 | 2026-09-29 | F2 | 10 — segurança (`osv-scanner`) | portões 1–9 verdes, e2e incluso (a `limits` já pelo workbench); três advisories de `brace-expansion` publicados hoje (GHSA-6j4f-fj2g-mc7p, GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 — DoS por recursão e expansão quadrática) nas versões 1.1.18, 2.1.4 e 5.0.9, que já estavam no lockfile do `main` — não vieram da entrega | overrides `brace-expansion@1 → ^1.1.21`, `@2 → ^2.1.7`, `@5 → ^5.0.12`, mantendo cada maior; nenhum advisory ignorado | reinício do portão 1 |
| 14 | 2026-09-29 | F2 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): cobertura 596 s, integração 289 s, e2e 135 s, segurança e contratos limpos |
| 15 | 2026-09-30 | F3 | 1 — formatação | dois arquivos (`FolderTabSelector.tsx`, `IconButton.tsx`) editados por script depois do Prettier | `prettier --write` só neles; o e2e `limits` passou a ler a sessão da secondary side bar (ela não navega mais para `/sessions/*`) | reinício do portão 1 |
| 22 | 2026-09-30 | F4 | 5 — duplicação (limiar 0) | 4 clones: `isRecord` reescrito na restauração de aba; a lista de ouvintes do registro de comandos igual à do `createRegistry`; "o status da conexão mudou de X para Y" nos avisos de conexão e na releitura das abas; a linha do recente no submenu e no modo da paleta | `isRecord` de `shared/lib/json`; `createListeners()` em `shared/lib/registry`; `useConnectionChange` e `isReconnecting` em `shared/hooks/useConnectionStatus`; `RecentFolderLabel` na `workspace` | reinício do portão 1 |
| 23 | 2026-09-30 | F4 | 7 — cobertura | 1–6 verdes; 7 arquivos do web abaixo da barra: fallbacks `?? 0` inalcançáveis no menu Arquivo e na escolha do modo; o teste de "a conexão voltou" mudava três estados num só `act` e o React os juntava — o reenvio acontecia pelo relógio, não pela reconexão; ramos de defesa dos comandos da aba sem unit; a recusa do clipboard (`useCopy`), o store do diálogo e o segundo clique no centro sem teste | fallbacks tirados pela forma dos dados; uma transição por `act`, com a asserção de que o reenvio veio da reconexão; specs unitários de `useWorkbenchCommands`, `useCopy`, `folder-dialog.store` e `useNotificationCenter` | reinício do portão 1 |
| 24 | 2026-09-30 | F4 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; cobertura por arquivo toda na barra |
| 25 | 2026-09-30 | F4 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): cobertura 442 s, integração 283 s, e2e 147 s, segurança e contratos limpos; o plano e o diário foram atualizados antes do disparo, este registro depois |
| 26 | 2026-09-30 | F5 | 1 — formatação | 25 arquivos novos ou tocados da F5 (telas, specs) fora do Prettier | `prettier --write` só neles | reinício do portão 1 |
| 27 | 2026-09-30 | F5 | 5 — duplicação (limiar 0) | 7 clones: listas de import iguais (a linha do recente com a das abas; o ping e o "Sobre" com a `SessionScreen`; o `HelpSheet` com a `ScreenFrame`) — sintoma de estados e sheet reimplementados —, o esqueleto da home igual ao do portão de login, e as três rotas simples (Dispositivos, Diagnóstico, Sobre) com o mesmo corpo | `RowAction` e `PingRow` em arquivos próprios; `LoadStatus` (carregando e erro) em `shared/components`, que o `ListStatus` compõe e o "Sobre" usa; `HelpDrawer` único para a ajuda em sheet (moldura no celular e workbench), com o foco no sheet para os dois; `ScreenLoading` no `app/`; `useFramedScreen` para as rotas que são só corpo | reinício do portão 1 |
| 28 | 2026-09-30 | F5 | 7 — cobertura (suíte dos scripts) | 1–6 verdes; dois testes do `i18n:check` em `test/integration/scripts/gates.spec.mjs` editam um grupo real do catálogo, `session.ping`, que foi para `diagnostics.ping` com o ping | os dois testes apontam para `diagnostics.ping` | reinício do portão 1 |
| 29 | 2026-09-30 | F5 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; 172 arquivos na barra de cobertura, 99,5 % das linhas |
| 30 | 2026-09-30 | F5 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): cobertura 422 s, integração 309 s, e2e 158 s (as specs migradas para a aba e a nova `screens`), segurança e contratos limpos; o diário foi fechado depois do disparo, só com este registro e o estado da fase |
| 31 | 2026-09-30 | F6 | 3 — tipagem (e2e) | 1–2 verdes; `workbench-phone.spec.ts` lia `document` dentro de `page.evaluate`, e o tsconfig do `e2e` não tem a lib DOM | o `evaluate` de um locator (`html`), que o Playwright tipa | reinício do portão 1 |
| 32 | 2026-09-30 | F6 | 5 — duplicação (limiar 0) | 1–4 verdes; 3 clones: as specs novas repetiam o preâmbulo (login da suíte, sem abas, árvore, rótulo da raiz, aba aberta pela API) — as listas de import iguais entre si e às de `commands-and-undo` —, e o início do S-157 igual ao de um teste do `limits` | `workbenchSuite()` em `fixtures/folder-tree.ts`, que as quatro specs usam; o S-157 começa pela árvore | reinício do portão 1 |
| 33 | 2026-09-30 | F6 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): cobertura 518 s, integração 324 s, e2e 223 s (63 specs, as 12 da F6 inclusas), segurança e contratos limpos |
| 34 | 2026-09-30 | F6 | — (não rodado) | depois do ciclo 33: o status real da recusa no log de I/O (S-209) e o runner do e2e sem bloquear o loop (S-210) | validados só por checagens direcionadas: formatação, lint, tipos, duplicação, o unit e a integração do interceptor, a integração do runner (8/8) e o e2e `http-contract` (9/9). O `pnpm verify:full` **não** foi rodado de novo, por decisão do usuário ao encerrar o plano | **plano encerrado sem um `verify:full` sobre essas duas mudanças** — o próximo disparo o cobre |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-26 | F3 (layout) dividida em três fases: F3 moldura e casca, F4 comandos e notificações, F5 telas separadas; o e2e passou a F6 | cada parte é um ciclo de validação próprio, com outra superfície de teste | fases F3…F6, `F4-e2e.md` renomeado para `F6-e2e.md` |
| 2026-09-26 | Paridade com o VS Code restrita à de arquivos (decisão do usuário) | "não precisamos de tudo do VS Code" | saíram editor de atalhos, vários temas, zen mode, layout configurável, menu completo (fica o Arquivo), walkthrough e a confiança da pasta (servia a planos removidos) |
| 2026-09-26 | Chat do Claude e arquivos/editor na mesma aba, lado a lado (decisão do usuário) | o chat não é tela própria | B-21, B-22, B-33, S-116, S-117, S-150 |
| 2026-09-28 | As 14 decisões em aberto fechadas pelo usuário, em perguntas uma a uma; dez seguem a recomendação | as fases dependiam delas para começar | [decisions.md](decisions.md) D-04…D-17 |
| 2026-09-28 | Rotas `/sessions/$id`, `/history` e `/history/$conversationId` removidas neste plano, sem deep link (D-07, contra a recomendação) | escolha de navegação do usuário, que aceitou o histórico fora do web até o plano 08 | B-05, B-33, B-39, S-06, S-150, S-163; specs `history-and-resume` e `commands-and-undo` migram na B-33; [plano 08](../08-claude-panel/decisions.md) ganhou a D-24 |
| 2026-09-28 | Histórico de notificações no servidor: 30 dias, teto de 200, "lida" sincronizada (D-17, contra a recomendação) | o usuário quer reencontrá-lo em outro dispositivo | nova B-40 na F1, B-03, B-04, B-26, S-131, S-132, S-167…S-178, S-182 |
| 2026-09-28 | Aba inativa: sessões e terminais continuam anexados (D-11, híbrido) | resolve a divergência com os planos 08 e 12 | B-20, S-108, S-181; D-11 do plano 08 fechada; nota do plano 13 · B-16 |
| 2026-09-28 | Recarga da allowlist só por `SIGHUP`; o watch do arquivo foi considerado e descartado (D-15) | manter a regra "recarga explícita" de backend/03 | B-11, S-62, S-179, S-180 |
| 2026-09-28 | S-03 → B-16, S-05 → B-20 e a metade "removidas" do S-06 → S-150 (D-18, decisão do usuário) | dependem da boas-vindas, das abas no servidor e da remoção das rotas, que são de fases seguintes; remover as rotas já quebraria o e2e que só migra na B-33 | F0, F2, F3, F5, S-03, S-05, S-06, S-150 |
| 2026-09-28 | O `i18n:check` passa a reprovar `messageKey` que o backend envia e o catálogo do web não traduz (S-01) | a checagem de órfãs lia o backend só como uso; a chave enviada e nunca declarada chegava à tela crua — e havia uma: `session.error.invalidTransition`, agora traduzida | `scripts/lib/i18n.mjs`, `scripts/i18n-check.mjs` |
| 2026-09-28 | A rota de versões do "Sobre" é `GET /diag/versions`, no módulo `diag` | a B-03 deixava o módulo ao documento; `diag` já é o do ping, e `/health` não tem autenticação | [backend/03 · diag](../../architecture/backend/03-modules.md#diag), B-12 |
| 2026-09-28 | DTOs Zod das rotas do `workspace` e tipos do web escritos na F0; os de versões e notificações nascem com os seus módulos (B-12, B-40) | o contrato do `workspace` é o que o S-02 testa; os outros dois ainda não têm módulo onde morar | `workspace.dto.ts`, `features/workspace/types/workspace.ts` |
| 2026-09-29 | O "catálogo de chaves" das notificações é uma lista fechada no domínio, chave → parâmetros ([D-19](decisions.md#d-19--o-catálogo-de-chaves-das-notificações), **a confirmar pelo usuário**) | nenhum documento dizia qual catálogo; o do web não é legível pelo backend | `domain/notification`, traduções novas no web (`notification.*`), B-26 acrescenta as suas |
| 2026-09-29 | O próprio app grava o pid em `RC_PID_FILE` (variável nova) e o Nest deixa de escutar `SIGHUP` no shutdown ([D-20](decisions.md#d-20--como-o-pnpm-allowlist-acha-o-processo-do-app)) | o `pnpm dev` roda o backend sob `tsx watch`: o pid disparado é o do watcher; e o `enableShutdownHooks()` sem lista fecharia a aplicação no sinal | `.env.example`, `bootstrap.ts`, `LifecycleModule`, `stack.mjs`; o `.env` local ganhou a linha |
| 2026-09-29 | Teto de 20 recentes não fixados; tirar dos recentes uma pasta aberta mantém a aba; `rootLabel` do recente vira `string \| null` ([D-21](decisions.md#d-21--o-teto-de-recentes-e-o-recente-de-uma-aba-aberta)) | a B-09 não dava o número, e recente e aba são a mesma linha | `folder-rules.ts`, `workspace.dto.ts`, backend/03 |
| 2026-09-29 | O teto de 1000 da listagem fica (D-05, medido) | o maior diretório real, `node_modules/.pnpm` deste monorepo, tem 977 subpastas | nenhuma mudança |
| 2026-09-29 | Node mínimo sobe de 22 para **22.18** | o `pnpm allowlist` importa o schema de `packages/config/src/*.ts` direto, e o Node só tira os tipos sem flag a partir daí (D-09) | `package.json` (`engines`), `pnpm doctor`, README |
| 2026-09-29 | `CONFLICT: 409` entra no catálogo do código | o documento já tinha a linha desde a F0; no código ela faltava e o `CONFLICT` sairia como 500 | `error-catalogue.ts` |
| 2026-09-29 | Web: tipos de versões e de notificações **não** nascem na F1 | sem consumidor no web até a B-26/B-32, seriam arquivos órfãos; os DTOs do backend são o contrato | F4, F5 |
| 2026-09-29 | A home vira a boas-vindas já na F2; seletor de workspace, "Iniciar sessão" da home e o store global saem junto ([D-22](decisions.md#d-22--o-que-a-home-mostra-entre-a-f2-e-a-b-33), **a confirmar pelo usuário**) | o store deixou de ser a origem do `workspacePath` (B-16) e o seletor escolheria nada | `App.tsx`, `features/workspace`, S-149 (metade do store adiantada); a e2e `limits` passa a abrir `/workbench?folder=` |
| 2026-09-29 | Gravar a aba ao abrir é passo seguinte à resolução, e a recusa dela não bloqueia a pasta ([D-23](decisions.md#d-23--abrir-pela-url-no-teto-de-abas-antes-de-existir-fechar-aba)) | fechar aba só nasce na F3; no teto de 8 a pasta ficaria inalcançável | `useFolder`, `FolderGate`, S-183 |
| 2026-09-29 | `Ctrl+O`/`Cmd+O` na boas-vindas até a B-23; busca nos recentes com mais de 8 ([D-24](decisions.md#d-24--o-atalho-do-abrir-pasta-e-quando-a-lista-de-recentes-ganha-busca)) | a B-14 não dava atalho nem número | `useOpenFolderShortcut`, `useRecentFolders`, S-185, S-186 |
| 2026-09-29 | O `i18n:check` passa a reprovar `t('chave')` estático que o catálogo do web não declara (S-84) | a checagem de órfãs lia só a outra direção; a chave pedida e não declarada chegava à tela crua | `scripts/lib/i18n.mjs`, `scripts/i18n-check.mjs`, [02-i18n · Garantias](../../architecture/shared/02-i18n.md#garantias-automatizadas) |
| 2026-09-29 | Primitivos `dialog` e `context-menu` do shadcn (Radix) entram no web; o `DialogContent` devolve o foco a quem o tinha ao abrir (`// CUSTOM:`) | o Radix devolve ao `DialogTrigger`, e diálogo aberto por atalho não tem um — o foco caía na página | `package.json` do web, `shared/components/ui/` |
| 2026-09-29 | Os estados de lista que não são linhas saem do `LoadedList` para o `ListStatus` compartilhado | o diálogo "Abrir pasta" reimplementava os mesmos três estados (ciclo 10) | `shared/components/ListStatus.tsx`, `LoadedList.tsx` |
| 2026-09-30 | S-05 adiado para a B-33; **Workbench** da navegação leva à aba ativa ([D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa), decisão do usuário) | redirecionar `/` esconderia ping e dispositivos de quem tem abas até a F5 | F3, F5 · B-33, S-05, S-187 |
| 2026-09-30 | Um store por sessão para a conversa e para a fila de permissão, e anexos com contagem de donos ([D-26](decisions.md#d-26--um-store-por-sessão-e-anexos-com-dono)) | a sessão da aba inativa fica anexada (D-11) com a árvore desmontada; com um store global, duas sessões anexadas se misturariam | `features/session`, `features/permission`, `shared/api/attachments.ts`, `useRetainedSession`, web/04 |
| 2026-09-30 | Sino, atalhos da casca e primitivos `command`/`menubar`/`sonner`/`select` nascem na F4/F5 ([D-27](decisions.md#d-27--o-que-a-f3-deixa-para-a-f4-e-a-f5)) | o dono de cada um é de fase seguinte; gerá-los agora seria código morto | B-17, B-19, B-21, S-114 |
| 2026-09-30 | A moldura e o portão de login num layout sem caminho (`_frame`); o `returnTo` é o endereço na tela | "o portão é da moldura" (web/03) e nenhuma tela pode esquecê-lo; `auditLocation`/`historyLocation` saem, e os testes de rota montam a tabela real (`test/support/app.tsx`) | `router.tsx`, `FramedOutlet`, `SignedIn`, web/04 |
| 2026-09-30 | Lint `no-literal-colour` e `icons-only-lucide`; `i18n:check` exige a ajuda de toda `<ScreenFrame help="…">` | S-87, S-94: regra que máquina não verifica não existe | `eslint.config.mjs`, `scripts/lib/i18n.mjs`, 02-i18n, 09-code-quality |
| 2026-09-30 | Conveniência por visitante só por `shared/lib/visitor-storage.ts` (prefixo `rc.visitor.`, `try/catch`) | tema, idioma, ajuda aberta, tamanhos e a última aba; a regra do `localStorage.setItem` guarda o token, e nada aqui é credencial | web/03 · Tema |
| 2026-09-30 | O idioma troca pela status bar, por visitante | a status bar "mostra o idioma" (S-114) e a D-13 o faz por visitante; mostrar sem poder trocar seria um rótulo | `shared/hooks/useLocale.ts`, `providers.tsx`, S-190 |
| 2026-09-30 | `Skeleton` com `role="status"` (`// CUSTOM:`); `SignOutButton` removido (o menu de conta o substitui); cabeçalho do `FolderGate` sai (nome e caminho estão na aba e na status bar) | o axe reprovou o rótulo de um `div` sem papel no workbench; o resto ficou sem uso | `shared/components/ui/skeleton.tsx`, `features/auth`, `FolderGate` |
| 2026-09-30 | A pergunta de fechar aba só fecha pelos botões ou `Esc` | o segundo clique de um clique duplo em "fechar" caía fora dela e a dispensava (S-109, S-188) | `CloseFoldersDialog` |
| 2026-09-30 | Um diálogo "Abrir pasta" na moldura; cada comando registrado por quem executa a ação, enquanto montado ([D-28](decisions.md#d-28--um-diálogo-abrir-pasta-e-comandos-registrados-por-quem-os-executa)) | o comando está no menu e na paleta de toda tela; eram dois diálogos com estados próprios | `FolderDialogHost`, `useFolderDialog`, `useCommands`, `WelcomeScreen`, `Workbench`; o `useOpenFolderShortcut` sai |
| 2026-09-30 | Atalhos: paleta `Ctrl/Cmd+Shift+P` e `F1`, ajuda `Shift+F1`, side bar `Ctrl/Cmd+B`, painel `Ctrl/Cmd+J` ([D-29](decisions.md#d-29--os-atalhos-que-a-d-16-não-fixou), **a confirmar pelo usuário**) | a B-23 não os fixava; `Cmd+Alt+←/→` da D-16 é também o atalho de troca de aba do Chrome no Mac — fica para a medição | `features/commands`, `useWorkbenchCommands`, `useAppCommands`, web/03 |
| 2026-09-30 | Emissores de notificação desta fase e o texto do `command` ([D-30](decisions.md#d-30--o-que-emite-notificação-nesta-fase)) | a D-17 dizia o que pode, não quem emite | `execute-command`, `useConnectionNotices`, `useAllowlistNotices`; `notification.tabs.saveFailed` sem emissor |
| 2026-09-30 | Restauração por aba num registro (`tabRestorers`) e uma chave só ([D-31](decisions.md#d-31--um-registro-de-restauração-por-aba)) | a B-27 pede um gancho para os planos 07 e 08; os tamanhos viviam numa chave por pasta | `store/tab-state.ts`, `folder-tab.store.ts`, `useWorkbenchLayout`, web/04 |
| 2026-09-30 | Primitivos `command` (cmdk), `menubar` e `sonner` entram no web; o `Toaster` recebe o tema de quem o monta (`// CUSTOM:`) | o dono é esta fase (D-27); o shadcn usa `next-themes` | `web/package.json`, `shared/components/ui/` |
| 2026-09-30 | Menu "gerenciar" e menu Arquivo rodam a ação depois de fechar (`afterClose`) | um diálogo aberto por item de menu lembraria o item, já desmontado, como o lugar de devolver o foco | `AppFrame`, `FileMenu`, `CommandPalette` |
| 2026-09-30 | O ping vai para `features/diagnostics`; "reconectar" é `wsClient.reconnect()`, que respeita o prazo do servidor; tema com preferência "do sistema"; densidade `compact`/`comfortable` por token; busca sobre as opções que cada seção declara; o "Sobre" diz que o repositório não declara licença ([D-32](decisions.md#d-32--o-que-a-f5-decidiu-na-execução)) | as tarefas B-29…B-32 diziam o quê, não onde nem como | `features/diagnostics`, `shared/api/ws-client.ts`, `useTheme`, `useDensity`, `globals.css`, `features/settings`, `features/about` |
| 2026-09-30 | Um ping em voo por vez, casado pelo `nonce` | o S-141 ("dois pings seguidos") sem desfazer o duplo clique que manda um ([00 · S-110](../00-bootstrap/scenarios.md)) | `usePing`, `ping.store`, S-205 |
| 2026-09-30 | `/` com abas **substitui** o endereço pelo da aba ativa e espera o conjunto de abas antes de decidir; conjunto que não se pôde ler abre a boas-vindas (S-05) | voltar não pode quicar entre `/` e a aba, e um relance da boas-vindas no caminho seria uma tela que mentiu | `App.tsx`, web/04 |
| 2026-09-30 | O workbench ganha ajuda: `HelpSheet` (sheet sobre a aba, aberto por pedido), e o `i18n:check` lê `<HelpSheet help="…">` como lê `<ScreenFrame>`; "saiba mais" é o `LearnMore`, que não aparece onde a tela não tem ajuda | a B-34 pede a ajuda do workbench, e ele não tem moldura de tela; dentro do diálogo modal a ajuda abriria atrás dele | `shared/components/HelpSheet.tsx`, `LearnMore.tsx`, `useHelpPanel.requested`, `scripts/lib/i18n.mjs`, 02-i18n, web/03 |
| 2026-09-30 | `useCopy` vai para `shared/hooks/` | três features o usam (`workspace`, `workbench`, `about`) — a regra de web/02 | `shared/hooks/useCopy.ts` |
| 2026-09-30 | `EmptyState`/`LoadedList` aceitam uma ação; `RootList` e `RecentFolderList` ganham o modo só leitura/gestão usado em Configurações; o botão de linha do recente vira `IconButton` | "todo estado vazio ensina com uma ação" (S-152) e "todo controle só de ícone tem tooltip" (S-151): o botão usava `title`, que não é tooltip | `shared/components`, `features/workspace` |
| 2026-09-30 | e2e: `commands-and-undo` e `history-gap` abrem a sessão pela aba (fixture nova `e2e/fixtures/workbench.ts`, que o `limits` reusa) e fecham a aba no fim; `vertical-slice` pinga em `/diagnostics`; spec novo `screens` (06·S-143, 06·S-148) | B-33: contrato quebrado numa ponta só é bug; e o teto de 8 abas por usuário alcançaria a suíte | `e2e/specs`, `e2e/fixtures/workbench.ts`, `e2e/scenarios/screens-*.json` |
| 2026-09-30 | Gravação nova `cwd-turn` (`pnpm fixtures:record`), e o replay põe o diretório da sessão no lugar do `/workspace` gravado — só no que o Claude diz ([D-33](decisions.md#d-33--o-que-a-f6-decidiu-na-execução)) | o S-156 pede o Claude roteirizado reportando o `cwd`; fixture escrita à mão provaria só o fake | `record-agent-sdk-fixtures.mjs`, `scripted-query.ts`, S-207 |
| 2026-09-30 | O web esquece sessões, filas e o estado das abas quando a autenticação **passa a** `anonymous`, não no `null` com que toda página começa (D-33) | o S-158 achou que toda recarga apagava o layout guardado das abas — o S-134 só valia em jsdom | `app/providers.tsx`, S-208 |
| 2026-09-30 | O centro de notificações recebe o foco no próprio sheet (D-33) | o S-160 achou o primeiro `Esc` fechando o tooltip do botão focado, não o centro | `NotificationCenter.tsx` |
| 2026-09-30 | `@axe-core/playwright` entra no pacote `e2e` (D-33) | contraste só se julga num navegador de verdade (S-162) | `e2e/package.json`, web/06-testing |
| 2026-09-30 | Status real da recusa no log de I/O do HTTP, e o runner do e2e sem bloquear o loop, com o log do backend em arquivo em toda execução (D-33) | toda recusa era logada com 200; e o `smoke-live` lia um log que parava no boot | `io-logging.interceptor.ts`, `run-e2e-local.mjs`, `http-contract.spec.ts`, S-209, S-210 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | Redesenho da Auditoria e das Regras | têm plano próprio | planos [14](../14-audit-explained/README.md) e [15](../15-rules-management/README.md) |
| 2026-09-26 | Profundidade de Dispositivos e de Logs e diagnóstico | têm plano próprio | planos [17](../17-devices/README.md) e [18](../18-logs-and-diagnostics/README.md) |
| 2026-09-26 | Seção "Claude" das Configurações | configuração do Claude é tela própria | plano [13](../13-claude-settings/README.md) |
| 2026-09-26 | Editor de atalhos, vários temas, zen mode, layout configurável, menu completo, walkthrough | decisão do usuário: paridade é a de arquivos | fora do produto |
| 2026-09-28 | Ler, continuar e desfazer conversa antiga pelo web (hoje em `/history`), e os cenários de e2e do web que só entravam por lá | decisão do usuário (D-07): as rotas antigas saem sem deep link | plano [08](../08-claude-panel/README.md), view Sessões; o app continua com o histórico |
| 2026-09-29 | O botão "Histórico" por raiz da home — a única entrada **pela tela** para `/history?workspacePath=` | saiu com o seletor de workspace ([D-22](decisions.md#d-22--o-que-a-home-mostra-entre-a-f2-e-a-b-33)), três fases antes da rota | as rotas continuam respondendo pelo link até a B-33; o histórico volta com o plano [08](../08-claude-panel/README.md) |
| 2026-09-30 | S-05 (`/` com abas vai para a ativa) | decisão do usuário ([D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)): ping e dispositivos ainda moram na home | F5 · B-33 |
| 2026-09-30 | O sino da status bar; os atalhos de alternar side bar e painel e o da ajuda; os primitivos `command`, `menubar`, `sonner` e `select` | [D-27](decisions.md#d-27--o-que-a-f3-deixa-para-a-f4-e-a-f5): cada um com quem o usa | F4 · B-23, B-24, B-25, B-26; F5 |
| 2026-09-30 | A medida em pixels do celular (360 px sem scroll horizontal, alvos 44×44) e o contraste AA medidos no navegador | jsdom não tem layout: a estrutura está provada na integração, a medida pede um navegador | F6 · S-161, S-162 |
| 2026-09-30 | Os e2e do web `history-resume` (04·S-46) e `history-workspace-removed` (04·S-53), e o "ver a conversa inteira" do `limits` · idle (05·S-42) | só tinham porta em `/history`, removida pela D-07 — saem, nunca `skip`; os JSONs dos cenários ficam para o plano 08 | [08 · S-266](../08-claude-panel/scenarios.md); o app segue provando o histórico no `integration_test` |
| 2026-09-30 | O primitivo `select` do shadcn, que a D-27 deixava para a F5 | as escolhas de Configurações são grupos de rádio nativos: dois ou três valores leem-se de relance e as setas movem entre eles | nenhum — não foi necessário |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Listagem de pastas vira um mapa da máquina | 🔲 aberto | mitigação nas B-06…B-08, D-03, D-04 |
| R-02 | Cópia local da allowlist afrouxa a fronteira | 🔲 aberto | mitigação na B-10, D-09 |
| R-03 | Estado vazando entre abas de pasta | 🔲 aberto | store por pasta (B-20, S-99) e por sessão (D-26); o store global saiu na B-33, com teste que impede a volta (S-149) |
| R-04 | Plano grande — sete fases | 🔲 aberto | escopo cortado pela decisão do usuário; corte extra se registra aqui |
| R-05 | Abas inativas consomem memória e anexos | 🔲 aberto | D-11 decidida e feita (árvore desmontada, sessões anexadas — S-181, D-26); falta medir a memória por aba |
| R-06 | Atalhos que o navegador não entrega | 🔲 aberto | D-16 decidida; falta medir nos três navegadores |
| R-07 | Deep links de hoje quebrados pela moldura | 🔲 aberto | S-06, S-91, S-163; os de sessão e histórico saem por decisão (D-07) |
| R-08 | Planos 13–15 e 16–18 dependem dos registros deste | 🔲 aberto | registros documentados na F0 ([web/03 · Os registros](../../architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam)); testados na F3–F5 |

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
