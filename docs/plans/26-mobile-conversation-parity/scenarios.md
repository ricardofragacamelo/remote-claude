# Plano 26 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

"Paridade" num cenário quer dizer que o app produz o mesmo conteúdo e o mesmo elemento que o web
para a mesma fixture. É conferida pelo teste do app contra a mesma fixture que o teste do web usa.

---

## Spike — B-01…B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | subagent com `Write` que pede permissão, com `parent_tool_use_id` em tudo | eq | spike | — | B-01 | ⬜ |
| S-06 | cada fixture da B-02 carrega no SDK roteirizado e reproduz a sequência gravada | eq | unit | — | B-02 | ⬜ |
| S-07 | balão com 20 KB de markdown, 3 diagramas e 10 blocos de código: tempo de construção e de primeiro quadro no perfil modesto, com e sem limite de frequência no streaming | fron | spike | — | B-03 | ⬜ |
| S-08 | os dois motores de realce contra a lista `LANGUAGES` do web, o tamanho do APK e um bloco de 500 linhas | eq | spike | — | B-03 | ⬜ |

## Mapa de paridade — B-04…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-09 | todo `.tsx` de `components/conversation/` e de `shared/components/markdown/` tem entrada no mapa | eq | unit | — | B-04 | ⬜ |
| S-10 | os estados iniciais do mapa batem com a tabela da discovery §4: `ok` onde há paridade, `pending` com a fase onde não há | eq | unit | — | B-04 | ⬜ |
| S-11 | componente novo no web sem entrada: o `render:check` reprova e o nomeia | err | unit | saída ≠ 0 com o caminho | B-05 | ⬜ |
| S-12 | entrada que cita widget ou teste que não existe no app: reprova | err | unit | saída ≠ 0 | B-05 | ⬜ |
| S-13 | `excluded` com decisão inexistente, ou que não está ✅: reprova | err | unit | saída ≠ 0 | B-05 | ⬜ |
| S-14 | `pending` cuja fase já está ✅ no `progress.md`: reprova | est | unit | saída ≠ 0 | B-05 | ⬜ |
| S-15 | duas execuções seguidas sobre a mesma árvore dão a mesma saída, e o script não escreve nada | idem | unit | — | B-05 | ⬜ |
| S-16 | `docs:check` verde com as seções novas de mobile/04, web/03 e 09-code-quality, e a nota no plano 10 · D-01 | eq | unit | — | B-06 | ⬜ |

## Markdown compartilhado — B-07, B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-17 | os testes do leitor de markdown do plano 25 passam sem edição depois do movimento | eq | integração | — | B-07 | ⬜ |
| S-18 | HTML no markdown (`<script>`, `<img onerror>`) aparece como texto, nenhum elemento nasce dele | err | unit | — | B-07 | ⬜ |
| S-19 | link `javascript:` e `data:` não abrem; `http`/`https`/`mailto` pedem confirmação | err | unit | — | B-07 | ⬜ |
| S-20 | imagem remota nunca é carregada: aparecem o texto alternativo e o endereço | err | unit | — | B-07 | ⬜ |
| S-21 | `core/` não importa `features/` (teste de arquitetura) | eq | unit | — | B-07 | ⬜ |
| S-22 | linha de código de 300 colunas rola dentro da caixa, a página não rola na horizontal | fron | widget | — | B-08 | ⬜ |
| S-23 | copiar o código põe o texto exato na área de transferência e anuncia "copiado" | eq | widget | — | B-08 | ⬜ |
| S-24 | TypeScript, Dart, Python, JSON e shell com realce, nas cores dos mesmos tokens do `colorizeCode` (paridade) | eq | unit | — | B-08 | ⬜ |
| S-25 | linguagem desconhecida ou cerca sem linguagem: mesmo texto, sem realce, sem erro | err | unit | — | B-08 | ⬜ |
| S-26 | bloco acima do teto da B-03: sem realce, com o texto inteiro | fron | unit | — | B-08 | ⬜ |

