# Plano 07 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está concluído: F6, F7 e F8 em 2026-10-01, com `pnpm verify:full` verde (ciclo 24) e `pnpm test:e2e:mobile` verde; F3, F4 e F5 em 2026-10-01 (ciclo 17); F0, F1 e F2 em 2026-09-30 (ciclo 7)
**Última atualização:** 2026-10-01
**Bloqueios:** nenhum. A D-08 fechou com o spike B-19 (chokidar v5) — ver [decisions.md](decisions.md)

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
F8 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-06 | 6/6 | ✅ |
| [F1](F1-file-read.md) | B-07…B-10 | 4/4 | ✅ |
| [F2](F2-file-write.md) | B-11…B-18 | 8/8 | ✅ |
| [F3](F3-file-watch.md) | B-19…B-23 | 5/5 | ✅ |
| [F4](F4-explorer.md) | B-24…B-30 | 7/7 | ✅ |
| [F5](F5-editor.md) | B-31…B-42 | 12/12 | ✅ |
| [F6](F6-e2e.md) | B-43…B-46 | 4/4 | ✅ |
| [F7](F7-previews-and-transfer.md) | B-47…B-54 | 8/8 | ✅ |
| [F8](F8-local-history.md) | B-55…B-61 | 7/7 | ✅ |
| **Total** | **B-01…B-61** | **61/61** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 360 | 0 | 0 | 360 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 26 | 0 | 0 | 26 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-30 | F0–F2 | 1 — formatação | o teste Dart novo de B-05 sem `dart format` | `pnpm format` no mobile | reiniciado do portão 1 |
| 2 | 2026-09-30 | F0–F2 | 2 — lint | `decodeText` com complexidade 15 (teto 10) | dividido em `knownEncoding` e `refuseWhatIsNotText`, sem mudar o comportamento | reiniciado do portão 1 |
| 3 | 2026-09-30 | F0–F2 | 5 — duplicação | 13 clones (teto 0) | `keysetPage` comum às duas leituras da trilha, `compareNames` exportado pelo `workspace`, `kindOf`/`codeOf` num lugar só, `pageQuery` e `textOptions` nos DTOs, `FileWriting` como objeto de dependências de salvar, criar, apagar e do relocador — que passou a gravar a trilha, deixando mover e copiar com a única diferença deles | reiniciado do portão 1 |
| 4 | 2026-09-30 | F0–F2 | 6 — unit | `.env.example`: `RC_FILES_COPY_MAX_BYTES` sem comentário próprio | um comentário por variável | reiniciado do portão 1 |
| 5 | 2026-09-30 | F0–F2 | 6 — unit | `environment.spec` com a forma antiga da configuração | o bloco `files` na expectativa, e um teste da recusa nova (limiar do modo leve acima do teto de edição) | reiniciado do portão 1 |
| 6 | 2026-09-30 | F0–F2 | 7 — cobertura (109 testes de integração vermelhos) | **bug real**: o parser JSON próprio de `/files` se chamava `jsonParser`, e o Nest pula o parser global quando acha um middleware com esse nome — toda outra rota perdia o corpo. Os testes de `files` passavam porque só `/files` era lido | o parser de `/files` embrulhado numa função de nome próprio (`filesBodyParser`), e um teste que prova que as outras rotas mantêm o corpo e o limite global | reiniciado do portão 1 |
| 7 | 2026-09-30 | F0–F2 | — | — | — | ✅ **`pnpm verify:full` verde — os onze portões** |
| 8 | 2026-10-01 | F3 | — | — | — | ✅ **portões básicos do backend verdes** (`pnpm --filter backend verify`: formatação, lint, tipos, arquitetura, duplicação, unit 2 385 testes, cobertura unit + integração 3 205 testes), testes da raiz de `scripts/` verdes exceto o portão de duplicação do repositório inteiro, vermelho só por clones do web da F4/F5 em andamento; `contracts:check` verde. O `verify:full` fica para o fim da F5, por pedido do usuário |
| 9 | 2026-10-01 | F4 | — | — | — | ✅ **portões básicos do explorer verdes**, sobre os arquivos da fase (o resto do web tem a F5 em andamento): formatação e lint limpos, arquitetura 28/28, unit + integração de explorer, auditoria e workbench 44 arquivos / 356 testes, cobertura de `features/explorer` e `features/audit` 100 / 98,5 / 100 / 100 (nenhum arquivo abaixo de 92 % em branches), `i18n:check` sem problema; um clone em `shared/api/folder-watches.ts` (da costura) desfeito |
| 10 | 2026-10-01 | F3–F5 | 1 — formatação | os dois testes das costuras (`folder-watches.spec.ts`, `files-drag.spec.ts`) sem `prettier` | `prettier --write` nos dois | reiniciado do portão 1 |
| 11 | 2026-10-01 | F3–F5 | 3 — tipagem | `scripts/editor-bundle.mjs` (a medida do chunk do Monaco, B-31) com um parâmetro sem tipo — o `tsc` de `scripts/` não roda no lint por arquivo | `@param {string}` no JSDoc | reiniciado do portão 1 |
| 12 | 2026-10-01 | F3–F5 | 5 — duplicação | o modelo `FileText` do web repetia campo a campo o `FileContentDto` do backend | o modelo ganhou `format: TextFormat` (encoding, BOM, fim de linha — o trio que a leitura, o salvar e o salvar como carregam juntos), e o DTO privado do service passou a ser **derivado** do modelo (`Omit<FileText, 'format'> & TextFormat & { mtime }`), não reescrito | reiniciado do portão 1 |
| 13 | 2026-10-01 | F3–F5 | 7 — cobertura (2 de 2 016 testes do web) | **tempo esgotado sob carga externa**, não regra: `WorkbenchCommands` S-134 (plano 06) e `EditorTabs` S-215 levam ~0,9 s sozinhos e ~1,3 s com cobertura, e passaram de 15 s enquanto um build Gradle/Kotlin aberto pelo VS Code, fora desta validação, disputava a máquina (carga 16 em 12 núcleos) | nenhuma mudança de código, nem de timeout; se repetir sem a carga, vira correção nos testes | reiniciado do portão 1 |
| 14 | 2026-10-01 | F3–F5 | 7 — cobertura (1 de 3 205 testes do backend: `push.flow` S-51, plano 05) | o **mesmo** sintoma do ciclo 13 com outro teste e sem carga externa relevante (carga 35 em 12 núcleos, toda nossa): o `pnpm -r test:coverage` roda backend e web **ao mesmo tempo** (os dois "Start at 04:06:33" no ciclo 13), cada um com todos os núcleos, e o web cresceu com a F4/F5 (199 arquivos, 2 016 testes jsdom) — os testes que dependem de tempo dos dois lados passam do limite. A causa é a validação, não o código | `test:coverage` e `test:integration` da raiz com `--workspace-concurrency=1` (uma ponta por vez); nenhum timeout, teste ou limiar mudou; registrado no [protocolo](../../architecture/shared/11-validation-protocol.md) | reiniciado do portão 1 |
| 15 | 2026-10-01 | F3–F5 | 9 — e2e (4 de 68: S-243…S-246, o Monaco real, rodando pela primeira vez) | a espera de "editor pronto" do spec pedia `toBeVisible` no campo de entrada do Monaco — um `div` sem tamanho (`native-edit-context`) que nunca é visível; a captura de tela mostrava o arquivo aberto, com conteúdo e status bar. Defeito do teste, não do editor | o spec espera o campo **presente** e a primeira linha do arquivo **desenhada**; os quatro passam isolados (13,8 s) | reiniciado do portão 1 |
| 16 | 2026-10-01 | F3–F5 | 10 — segurança (osv-scanner) | `dompurify@3.4.15`, GHSA-p98j-92pf-mc4p (DOM XSS no hook `afterSanitize` com `IN_PLACE`), trazido **só** pelo `monaco-editor@0.57.0`, que fixa a versão exata | `pnpm.overrides` `"dompurify": ">=3.4.16"` na raiz (o padrão do repositório para transitiva), versão de correção; o aviso não foi ignorado. `pnpm scan:security` isolado: tudo verde, semgrep incluso | reiniciado do portão 1 |
| 17 | 2026-10-01 | F3–F5 | — | — | — | ✅ **`pnpm verify:full` verde — os onze portões** (formatação, lint, tipos, arquitetura, duplicação, unit, cobertura, integração, e2e com o Monaco real, segurança, contratos e i18n); o portão 12 (Sonar) segue ausente declarado |
| 18 | 2026-10-01 | F6 | 9 — e2e (5 de 11 de `explorer-editor.spec.ts`, o explorer pela primeira vez num navegador real) | **dois defeitos do produto** e três esperas do teste: o menu de contexto modal do Radix deixava a página com `aria-hidden` e focável (`aria-hidden-focus` no axe, S-289); o S-285 não podia clicar num desfazer que não faria nada (plano 04 · S-38); a linha renomeada só ganha o nome novo quando o campo some (S-281) | `ContextMenu` não modal por padrão (D-21), com teste de integração que falha sem a correção; S-285 prova a confirmação na tela e o `session.rewound` pelo socket da suíte (D-23) | reiniciado do e2e da fase — os portões completos ficam para o fim da F8 |
| 19 | 2026-10-01 | F6 | 9 — e2e (1 de 11: S-289 no tema escuro) | **defeito do produto**: o comentário do `vs-dark` do Monaco (`#608b4e` em `#1e1e1e`) mede 4,2:1, abaixo do AA | tema `remote-claude-dark`, herdando o `vs-dark`, com o comentário a 5,0:1 (D-22) e teste unitário que mede o contraste | reiniciado |
| 20 | 2026-10-01 | F6 | — | — | — | ✅ **`explorer-editor.spec.ts` verde: 11 de 11** (S-280…S-290), stack derrubada; formatação, lint e tipos limpos nos arquivos tocados |
| 21 | 2026-10-01 | F7, F8 | 5 — duplicação (7 clones, todos em `e2e/specs/*` e na ajuda) | os specs da F6 e da F8 repetiam a espera do Monaco, o axe e o "Claude ao lado"; a F8 quebrou S-281/S-282 da F6, que esperavam o diálogo do apagar definitivo — com o histórico, apagar o que cabe nele não pergunta mais | `e2e/fixtures/explorer.ts` e `page-checks.ts` com o que se repetia; S-281 espera o aviso com Desfazer, S-282 prova a contagem com um arquivo esparso um byte acima do teto do histórico (D-25) | reiniciado |
| 22 | 2026-10-01 | F8 | — | — | — | ✅ **`local-history.spec.ts` 3 de 3**, e os specs que mudaram (`explorer-editor`, `commands-and-undo`, `workbench-a11y`, `workbench-phone`) 17 de 17 |
| 23 | 2026-10-01 | F7 | — | — | — | ✅ **`previews-transfer.spec.ts` 4 de 4**; `lint:dup` com 0 clones |
| 24 | 2026-10-01 | F6–F8 | — | — | — | ✅ **`pnpm verify:full` verde — os onze portões na primeira execução** (unit 2 640 + 1 475 + 904 do app; cobertura do backend 3 588 testes e do web 2 239, 90 % por arquivo; integração; e2e 86 de 86; segurança; contratos e i18n), e **`pnpm test:e2e:mobile` verde: 15 de 15**, emulador e daemons do Gradle derrubados no fim; o portão 12 (Sonar) segue ausente declarado |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-26 | O plano ganhou as fases F7 (prévias e transferência) e F8 (histórico local), depois da F6 do núcleo | o usuário pediu paridade com o VS Code **nas funções de arquivo**; os arquivos de fase F0…F6 já existiam e não são renomeados, então as fases novas vêm depois do e2e do núcleo, cada uma com o seu próprio e2e | README, decisions (D-16…D-18), scenarios |
| 2026-09-26 | Inteligência de linguagem e depuração saíram do alcance, e o git saiu do plano 09 | decisão do usuário: "não vai ter debug, nem inteligência de linguagem"; o plano 09 ficou só com busca | README (Não entra), D-09, F8 (a Linha do tempo é só histórico local) |
| 2026-09-26 | A árvore e as abas viraram fonte de arraste para o chat do Claude (B-42) | pedido do usuário; o alvo é do plano 08 | F5, D-20 |
| 2026-09-30 | `EACCES`/`EPERM`/`EROFS` em arquivo ou pasta da pasta aberta respondem **`422`**, não `403`: árvore ilegível reusa `WORKSPACE_DIRECTORY_UNREADABLE`, e ler/escrever arquivo que o sistema recusa é o código novo `FILE_ACCESS_DENIED` (`params.reason`: `permission`·`readOnlyFileSystem`) | **decisão do usuário** sobre o conflito entre S-33/S-58/S-77 (que diziam `FORBIDDEN`) e o doc 04, que já dizia que "a autorização passou, é o disco que recusa" (precedente do plano 06) | [scenarios](scenarios.md) S-33, S-58, S-77; doc 04; B-03 |
| 2026-09-30 | S-10…S-13 passaram para B-24, B-26 e B-40; S-03 para B-21 | **decisão do usuário** para os quatro de UI: testam o explorer e o editor, que só nascem na F4/F5 — a F0 entrega a B-06 como desenho normativo (web/03, web/04). S-03 valida o payload no handler de `workspace.watch`, que é da B-21 | [scenarios](scenarios.md), [F0](F0-contract.md#cenários-cobertos) |
| 2026-09-30 | S-04 é provado em `unit`, não em e2e | o app nunca pede `workspace.watch`, então num e2e real o frame nunca chega — o teste não provaria nada. O risco real achado foi outro: um `workspace.*` com `seq` lido como evento desconhecido de sessão moveria o ponto de retomada da sessão; o mapper do app agora o descarta, e o teste prova que a reconexão retoma do `seq` da sessão | mobile `session_event_mapper.dart`; [scenarios](scenarios.md) S-04 |
| 2026-09-30 | O nome do "Duplicar" (`nome copy.ext`) é função pura do web, em `features/explorer/lib/` | a B-14 diz que é a web quem escolhe o nome; o servidor só copia | S-103 |
| 2026-09-30 | Salvar mede a permissão de escrita do próprio arquivo antes do temporário; o temporário encurta nomes longos | o `rename` atômico só precisa da permissão da pasta e trocaria em silêncio um arquivo somente leitura (S-77); e `.<nome>.rc-<ulid>.tmp` estoura 255 bytes com um nome de 255 (achado pelo S-87) | B-11 |
| 2026-09-30 | O desfazer só se **serializa** com o salvar (trava por caminho), sem replanejar o caminho sob a trava | é o que a B-18 pede; o salvar que chega depois do plano e antes da restauração é sobrescrito pelo snapshot — o editor fica com o buffer e o próximo salvar recebe `412`. Replanejar sob a trava fica registrado como melhoria do plano 04, sem task | R-01, ADR-015 |
| 2026-10-01 | F3, F4 e F5 executadas em paralelo, com os portões básicos por fase e o `pnpm verify:full` só no fim da F5 | **pedido do usuário** ("só rodar gate de qualidade full no final da F5, nas outras fases só rodar os gates básicos"); as três fases tocam pontas diferentes (backend, explorer, editor), e as costuras entre elas foram escritas **antes** de começar, para que nenhuma fosse construída sobre a outra pela metade: a assinatura `workspace.watch` do cliente (`web/src/shared/api/folder-watches.ts` — uma por pasta, com refcount de seguidores, porque o servidor devolve o mesmo `watchId` para o mesmo socket e o primeiro unwatch encerraria a assinatura do explorer **e** do editor), o arraste para o Claude (`web/src/shared/lib/files-drag.ts`, D-20) e as assinaturas do barril `@/features/editor` que o explorer consome (`openFile`, `openDiff`, `entryMoved`, `activeFile`, `OpenEditors`). O explorer importa o editor; o editor nunca importa o explorer — o "revelar no explorer" é o comando `explorer.revealActiveFile` | F3, F4, F5; web/04 |
| 2026-10-01 | **D-08 fechada: chokidar v5.** Medida do spike `scripts/watcher-spike.mjs` num clone com `pnpm install`: `fs.watch` recursivo 49 941 watches (põe watch em `node_modules`); chokidar 2 805 (um por arquivo e por pasta fora das exclusões); `@parcel/watcher` 709 — mas, com o limite esgotado **depois** de subir, perde em silêncio os arquivos de pastas novas | o critério da D-08 é "pasta excluída não consome watch" **e** "no limite, erro explícito"; só o chokidar cumpre os dois. O custo (um watch por arquivo) fica no R-03, com a alternativa sem task: adapter próprio sobre `fs.watch` não recursivo | [decisions](decisions.md) D-08, R-03 |
| 2026-10-01 | A lista de não assistidos da D-10 virou `UNWATCHED_PATHS`/`isUnwatched` no domínio (`.git` inteiro, segmento múltiplo em qualquer profundidade); os temporários do save atômico (`.<nome>.rc-<ULID>.tmp/.bak`) são ignorados pelo watcher | sem isso, cada save aparecia como "temporário criado" e "temporário apagado" | B-20 |
| 2026-10-01 | Coalescência: apagado→criado vira `changed`, criado→apagado some; acima do teto o evento leva os N primeiros **e** `overflow: true`; acima de 10× o teto na janela, todas as assinaturas recebem `overflow`. A raiz apagada é conferida por `stat` no `rename` cru, porque o chokidar às vezes não a vê | o cliente recarrega no overflow, mas ainda remenda o que veio; e `folderDeleted` não pode depender de um evento que a biblioteca perde | B-20, S-144 |
| 2026-10-01 | Subpasta sob caminho não assistido da mãe (`node_modules/x` aberta como aba) ganha watcher próprio; subpasta aberta antes da mãe mantém o seu, sem migrar | reusar o watcher da mãe ali entregaria nada, e migrar ao vivo é janela de perda | B-21, S-138 |
| 2026-10-01 | Nada da assinatura sai antes do ack `workspace.watching` (o sink fica retido até ele); `watchStopped` também leva o próximo `seq` do `watchId`; connection lenta (`bufferedAmount` acima de `RC_FILES_WATCH_MAX_BUFFERED_BYTES`) recebe um `overflow` devido, retentado a cada 250 ms, sem derrubar o socket | a ordem ack → eventos é regra do protocolo; e o cliente web trata salto de `seq` como overflow | B-23, S-155 |
| 2026-10-01 | Origem (B-22): `RecentWrites` comum a `ClaudeWrites` e ao novo `UserWrites`, alimentado por salvar/criar/apagar/mover/copiar **depois** do disco; o mesmo conteúdo escrito pelos dois → vale a escrita mais recente; arquivo ilegível → `external`. O servidor sempre manda `origin` (o contrato o mantém opcional) | "vale o hash final, nunca uma origem inventada" | B-22, S-148…S-151 |
| 2026-10-01 | A recarga da allowlist publica `workspace.allowlistReloaded` no barramento interno; `files` revalida cada assinatura pelo `FolderResolver` e encerra a recusada com `allowlistChanged`. A queda do socket libera as assinaturas por `ConnectionRegistry.onRemoved`, sem regra no gateway; o shutdown fecha os watchers depois dos sockets e antes dos subprocessos | "liberar é o requisito": toda saída pela mesma rotina | B-21, S-142…S-147; backend/03, backend/06 |
| 2026-10-01 | S-147 provado pela revogação de **device** (não existe revogação de usuário no código); S-135 provado com ENOSPC injetado no chokidar real — o limite real do kernel só no spike, porque o CI (ubuntu 24.04) restringe user namespace sem privilégio | declarado, não omitido | [scenarios](scenarios.md) S-135, S-147 |
| 2026-10-01 | Variáveis novas: `RC_FILES_WATCH_WINDOW_MS` (200), `RC_FILES_WATCH_MAX_CHANGES` (500), `RC_FILES_WATCH_MAX_PER_CONNECTION` (16), `RC_FILES_WATCH_MAX_BUFFERED_BYTES` (1 MiB); `WATCH_RETRY_AFTER_SECONDS = 30` no domínio | tetos configurados, como os da F1/F2 | `.env.example`, `scripts/lib/stack.mjs` |
| 2026-10-01 | O explorer se registra por `registerExplorer()` chamado em `main.tsx` antes do primeiro render: a view `explorer` (toma o lugar reservado do 06), a restauração `explorer.tree` v1 (pastas abertas, seleção, foco, ocultos, ordem, compactar — só caminhos, nunca a pilha de desfazer) e um item da status bar, sempre montado para a aba visível, que segura o watch da pasta e os comandos `explorer.revealActiveFile` (Shift+Alt+R) e `explorer.focus` (Ctrl/⌘+Shift+E) | o watch e o "revelar" têm de existir com qualquer view aberta; registrar no router mudaria o lugar reservado que os specs do 06 conferem | B-24, B-28, S-12 |
| 2026-10-01 | Apagar pasta com conteúdo pergunta **duas** vezes: a confirmação comum e, depois do `409`, o segundo passo com a contagem (`recursive` + `expectedEntries`) | a contagem só vem de um `DELETE` não recursivo, que já apagaria um arquivo ou uma pasta vazia — não há como juntar as duas perguntas sem risco | B-26, S-173 |
| 2026-10-01 | Desfazer criar/copiar uma **pasta** só apaga enquanto ela está vazia; senão é recusado (`explorer.undo.notEmpty`). Lote com caminho sensível pede o segundo passo só para esses itens e reenvia só eles | desfazer não pode virar o apagar sem volta que a F8 ainda não cobre; e o que já foi não se repete | B-27, D-15 |
| 2026-10-01 | Atalhos do explorer sem Ctrl+Alt+letra (os desktops Linux tomam vários): Alt+N/Shift+Alt+N, Alt+T/Shift+Alt+T, F2, Delete, Ctrl+X/C/V/D, Alt+M, Alt+K, Ctrl+Z, Shift+Alt+C, Shift+Alt+A, Alt+R, Shift+Alt+↑/H/F; contexto de tecla novo `explorer`, vivo só com o foco na árvore | Delete, F2 e Ctrl+C só agem sobre arquivos com o foco ali | B-26, B-30; commands |
| 2026-10-01 | Ícones por tipo em `lib/file-icons.ts` e virtualizador próprio de altura fixa (22/28/44 px por densidade), sem dependência nova | o 06 não tinha mapa de ícones; a altura fixa basta para a árvore e roda em jsdom com 10 000 entradas | B-25, S-161 |
| 2026-10-01 | `TabRestorer.forget(path \| null)` opcional no workbench, chamado ao fechar a aba, ao sair e na recarga; a ajuda ganhou `own={{ open, onOpenChange }}` para uma view ter a sua gaveta sem tomar o Shift+F1 do workbench; "Quem" na seção Arquivos da Auditoria é "Por você, deste app", porque `/audit-events` só devolve os fatos de quem pergunta | os stores por aba precisam morrer com a aba; e a ajuda por view é pedido da B-30 | B-24, B-29, B-30 |
| 2026-10-01 | O editor se registra por `features/editor/register.ts`, importado pelo barril: registros novos no workbench `editorAreas` (a área de editor deixa de ser só o lugar reservado) e `folderTabKeepers` (quem tem arquivo sujo responde, e o `CloseFoldersDialog` lista — o workbench nunca importa o editor); restauração `editor.tabs` v1 (grupos, abas, ativa, recentes — só caminhos; diff com lado de buffer não volta); item `editor` da status bar; seção **Editor** nas Configurações (posição 300, dez opções); dois modos da palette (`editorChoice`, `recentFiles`); `beforeunload` com buffer sujo; `file=` na URL | o que web/03 chama de "abas de editor por tipo" e a guarda de saída da D-14 | B-31…B-41; web/03 |
| 2026-10-01 | Dois adaptadores atrás da porta `CodeEditor`: o Monaco a partir de `md` e um campo de texto real no modo simplificado — que é também o substituto em jsdom, preso ao mesmo contrato por um teste compartilhado (S-208); o Monaco real só no e2e | o modo simplificado da D-09 já precisava existir; usá-lo como falso evita um terceiro adaptador que não roda em produção | B-31, D-09 |
| 2026-10-01 | Só realce: carregam as contribuições do editor e 30 gramáticas, **sem** os serviços de linguagem (TS/JSON/CSS/HTML); sugestões, hover, code lens, lightbulb e inlay hints desligados; JSON ganhou uma gramática nossa (o Monaco não tem uma sem o serviço); o modo leve tira minimap, folding e realce | decisão do usuário de 2026-09-26: nada de inteligência de linguagem | B-31, B-38 |
| 2026-10-01 | "Sujo" é a versão diferente da salva (desfazer até o salvo limpa; redigitar o mesmo texto não); o eco da nossa escrita é reconhecido por `If-None-Match` → `304` (o evento não traz hash), e a mudança que chega com um save em voo é conferida depois dele; aba de pasta fora da tela não gasta watch e revalida os arquivos ao voltar e na reconexão | é o que faz S-241 e S-259 sem confiar na origem, que só rotula | B-35, B-40 |
| 2026-10-01 | O auto-save nunca toca arquivo sensível, nem arquivo com conflito, apagamento ou aviso de mudança externa pendente; desfazer/refazer ficam com o Monaco (sem atalho no registro, para não colidir com o Ctrl+Z da árvore); placeholders de binário e de grande demais explicam que hexadecimal e leitura paginada chegam na F7, sem botão morto; no máximo três grupos; "salvar como" leva a aba ao caminho novo e deixa o antigo no disco | segurança do segundo passo (D-15) e honestidade da UI | B-34, B-36, B-38 |
| 2026-10-01 | S-243…S-246 (localizar/substituir, regex inválida, ir para linha, desfazer através do save) escritos em `e2e/specs/editor-native.spec.ts`: são comportamento nativo do Monaco e só existem num navegador real | a matriz já os põe no nível e2e | B-36 |
| 2026-10-01 | F6, F7 e F8 executadas juntas, com os portões básicos por fase e o `pnpm verify:full` só no fim da F8 | **pedido do usuário** ("rodar o gate full somente depois de acabar a F8"), como na F3–F5. Uma regra a mais, desta vez: **um e2e por vez** — duas execuções de `run-e2e-local` sobrescrevem `web/dist` e `e2e/.env` uma da outra, então o e2e da F6, o da F7 e o da F8 rodam em série | F6, F7, F8 |
| 2026-10-01 | O contrato da F7 (B-47): `raw` com `ETag` sha256 guardado em cache pela identidade do arquivo (`dev`, `ino`, tamanho, `mtime`/`ctime` em ns), `Content-Type` pela assinatura do conteúdo (nunca `text/html`), um só intervalo em `Range` (vários são ignorados), `If-Match` na paginação (`412`), `413` sem `Range` acima do teto de download; prévia e página fora da trilha, `download=true` dentro (`file.downloaded`). `archive` com `path` repetido (a seleção), nomes relativos à pasta comum mais funda, link para arquivo dentro da pasta com o conteúdo do alvo e o resto dos links fora. `upload` com manifesto antes das partes, validado inteiro antes do primeiro byte (inclusive nome reservado do Windows), `keepBoth` como `nome copy.ext`, e **`207`** quando algum item falhou — status novo no doc 04, porque `200` com erro no corpo é proibido e o lote não é um recurso com um status só; `POST /files/upload/preflight` para o conflito **antes** de enviar (S-319); `GET /files/limits` para o teto conhecido antes de começar (D-16) | a D-16 e a D-18 deixaram o formato das rotas para o contrato; o cache evita reler um binário de gigabytes a cada página do hexadecimal sem trocar a semântica do `ETag` | backend/03, shared/04, ADR-015; B-48, B-49, B-52 |
| 2026-10-01 | O contrato da F8 (B-55): o histórico é **por caminho** — mover nunca sobrescreve (D-12), então não há motivo `move` e a versão não segue o rename; motivos `save`·`delete`·`restore`·`upload`; apagar ganha `keepInHistory=true` (opcional, para o apagar definitivo da F2/F4 continuar o que era): o que cabe é guardado — arquivo, e cada arquivo e pasta de uma pasta, sob um `batchId` — e o `200` devolve as entradas para o **Desfazer**; o que não cabe não é apagado (`428` `notKept` no arquivo, `409` com `notKept` na pasta) e o cliente volta ao segundo passo; pastas viram entradas sem blob, para o desfazer recriar até a vazia; o salvar responde `history` (`kept`, ou o motivo de não); restaurar **com** `If-Match` substitui e **sem** ele recria o apagado; o autor é `{ self, id }` — o servidor só conhece o `sub`, não há nome de usuário guardado em lugar nenhum | a D-17 deixou o formato das rotas para o contrato, e "com o autor" (S-350) só pode ser o que o servidor sabe | backend/03, backend/05, shared/04, ADR-015; B-56…B-59 |
| 2026-10-01 | S-306 passou a dizer `INVALID_INPUT` para o **nome** de um item com `../` ou `/` inicial, e `WORKSPACE_NOT_ALLOWED` só para o **destino** (`directory`) que sobe acima da pasta | a matriz se contradizia: S-306 dizia `WORKSPACE_NOT_ALLOWED` e S-357 `INVALID_INPUT` para o mesmo `..` num caminho de item; o contrato (backend/03) manda o manifesto inteiro com todos os motivos num `400`, que é o que deixa um lote de três erros ser uma ida e volta — e é a regra do `FilePath` para o que a string já diz que não serve | [scenarios](scenarios.md) S-306; B-49 |
| 2026-10-01 | A transferência no backend (B-48, B-49): a porta `FolderDisk` ganhou `openRaw`, `survey`, `archive` e `stage` (o `StagedFile` do upload: `create` por `link` com `O_EXCL`, `replace` atômico com a guarda — no lugar com hard link —, `discard`); o temporário do upload fica na pasta de destino, ou na existente mais próxima acima quando as subpastas ainda não existem, e só é ligado ao nome depois da trilha — então trilha fora não deixa pasta vazia, e o fato leva o hash. Trilha que cai no meio: nada gravado → `503` do upload inteiro; depois disso, os itens restantes falham com `SERVICE_UNAVAILABLE` sem serem tentados. `fail` em conflito e `replace` sem `If-Match` certo são recusados antes de ler a parte; `replace` de arquivo que sumiu cria. Parte com bytes diferentes dos declarados (a mais, cortada um byte depois; a menos, inclusive conexão caída) é `INVALID_INPUT` com chave própria (`files.error.uploadSizeMismatch`). O cache de versão do `raw` guarda até 1 024 e nunca o hash de arquivo com `ctime` de menos de 2 s (duas escritas no mesmo tique deixam a mesma identidade com bytes diferentes). SVG só com `<svg` como raiz. `keepBoth` desiste depois de 100 nomes (`409`). No `archive`, o item **selecionado** que é link para pasta dentro é seguido — só os links achados no caminho não são —, e o zip também leva `nosniff` e `sandbox` | o contrato da B-47 não dizia a forma da porta nem o que fazer quando a trilha cai no meio de um lote | backend/03, shared/04; B-48, B-49 |
| 2026-10-01 | O histórico no backend (B-56…B-58): `seq` de identidade ordena páginas e purga (o cursor é ele, como nas trilhas); só `delete` tem `batch_id` e só `delete` guarda pasta (CHECK); a purga, numa transação sob o lock exclusivo, vai por idade → por caminho → total dos blobs distintos → varredura dos blobs que ninguém cita e dos temporários; o job roda 1 min depois da subida e a cada 10 min. `GET /files/history` sem `path` lista a pasta inteira, com os caminhos relativos à pasta pedida **agora**, e `hash` em forma de `ETag`. O apagar com `keepInHistory` recusa guardar — e portanto apagar — o que não saberia recriar (link, FIFO, device, nome não UTF-8 ou com `\`: `why: unavailable`), confere de novo depois de guardar (hash do arquivo, ou tipo·caminho·tamanho·`mtime` de cada entrada) e responde `412` esquecendo o lote se algo mudou — e o esquece também se a trilha cai; `file.deleted` leva `keptBatchId` só nesses. O restaurar trata `If-Match: *` como ausente (nunca sobrescreve às cegas); entrada de pasta ignora o `If-Match` e pasta já existente é sucesso. Blob cujos bytes não batem com o hash é dado como ausente (`404`, `warn`) | o contrato da B-55 não dizia a ordem nem o que fazer com o que não se recria; apagar achando que há volta é o que a D-06 proíbe | backend/03, backend/05; B-56, B-57, B-58 |
| 2026-10-01 | O renderizador de markdown seguro da prévia (B-50) nasce em `web/src/shared/components/markdown/`, com a escolha da D-04 do plano 08 (`react-markdown` + `remark-gfm`, sem `rehype-raw`, URL só `http`·`https`·`mailto`·relativa, imagem remota vira link) | a B-50 manda usar "o mesmo sanitizador do plano 08", que ainda não existe; nascendo aqui, em `shared/`, o plano 08 o reusa em vez de escrever um segundo | web/02; plano 08 · D-04, B-14 |
| 2026-10-01 | O histórico na web (B-58 web, B-59, B-60): feature nova `features/file-history` — o explorer a importa pelo barril (a Linha do tempo, o desfazer do lote, os comandos), ela nunca importa o explorer e chega ao editor pelo barril dele (`openDiff` com o lado novo `source: 'history'`, `heldFile`, `reloadFile`); apagar tenta primeiro `keepInHistory=true`, e só o que não coube abre o diálogo definitivo de hoje, dizendo por quê; o caminho sensível pede o segundo passo **uma** vez (o diálogo do explorer) e segue confirmado até o apagar definitivo; o **Desfazer** vive no toast (`notification.files.deletedOne`/`deletedMany`, no catálogo fechado) e não entra no `Ctrl+Z` da árvore — dois desfazeres do mesmo lote se chocariam em `409`; a Linha do tempo segue o arquivo ativo e o mantém enquanto um diff está na frente; restaurar manda `If-Match` com a versão que o editor mostra (ou a lida do disco, se o arquivo não está aberto; nenhuma, para o apagado); o teto do histórico vem de uma consulta própria de `GET /files/limits` (chave de cache própria — a do explorer é dele e a feature não pode alcançá-la) e entra na ajuda por uma parte extra (`extra` do `HelpSheet`); atalhos `Ctrl+K H` e `Ctrl+K D` | a ordem de importação proíbe file-history → explorer; o desfazer do lote precisa de um só dono | web/src/features/file-history, explorer, editor; B-58…B-60 |
| 2026-10-01 | Prévias e transferência na web (B-50…B-53): a prévia é uma **aba de tipo próprio** (`preview:<caminho>`) — "Abrir prévia" (`Ctrl+Shift+V`), "prévia ao lado" (`Ctrl+K V`) e o botão de olho da barra de abas, que troca editor ↔ prévia **no lugar**; a prévia de markdown e de HTML lê o **mesmo buffer** do editor (o documento vive enquanto uma prévia o mostra), por isso acompanha a edição sem salvar; imagem e PDF **abrem já na prévia** (não têm texto a editar) e o hexadecimal é a outra face da aba; HTML é o código-fonte. O markdown é um chunk sob demanda, como o pdf.js (porta `PdfEngine`, worker do nosso build por `?url`), e `scripts/lib/editor-bundle.mjs` passou a recusar pdf.js/markdown na primeira página e o worker do PDF ausente. Paginação: 4 KiB por página no hexadecimal, 64 KiB (+3 bytes para fechar o caractere UTF-8) no texto; `If-Match` da segunda página em diante, `412` → aviso e a mesma página lida de novo na versão nova; `416` na primeira página = arquivo vazio. Transporte: `api.ts` ganhou `bytes()` (blob + cabeçalhos, `206`) e `upload()` por XMLHttpRequest (progresso), com o mesmo Bearer, trace, renovação e log. Upload: **um** multipart por lote — o progresso por arquivo é derivado dos bytes enviados, na ordem do manifesto, e cancelar aborta o lote inteiro (o que chegou inteiro fica, nada pela metade); conflito começa em **Pular**, pasta no caminho só aceita Manter os dois/Pular; o preflight responde caminhos relativos à **pasta aberta** e o serviço os casa com os do pedido. Download: `showSaveFilePicker` pedido **antes** do `fetch` (ainda com a ativação do gesto), o conteúdo vai por blob — o stream da D-16 fica como melhoria; o teto de um arquivo é conferido pelo tamanho da árvore antes de pedir. Recusas de teto (`413`) viram texto de transferência (`explorer.transfer.*`), porque o `files.error.tooLarge` do backend é a frase do editor; o resultado de lote é a tela da B-27, que ganhou `noteKey` para dizer o `replaced` cuja versão anterior não entrou no histórico local. Pasta vazia dentro de pasta arrastada não é enviada (o manifesto só tem arquivos). Atalhos do explorer: `Alt+U`, `Alt+Shift+U`, `Alt+Shift+D`; a ajuda ganhou partes próprias (`extra`) com os tetos lidos de `/files/limits` | a B-50 pede "alternância editor/prévia na aba" e a prévia ao lado ao vivo; um único multipart é o que o contrato do upload define (manifesto + `207`); o resto é a D-16/D-18 aplicada | web/03, D-16, D-18; B-50…B-53 |
| 2026-09-28 | As 20 decisões em aberto respondidas pelo usuário, uma a uma; todas seguem a recomendação. 19 decididas; a D-08 tem o método (spike B-19) e espera a medida | as fases dependiam delas para começar | [decisions.md](decisions.md) D-01…D-20; nenhuma tarefa ou cenário mudou. Números de D-04, D-16 e o hard link da D-05 são provisórios até a medida |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-30 | S-03 | o handler de `workspace.watch` é da F3 | [B-21](F3-file-watch.md) |
| 2026-10-01 | Pasta **vazia** dentro de uma pasta enviada por upload (B-52) | o manifesto do upload só lista arquivos (o contrato da B-49 é por arquivo); a estrutura dos arquivos é recriada, a pasta sem arquivo não | sem task — melhoria do upload, se pedida |
| 2026-10-01 | Download em stream pelo `showSaveFilePicker` (melhoria da D-16) | o seletor é pedido antes do `fetch`, enquanto o clique ainda vale como gesto da pessoa, mas os bytes ainda passam por um blob, sob o teto de download | sem task — a D-16 já o registrava como melhoria |
| 2026-10-01 | Cancelar **um** arquivo de um upload em lote | o upload é um `multipart` por lote, como o contrato da B-49 define; cancelar aborta o lote, e o que já chegou inteiro fica — nada fica pela metade | sem task |
| 2026-09-30 | S-10…S-13 | testam a UI do explorer e do editor | [B-24, B-26](F4-explorer.md), [B-40](F5-editor.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Perda de trabalho entre o humano e o Claude no mesmo arquivo | 🔲 aberto | janela residual contra escritor externo declarada; D-03 |
| R-02 | Fuga de caminho por `..`, symlink ou troca entre checar e abrir | 🔲 aberto | verificação no descritor é Linux-only; D-05 |
| R-03 | Watcher esgota o inotify ou vaza | 🔲 aberto | medir na B-19; D-08, D-10 |
| R-04 | Editor pesado no celular, sem jsdom, ou com CDN | 🔲 aberto | medir antes de fechar a D-09 |
| R-05 | Contrato WS numa ponta só, `seq` fora de sessão | 🔲 aberto | D-07; o plano 10 reusa a regra |
| R-06 | Conteúdo de arquivo vazando para log, trilha, navegador ou URL | 🔲 aberto | S-61, S-116, D-14, D-16 |
| R-07 | Conteúdo do usuário executando na origem do produto | 🔲 aberto | D-18 |
| R-08 | Apagar sem volta | 🔲 aberto | D-06; resolvido para o que cabe no teto pela F8 |
| R-09 | Save rápido em arquivo que muda a permissão | 🔲 aberto | D-15, coordenado com o plano 11 |
| R-10 | Escrita no disco alcançável pela rede antes do plano 05 | 🔲 aceito | ordem da D-02 do plano 06 |

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
