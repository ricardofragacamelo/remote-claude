# Plano 22 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões. A semente é o
[§9 da proposta](../../propostas/historico-ao-vivo-e-fiel.md#9-matriz-de-cenários--semente).

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Erro esperado.** Os códigos novos são `TRANSCRIPT_FOLLOW_LIMIT` e `TRANSCRIPT_FOLLOW_LIVE_HERE` (WS), `UNSUPPORTED_MEDIA_TYPE` (`415`) e
`PAYLOAD_TOO_LARGE` (`413`) — os dois últimos só se o [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
ainda não os tiver com outro nome, o que a B-01 confere. `NOT_FOUND` é o que já existe para conversa
inexistente **ou** que o chamador não lê (S-04 do plano 04). Um `err` com `—` é recusa do próprio cliente ou de
um portão.

---

## Normas e contrato — B-01…B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | os schemas de `transcript.follow`, `transcript.following`, `transcript.appended`, `transcript.reset` e `transcript.unfollow` validam os exemplos do 05 e recusam payload sem campo obrigatório; o `protocol.g.dart` regenerado não difere do versionado | eq | unit | — | B-01 | ⬜ |
| S-02 | os campos aditivos (`blockId`, `at`, `title`, `mediaType`, `size`) são opcionais no schema: um evento antigo, sem eles, continua válido nas três pontas | idem | unit | — | B-01 | ⬜ |
| S-03 | `backend/03` §transcript descreve `lastMessageId`, as duas rotas novas, o seguidor e o porquê de não haver `fs.watch`; `docs:check` verde | eq | unit | — | B-02 | ⬜ |
| S-04 | `web/03` e `mobile/04` têm as regras do pensamento, do autor por turno, do IN/OUT, da imagem, da pílula e do "trabalhando"; a D-17 do 08 aponta para a D-15 deste plano; `docs:check` verde | eq | unit | — | B-03 | ⬜ |
| S-05 | toda chave nova existe em `en` e `pt-BR` no web e em `en` e `pt` no app; chave órfã ou literal reprova o `i18n:check` | err | unit | — | B-04 | ⬜ |
| S-06 | os pares novos do `i18n-shared.json` (retomar, estados da ferramenta, pensamento, "trabalhando", imagem) têm o mesmo texto nas duas pontas; mudar um lado só reprova o `i18n:check` | err | unit | — | B-04 | ⬜ |
| S-07 | as fixtures usadas pelo plano vêm de `pnpm fixtures:record` (pensamento omitido duas vezes na mesma resposta, resumido, Bash com e sem `description`, saída longa, `tool_result` em lista de blocos, prompt com imagem, prompt enfileirado, compactação) e são lidas pelo teste do adapter | eq | unit | — | B-05 | ⬜ |

## Mapeamento e leituras — B-06…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-08 | ao vivo, cada bloco de uma resposta leva `blockId = <messageId>:<índice>`; no histórico, `<uuid>:<índice>` ([D-06](decisions.md#f1--mapeamento-e-leituras)) | eq | unit | — | B-06 | ⬜ |
| S-09 | um prompt com texto e imagem numa entrada só dá dois `blockId` distintos | fron | unit | — | B-06 | ⬜ |
| S-10 | os eventos do histórico levam `at` = o `timestamp` da entrada; entrada sem `timestamp` sai sem `at`, sem quebrar | fron | unit | — | B-06 | ⬜ |
| S-11 | mapear a mesma entrada duas vezes dá o mesmo `blockId` (o id é estável entre leituras) | idem | unit | — | B-06 | ⬜ |
| S-12 | `tool.started.title` = `input.description` para Bash e para qualquer ferramenta que a traga, ao vivo e no histórico | eq | unit | — | B-07 | ⬜ |
| S-13 | `description` ausente, vazia, só espaço ou não texto: `title` ausente | fron | unit | — | B-07 | ⬜ |
| S-14 | `tool_result` string e em lista de blocos: o `summary` é texto (`resultText`), nunca `[{"type":"text"…` | eq | unit | — | B-08 | ⬜ |
| S-15 | saída com 0, 1, 5 e 6 linhas; com 399, 400 e 401 caracteres: o `summary` guarda as últimas 5 linhas até 400, com `…` no começo quando cortou ([D-07](decisions.md#f1--mapeamento-e-leituras)) | fron | unit | — | B-08 | ⬜ |
| S-16 | uma linha só, maior que 400 caracteres: o corte guarda o fim dela | fron | unit | — | B-08 | ⬜ |
| S-17 | `tool_result` com `is_error`: o `summary` segue a mesma regra e o estado continua de erro | eq | unit | — | B-08 | ⬜ |
| S-18 | bloco `image` sai com `mediaType` e `size` (bytes decodificados), e **sem** os dados, ao vivo, no histórico e no buffer de replay | eq | unit | — | B-09 | ⬜ |
| S-19 | imagem por URL (sem base64) ou com `media_type` ausente: bloco sai sem `size` / sem `mediaType`, e o cliente ainda mostra o marcador | fron | unit | — | B-09 | ⬜ |
| S-20 | `GET /transcripts/:id/messages` devolve `lastMessageId` = a última entrada da cadeia; conversa vazia devolve `null` | fron | integração | — | B-10 | ⬜ |
| S-21 | o prompt enfileirado (`queue-turn`) sai **depois** do `tool_result` que o precede na cadeia, embora o `timestamp` dele seja anterior: a ordem é a do SDK | est | integração | — | B-10 | ⬜ |
| S-22 | `GET /transcripts/:id/tools/:toolUseId/result` devolve `{ text, truncated: false, bytes }` com a saída inteira, string ou lista de blocos | eq | integração | — | B-11 | ⬜ |
| S-23 | saída com 256 KiB exatos não corta; com 256 KiB + 1 devolve os primeiros e os últimos 128 KiB, `truncated: true` e `bytes` com o total ([D-08](decisions.md#f1--mapeamento-e-leituras)) | fron | unit | — | B-11 | ⬜ |
| S-24 | `toolUseId` que não existe na conversa, ou `tool_use` ainda sem `tool_result` | err | integração | `NOT_FOUND` (404) | B-11 | ⬜ |
| S-25 | conversa de pasta que o chamador não lê: a resposta é igual à de um id inexistente | err | integração | `NOT_FOUND` (404) | B-11 | ⬜ |
| S-26 | sem token, ou com token inválido | err | integração | `401` | B-11 | ⬜ |
| S-27 | o conteúdo da saída não aparece em nenhum log, nem em `debug`; o log tem só id, tamanho e `truncated` | eq | unit | — | B-11 | ⬜ |
| S-28 | o `tool_result` de um subagente não é achado pela rota da cadeia principal | err | integração | `NOT_FOUND` (404) | B-11 | ⬜ |
| S-29 | a rota da imagem devolve o binário com o `Content-Type` da imagem, `nosniff`, `inline` e `no-store` ([D-10](decisions.md#f1--mapeamento-e-leituras)) | eq | integração | — | B-12 | ⬜ |
| S-30 | `image/svg+xml` ou tipo fora da lista | err | integração | `415` | B-12 | ⬜ |
| S-31 | imagem com 10 MiB exatos sai; com 10 MiB + 1 | fron | integração | `413` | B-12 | ⬜ |
| S-32 | `blockId` que não é imagem, que não existe, ou de conversa que o chamador não lê | err | integração | `NOT_FOUND` (404) | B-12 | ⬜ |
| S-33 | os bytes da imagem nunca vão para o log | eq | unit | — | B-12 | ⬜ |
| S-34 | pedir a mesma imagem duas vezes dá os mesmos bytes e passa pelo cache de leitura (uma releitura só, se o `lastModified` não mudou) | idem | integração | — | B-12 | ⬜ |
| S-35 | dois pensamentos omitidos na mesma resposta ficam os dois, no web e no app | eq | unit | — | B-13 | ⬜ |
| S-36 | o mesmo bloco recebido pela página e pelo envio do seguidor aparece uma vez (mesmo `blockId`) | idem | unit | — | B-13 | ⬜ |
| S-37 | evento sem `blockId` (servidor antigo): a deduplicação de hoje continua valendo | fron | unit | — | B-13 | ⬜ |
| S-38 | sessão viva com histórico (`withHistory`): a junção continua por `messageId`, e nenhum bloco duplica nem some, embora os `blockId` do vivo e do histórico difiram (R-07) | conc | integração | — | B-13 | ⬜ |
| S-39 | entradas novas de uma resposta já começada (mesmo `message.id`) caem na mesma mensagem, em ordem | est | unit | — | B-13 | ⬜ |

## Seguidor no backend — B-14…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-40 | `transcriptTail` devolve as entradas depois do id, em ordem | eq | unit | — | B-14 | ⬜ |
| S-41 | `afterMessageId` é a última entrada: cauda vazia | fron | unit | — | B-14 | ⬜ |
| S-42 | `afterMessageId` é `null` (conversa estava vazia): cauda é tudo | fron | unit | — | B-14 | ⬜ |
| S-43 | `afterMessageId` não está na cadeia (rewind, compactação): "fora da cadeia" | est | unit | — | B-14 | ⬜ |
| S-44 | a função é pura: mesma entrada, mesma saída | idem | unit | — | B-14 | ⬜ |
| S-45 | última entrada é `tool_use` sem `tool_result`, `thinking`, ou prompt sem resposta, com `activeElsewhere`: `working = true` | eq | unit | — | B-15 | ⬜ |
| S-46 | última entrada é `text` final da resposta: `working = false` | eq | unit | — | B-15 | ⬜ |
| S-47 | as mesmas entradas de S-45 com `activity` parada ou `liveHere`: `working = false` | est | unit | — | B-15 | ⬜ |
| S-48 | janela de atividade aos 119 s, 120 s e 121 s: `working` acompanha a `activity` | fron | unit | — | B-15 | ⬜ |
| S-49 | conversa vazia: `working = false` | fron | unit | — | B-15 | ⬜ |
| S-50 | `tool_use` cujo `tool_result` chegou na mesma leitura: `working` segue a entrada seguinte, não o `tool_use` | est | unit | — | B-15 | ⬜ |
| S-51 | `follow` responde `transcript.following` com `followId` e `activity`, e depois manda **tudo** o que veio após `afterMessageId`, mesmo o gravado entre a resposta HTTP e o `follow` | conc | integração | — | B-16 | ⬜ |
| S-52 | o `lastModified` não muda: o tick não relê as mensagens (só `getSessionInfo`) | eq | unit | — | B-16 | ⬜ |
| S-53 | o `lastModified` muda: uma releitura, e `transcript.appended` só com o novo, com `seq` crescente por `followId` | eq | integração | — | B-16 | ⬜ |
| S-54 | duas abas e o mobile acompanhando a mesma conversa: um tick, uma releitura, três envios | conc | integração | — | B-16 | ⬜ |
| S-55 | a cadeia é reescrita (fixture compactada): `transcript.reset { reason: 'rewritten' }` e o seguidor para | est | integração | — | B-16 | ⬜ |
| S-56 | a conversa some (`getSessionInfo` devolve `undefined`): `transcript.reset { reason: 'gone' }` | err | integração | — | B-16 | ⬜ |
| S-57 | `activeElsewhere` → parada → `activeElsewhere`: o intervalo passa de 1 s a 10 s e volta ([D-11](decisions.md#f2--seguidor-no-backend)) | est | unit | — | B-16 | ⬜ |
| S-58 | conversa `liveHere` (sessão viva deste backend): o `follow` é recusado, e a tela usa `session.attach` | est | integração | `TRANSCRIPT_FOLLOW_LIVE_HERE` | B-16 | ⬜ |
| S-59 | `getSessionInfo` falha ou estoura o prazo num tick: log, o tick seguinte tenta de novo, nenhum envio quebrado | err | unit | — | B-16 | ⬜ |
| S-60 | conversa que o chamador não lê, ou id inexistente: mesma resposta | err | integração | `NOT_FOUND` | B-16 | ⬜ |
| S-61 | a 4ª assinatura da conexão passa; a 5ª é recusada | fron | integração | `TRANSCRIPT_FOLLOW_LIMIT` | B-16 | ⬜ |
| S-62 | a 16ª conversa acompanhada no total passa; a 17ª é recusada, e outra conversa volta a caber quando uma é solta | fron | integração | `TRANSCRIPT_FOLLOW_LIMIT` | B-16 | ⬜ |
| S-63 | dois blocos da mesma resposta gravados em ticks diferentes chegam em dois `appended`, em ordem | conc | integração | — | B-16 | ⬜ |
| S-64 | `follow` repetido com o mesmo `afterMessageId` dá o mesmo conjunto de entradas | idem | integração | — | B-16 | ⬜ |
| S-65 | nada do `followId` chega antes do `transcript.following` | est | integração | — | B-17 | ⬜ |
| S-66 | `unfollow` repetido, ou de um `followId` que não existe: sem erro | idem | integração | — | B-17 | ⬜ |
| S-67 | a conexão cai: todas as assinaturas dela são soltas, e a conversa sem assinante para o tick | est | integração | — | B-17 | ⬜ |
| S-68 | a conexão cai no meio de um envio: nada vaza para outra conexão, e o tick dos outros assinantes continua | conc | integração | — | B-17 | ⬜ |
| S-69 | payload inválido (`conversationId` que não é UUID, `afterMessageId` não texto) | err | integração | `VALIDATION_ERROR` | B-17 | ⬜ |
| S-70 | a reconexão reassina com o último `lastMessageId` e recebe só o que faltou | idem | integração | — | B-17 | ⬜ |
| S-71 | as variáveis novas têm padrão e validação; valor inválido impede a subida com a mensagem da config; estão no `.env.example` | err | unit | — | B-18 | ⬜ |
| S-72 | assinatura, tick (hit/miss do cache), envio (contagem, nunca conteúdo), reset e soltura são logados em `debug` | eq | unit | — | B-18 | ⬜ |
| S-73 | `scripts/transcript-follow-bench.mjs` mede o maior transcript do store e 4 conversas acompanhadas, e imprime tempo e heap sem conteúdo; o resultado está na D-11 | eq | unit | — | B-19 | ⬜ |

## Acompanhar no web — B-20…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-74 | o serviço manda `transcript.follow` com o `lastMessageId` da página e entrega os `appended` do seu `followId` | eq | unit | — | B-20 | ⬜ |
| S-75 | `appended` de outro `followId` é ignorado | err | unit | — | B-20 | ⬜ |
| S-76 | `seq` com buraco: o serviço pede reset (relê a página 1 e reassina) | err | unit | — | B-20 | ⬜ |
| S-77 | o hook junta páginas e anexados pelo mesmo redutor; o resultado é igual ao de ler a conversa inteira de novo | eq | integração | — | B-21 | ⬜ |
| S-78 | `transcript.reset`: relê a página 1, descarta os anexados e reassina | est | integração | — | B-21 | ⬜ |
| S-79 | aba em segundo plano solta; ao voltar, reassina com o último `lastMessageId` e nada se perde | est | integração | — | B-21 | ⬜ |
| S-80 | o WS cai e volta: reassina sem duplicar bloco | idem | integração | — | B-21 | ⬜ |
| S-81 | `TRANSCRIPT_FOLLOW_LIMIT`: o leitor mostra a mensagem traduzida e continua legível, sem acompanhar | err | integração | `TRANSCRIPT_FOLLOW_LIMIT` | B-21 | ⬜ |
| S-82 | `useConversationHistory` expõe `lastMessageId` e a `activity` mais recente, e carregar página antiga durante um envio não perde nem duplica nada | conc | integração | — | B-22 | ⬜ |
| S-83 | com o leitor no fim, o que chega rola junto | eq | integração | — | B-23 | ⬜ |
| S-84 | com o leitor rolado para cima, aparece "N novas"; N conta mensagens, não blocos; clicar leva ao fim e some | est | integração | — | B-23 | ⬜ |
| S-85 | o aviso "ativa em outro cliente" aparece e some conforme a `activity` dos envios | est | integração | — | B-23 | ⬜ |
| S-86 | "Trabalhando em outro cliente…" aparece com `working = true`, some com `false`, tem ajuda que diz que é inferência, e é anunciado a leitor de tela sem roubar o foco | eq | integração | — | B-23 | ⬜ |
| S-87 | "Continuar esta conversa" com a assinatura aberta: confirma se ativa, solta a assinatura, e a tela vira a sessão viva | est | integração | — | B-23 | ⬜ |
| S-88 | nenhum componente fala com o `ws-client`: o `lint:arch` reprova o contrário | err | unit | — | B-23 | ⬜ |

## Acompanhar no mobile — B-24…B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-89 | o mapper lê `activity` e `lastMessageId` da página; ausentes (servidor antigo) dão `null`, sem quebrar | fron | unit | — | B-24 | ⬜ |
| S-90 | o data source manda `transcript.follow` e entrega os eventos novos, mapeados pelo `protocol.g.dart` | eq | unit | — | B-24 | ⬜ |
| S-91 | o controller junta os anexados à `Conversation`; o resultado é igual ao de reler tudo | eq | unit | — | B-25 | ⬜ |
| S-92 | `transcript.reset`: relê a página 1 e reassina | est | unit | — | B-25 | ⬜ |
| S-93 | `AppLifecycleState.paused` solta; `resumed` reassina com o último `lastMessageId` | est | unit | — | B-25 | ⬜ |
| S-94 | WS cai e volta: reassina sem duplicar | idem | unit | — | B-25 | ⬜ |
| S-95 | sair da página solta a assinatura (o provider é descartado) | est | widget | — | B-25 | ⬜ |
| S-96 | o aviso "ativa em outro cliente" aparece e some com a `activity` | est | widget | — | B-26 | ⬜ |
| S-97 | "Continuar esta conversa" numa conversa ativa pede confirmação antes do fork; cancelar não faz fork | eq | widget | — | B-26 | ⬜ |
| S-98 | "Trabalhando em outro cliente…" com `working`, com a ajuda, e com `Semantics` de região viva | eq | widget | — | B-26 | ⬜ |
| S-99 | no fim, acompanha; rolado para cima, "N novas" leva ao fim | est | widget | — | B-26 | ⬜ |
| S-100 | `TRANSCRIPT_FOLLOW_LIMIT`: a mensagem traduzida, e o leitor continua legível | err | widget | `TRANSCRIPT_FOLLOW_LIMIT` | B-26 | ⬜ |

## Fidelidade — B-27…B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-101 | pensamento omitido: "Pensou", recolhido; ao abrir, "o modelo não mostrou" — igual no web e no app | eq | integração / widget | — | B-27, B-31 | ⬜ |
| S-102 | pensamento resumido: o texto à vista, em estilo atenuado, com o rótulo "Pensou" ([D-15](decisions.md#f5--fidelidade-no-web)) | eq | integração / widget | — | B-27, B-31 | ⬜ |
| S-103 | pensamento `redacted`: continua dizendo que o conteúdo foi ocultado | eq | integração / widget | — | B-27, B-31 | ⬜ |
| S-104 | no histórico, com `at` da entrada anterior e do bloco: "Pensou por até N s" ([D-14](decisions.md#f5--fidelidade-no-web)) | eq | unit | — | B-27, B-31 | ⬜ |
| S-105 | intervalo de 0 s, de menos de 1 s e de 60 s ou mais: o texto arredonda e muda de unidade como o rótulo ao vivo | fron | unit | — | B-27, B-31 | ⬜ |
| S-106 | sem `at` (servidor antigo, ou primeira entrada): sem duração | fron | unit | — | B-27, B-31 | ⬜ |
| S-107 | ao vivo, a duração continua medida pelos frames, sem "até" | est | integração | — | B-27 | ⬜ |
| S-108 | um turno com várias respostas da API mostra "CLAUDE" uma vez | eq | integração | — | B-28 | ⬜ |
| S-109 | resposta só de `tool_use` não desenha cabeçalho vazio | fron | integração | — | B-28 | ⬜ |
| S-110 | prompt enfileirado no meio do turno abre um turno novo, e o autor aparece de novo depois dele; vale no leitor e na sessão viva | est | integração | — | B-28 | ⬜ |
| S-111 | com `title`, o rótulo é "Bash" + a descrição; sem `title`, o rótulo de hoje | eq | integração / widget | — | B-29, B-32 | ⬜ |
| S-112 | Bash expandido: IN com o `command` em mono, OUT com o `summary` (ANSI); as outras ferramentas mantêm a apresentação do input | eq | integração / widget | — | B-29, B-32 | ⬜ |
| S-113 | expandir pede a saída completa uma vez; recolher e expandir de novo não pede outra | idem | integração / widget | — | B-29, B-32 | ⬜ |
| S-114 | a saída veio cortada (`truncated`): o OUT diz quanto tinha e onde cortou | fron | integração / widget | — | B-29, B-32 | ⬜ |
| S-115 | a rota falha (rede, 404): o OUT fica com o `summary` e diz que a saída completa não carregou, com "tentar de novo" | err | integração / widget | `NOT_FOUND` / rede | B-29, B-32 | ⬜ |
| S-116 | ferramenta ainda rodando (sem `tool_result`): o OUT não pede a rota | est | integração / widget | — | B-29, B-32 | ⬜ |
| S-117 | o card do app começa recolhido e abre por toque e por acessibilidade | eq | widget | — | B-32 | ⬜ |
| S-118 | prompt com imagem: "imagem anexada" (tipo e tamanho) no lugar do balão vazio, no web e no app | eq | integração / widget | — | B-30, B-33 | ⬜ |
| S-119 | abrir a imagem: busca pela rota com o token, mostra por `blob:`/memória, e o `blob:` é revogado ao fechar | eq | integração / widget | — | B-30, B-33 | ⬜ |
| S-120 | a rota devolve `415`, `413` ou `404`: a mensagem traduzida no lugar da imagem | err | integração / widget | `415` / `413` / `NOT_FOUND` | B-30, B-33 | ⬜ |
| S-121 | prompt só com imagem, sem texto: o turno do usuário existe e tem o marcador | fron | integração / widget | — | B-30, B-33 | ⬜ |
| S-122 | o token nunca vai na URL da imagem | err | unit | — | B-30, B-33 | ⬜ |

## E2E — B-34…B-37

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-123 | a porta do e2e acrescenta entradas gravadas a uma conversa externa e reescreve a cadeia; não existe no `main.ts` do produto | eq | integração | — | B-34 | ⬜ |
| S-124 | web: conversa externa aberta no leitor cresce sem recarregar; "trabalhando" aparece e some | est | e2e | — | B-35 | ⬜ |
| S-125 | web: leitor rolado para cima mostra "N novas" e leva ao fim | est | e2e | — | B-35 | ⬜ |
| S-126 | web: a cadeia reescrita faz o leitor reler e continuar acompanhando | est | e2e | — | B-35 | ⬜ |
| S-127 | web: pensamento, título do Bash, IN/OUT com a saída completa e a imagem aberta, com acessibilidade sem violação | eq | e2e | — | B-35 | ⬜ |
| S-128 | app: conversa externa cresce no leitor, com o aviso e o "trabalhando" | est | e2e | — | B-36 | ⬜ |
| S-129 | app: "Continuar esta conversa" pede confirmação numa conversa ativa | eq | e2e | — | B-36 | ⬜ |
| S-130 | `pnpm verify:full` e `pnpm test:e2e:mobile` saem com código 0 | eq | e2e | — | B-37 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas e contrato (B-01…B-05) | `conc`, `est` | é documento, schema e fixture: não há estado nem concorrência; a idempotência do gerador do `protocol.g.dart` está na S-01 |
| Título da ferramenta (B-07) | `err`, `conc`, `est` | função pura de um campo do input; o erro possível (campo ausente ou de outro tipo) é fronteira (S-13) |
| Pensamento (B-27, B-31) | `conc`, `idem` | é apresentação de um bloco já deduplicado na B-13 (S-35, S-36) |
| Autor por turno (B-28) | `err`, `conc`, `idem` | regra de desenho sobre a lista já dobrada; não chama nada que falhe |
| E2E (B-34…B-37) | `conc`, `idem` no e2e | provadas nos níveis de baixo (S-54, S-64, S-70, S-80, S-94); repeti-las no navegador só deixaria o e2e mais lento e frágil |