## Markdown na mensagem — B-09…B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | `multi-text-block-turn`: os blocos de texto aparecem separados e na ordem, nunca colados | eq | unit | — | B-09 | ⬜ |
| S-28 | prompt com texto, imagem, texto: a imagem fica entre os dois, como no web | eq | unit | — | B-09 | ⬜ |
| S-29 | a mesma mensagem ao vivo, pelo replay e pelo histórico dá os mesmos blocos, sem duplicar | idem | unit | — | B-09 | ⬜ |
| S-30 | delta depois de uma tool cai no bloco de texto novo, não no anterior | est | unit | — | B-09 | ⬜ |
| S-31 | `markdown-rich-turn`: títulos, listas aninhadas, tabela larga, citação e código desenhados (paridade) | eq | widget | — | B-10 | ⬜ |
| S-32 | prompt do usuário com lista e código: markdown, como no web | eq | widget | — | B-10 | ⬜ |
| S-33 | cerca de código aberta no meio do streaming: o resto não vira código; ao fechar, o bloco se forma | est | widget | — | B-10 | ⬜ |
| S-34 | deltas chegando a cada 5 ms: o balão reconstrói no máximo no limite da D-02, e o texto final é o completo | conc | widget | — | B-10 | ⬜ |
| S-35 | bloco `mermaid` desenhado sob demanda, com tela cheia ao tocar | eq | widget | — | B-10 | ⬜ |
| S-36 | Mermaid inválido vira código com aviso, sem derrubar o balão | err | widget | — | B-10 | ⬜ |
| S-37 | `src/x.ts:42` da pasta vira link que abre o leitor do plano 25 na linha 42; os casos da tabela compartilhada com o web dão o mesmo resultado | eq | unit | — | B-10 | ⬜ |
| S-38 | caminho fora da pasta, ou com `..` que sai dela, não vira link | err | unit | — | B-10 | ⬜ |
| S-39 | mensagem de texto vazio só com imagem: nenhum balão vazio (a S-121 do plano 22 continua) | fron | widget | — | B-10 | ⬜ |
| S-40 | mensagem de 20 KB rola sem travar a lista, dentro do teto da B-03 | fron | widget | — | B-10 | ⬜ |
| S-41 | "Você"/"Claude" no começo de cada sequência do mesmo autor, nunca repetido dentro dela | eq | widget | — | B-11 | ⬜ |
| S-42 | "Copiar mensagem" do Claude e do usuário copia o markdown original, com os blocos separados | eq | widget | — | B-11 | ⬜ |
| S-43 | o texto do balão pode ser selecionado | eq | widget | — | B-11 | ⬜ |
| S-44 | as chaves de autor e de copiar estão no `i18n-shared.json`, en e pt-BR, e o `i18n:check` compara | eq | unit | — | B-11 | ⬜ |
| S-45 | preview de opção do `AskUserQuestion` em markdown, como no web | eq | widget | — | B-12 | ⬜ |

## Card da tool e linha do turno — B-13…B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | `Read`, `Write`, `Bash`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `Agent`, `TodoWrite`: o rótulo igual ao do web (paridade de chave e parâmetros) | eq | unit | — | B-13 | ⬜ |
| S-47 | `Edit` e `MultiEdit` com +/− no rótulo | eq | unit | — | B-13 | ⬜ |
| S-48 | `mcp-untitled-tool-turn`: `fixture · echo`, nunca `mcp__fixture__echo` | eq | unit | — | B-13 | ⬜ |
| S-49 | nomes MCP de borda (`mcp__a__b__c`, `mcp__a`, `mcp____x`): o mesmo parse do web, pela tabela de casos compartilhada | fron | unit | — | B-13 | ⬜ |
| S-50 | tool desconhecida: o nome, sem erro, como no web | err | unit | — | B-13 | ⬜ |
| S-51 | três `tool.progress` seguidos: a linha mostra o último tempo e o OUT não muda | est | unit | — | B-14 | ⬜ |
| S-52 | Bash em andamento sem saída: o OUT não aparece; ao concluir, o resumo | est | widget | — | B-14 | ⬜ |
| S-53 | `tool.progress` que chega depois do `tool.completed` (replay fora de ordem) não reabre a tool | conc | unit | — | B-14 | ⬜ |
| S-54 | saída com cores das 16 e das 256 e com negrito: desenhada com a paleta do `AnsiText` (paridade) | eq | widget | — | B-15 | ⬜ |
| S-55 | sequência ANSI desconhecida ou cortada no meio: descartada, sem lixo no texto | err | unit | — | B-15 | ⬜ |
| S-56 | copiar a saída colorida copia o texto sem as sequências | eq | widget | — | B-15 | ⬜ |
| S-57 | `Edit` com uma troca: diff com a linha removida e a acrescentada (paridade com o `ToolDiffView`) | eq | widget | — | B-16 | ⬜ |
| S-58 | `MultiEdit` com três trocas: os três trechos, na ordem | eq | widget | — | B-16 | ⬜ |
| S-59 | `Write` de arquivo novo grande: tudo como acrescentado, com o teto do web e o aviso de corte | fron | widget | — | B-16 | ⬜ |
| S-60 | entrada de `Edit` sem `old_string`: sem diff, a entrada como JSON, como o web | err | widget | — | B-16 | ⬜ |
| S-61 | linha do turno com custo, segundos e tokens de entrada, saída e cache | eq | widget | — | B-17 | ⬜ |
| S-62 | `usage` sem um campo, ou com campo que não é número: só os válidos aparecem | err | unit | — | B-17 | ⬜ |

## Link para a trilha — B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-88 | o link "Trilha" do card abre a lista só de leitura com as entradas daquela sessão e tool, com os mesmos campos da `AuditEntryRow` do web | eq | widget | — | B-32 | ⬜ |
| S-89 | a rota da trilha recusa ou falha: estado de erro traduzido com tentar de novo; aparelho não aprovado recebe a recusa da regra da 25 · D-12 | err | widget | `FORBIDDEN`, `DEVICE_NOT_REGISTERED` | B-32 | ⬜ |
| S-90 | tool sem nenhuma entrada na trilha (sessão de outro cliente): estado vazio que diz por quê; lista de várias páginas carrega a próxima ao rolar | fron | widget | — | B-32 | ⬜ |

## Subagents — B-18…B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-63 | `message.delta` e `message.completed` com `parentToolUseId` deixam de ser `UnreadEvent` e chegam ao subagent | eq | unit | — | B-18 | ⬜ |
| S-64 | frame do subagent que chega antes do `tool.started` do `Agent` fica guardado e é anexado quando o card chega | conc | unit | — | B-18 | ⬜ |
| S-65 | o `seq` avança por todo frame de subagent, e o replay do mesmo frame não duplica | idem | unit | — | B-18 | ⬜ |
| S-66 | `subagent-permission-turn`: texto, pensamento e tools sob o card do `Agent`, no estado padrão do web | eq | widget | — | B-19 | ⬜ |
| S-67 | subagent de subagent: aninhado até a profundidade do web, e o resto como no web | fron | widget | — | B-19 | ⬜ |
| S-68 | nenhuma tool de subagent aparece na lista principal | eq | unit | — | B-19 | ⬜ |
| S-69 | no histórico, abrir o card do `Agent` lê a rota de subagents e mostra os filhos | eq | integração | — | B-20 | ⬜ |
| S-70 | a rota de subagents falha ou devolve 404: estado de erro traduzido com tentar de novo, o resto da conversa intacto | err | widget | `NOT_FOUND` | B-20 | ⬜ |
| S-71 | permissão de uma tool do subagent aparece dentro dele, com o nome do subagent no título | eq | widget | — | B-21 | ⬜ |

## Portão de paridade — B-27, B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | uma entrada `pending` sobrando: o `render:check` reprova | err | unit | saída ≠ 0 | B-27 | ⬜ |
| S-78 | componente novo no web sem par no app, depois do plano: reprova no portão 11 | err | unit | saída ≠ 0 | B-27 | ⬜ |
| S-79 | `excluded` com decisão ✅ (o "inserir no editor", D-11): passa | eq | unit | — | B-27 | ⬜ |
| S-82 | para cada fixture, o redutor do web e o do app projetam o mesmo conteúdo esperado, ao vivo | eq | unit | — | B-28 | ⬜ |
| S-83 | o mesmo pelo histórico: o conteúdo do `historyEventFrom` é igual ao do ao vivo | idem | unit | — | B-28 | ⬜ |

## E2E — B-29…B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-84 | pelo app: markdown com tabela, código com realce e Mermaid; subagent aninhado com a permissão respondida dentro dele; `fixture · echo`; diff; saída colorida; tokens; o link da trilha; copiar; e o mesmo ao reabrir pelo histórico | eq | e2e | — | B-29 | ⬜ |
| S-86 | `smoke-live`: o `parent_tool_use_id` em tudo o que o subagent emite, com a forma que as fixtures assumem | eq | e2e (live) | — | B-31 | ⬜ |
| S-87 | `smoke-live`: o nome da tool MCP sem título e os vários blocos de texto numa mensagem, com a forma que as fixtures assumem | eq | e2e (live) | — | B-31 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| O desenho se apoia na forma medida (B-01…B-03) | conc, idem | o spike mede uma conversa por sonda; repetir a medição é o `smoke-live` (S-86, S-87) |
| A paridade é norma escrita (B-06) | todas menos eq | documento; o `docs:check` é a única verificação |
| O preview da pergunta (B-12) | fron, err, est, conc, idem | é o mesmo `SafeMarkdown`, coberto pelas S-18…S-20 e S-31…S-40 |
| Os tokens do turno (B-17) | est, conc, idem | o `turn.completed` é um evento final e único por turno; o replay já é coberto pela S-29 |
| A permissão com o dono (B-21) | err, est, conc, idem | o ciclo da permissão é o do plano 23/24, sem mudança; muda só onde o card aparece |
| O link para a trilha (B-32) | est, conc, idem | lista só de leitura, lida uma vez ao abrir; a trilha não muda o que mostra por estar aberta |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
