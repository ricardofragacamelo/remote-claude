# Plano 08 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Erro esperado.** Toda recusa que o sistema **responde** cita o `code`: do
[catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio), dos que a
[B-04](F0-contract.md) acrescenta (ditos "novo") ou dos que o
[plano 07](../07-explorer-and-editor/README.md) acrescenta ao módulo `files` (ditos "do 07"). Um `err`
com `—` é recusa que **não** é resposta do sistema: portão que reprova (`lint`, `i18n:check`) ou
conteúdo hostil neutralizado na renderização.

---

## Contrato — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | o schema aceita os anexos `file` (com e sem `range`), `folder`, `upload` (imagem ou texto enviado) e `text` de um provedor | eq | unit | — | B-01 | ✅ |
| S-02 | anexo sem `kind` é lido como `file`: o campo que já existia continua válido e `v` não sobe | eq | unit | — | B-01 | ✅ |
| S-03 | `kind: 'file'` sem `path`, `kind: 'upload'` sem `attachmentId` ou `kind: 'text'` sem `content` → recusado pelo guard gerado, em TypeScript e em Dart (`x-required-when`) | err | unit | `INVALID_INPUT` | B-01 | ✅ |
| S-04 | `range` com `startLine` 0, negativo ou `endLine < startLine` | err | unit | `INVALID_INPUT` | B-01 | ✅ |
| S-05 | anexos exatamente no `maxItems` passam; um acima é recusado | fron | unit | `INVALID_INPUT` | B-01 | ✅ |
| S-06 | `text` de provedor acima do teto de caracteres do schema | fron | unit | `INVALID_INPUT` | B-01 | ✅ |
| S-07 | eventos com os campos novos (`blockType`, `parentToolUseId`, `session.compacted`, `prompt.queued`) validam nos guards gerados; cliente antigo os ignora sem quebrar | eq | unit | — | B-02 | ✅ |
| S-08 | `session.start` com `forkAt` sem `resumeSessionId` → recusado pelo guard (`x-required-when`) | err | unit | `INVALID_INPUT` | B-02 | ✅ |
| S-09 | `contracts:check` verde com o Dart regenerado, e o app segue verde no `test:e2e:mobile` sem usar nada novo | eq | e2e | — | B-01, B-02 | ✅ |
| S-10 | cada código novo tem status, `messageKey` en/pt-BR e linha no catálogo; código sem chave reprova o teste do catálogo | err | unit | — | B-04 | ✅ |
| S-11 | o fake reproduz as fixtures gravadas de Edit, MultiEdit, Write, `Read` de referência, `Task` com subagent, `TodoWrite`, `ExitPlanMode`, thinking e `/compact`, com a mesma assimetria hook × `canUseTool` do real | eq | integração | — | B-06 | ✅ |
| S-12 | regravar uma fixture com o mesmo roteiro não muda o que os testes afirmam (ids e horários normalizados) | idem | integração | — | B-06 | ✅ |

## Sessões vivas da pasta — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-13 | lista as sessões vivas do chamador na pasta e nas subpastas, com status, modelo, modo, início, conversa e de onde foi aberta | eq | integração | — | B-07 | ✅ |
| S-14 | sessão viva de outra pessoa na mesma pasta não aparece | eq | integração | — | B-07 | ✅ |
| S-15 | sessão cujo `cwd` é a pasta-mãe não aparece (`/repo` não entra em `/repo/app`) | fron | unit | — | B-07 | ✅ |
| S-16 | prefixo que não é pasta: `/repo-old` não entra em `/repo` | fron | unit | — | B-07 | ✅ |
| S-17 | pasta sem sessão viva → `200` com lista vazia | fron | integração | — | B-07 | ✅ |
| S-18 | `workspacePath` relativo ou ausente | err | integração | `INVALID_INPUT` | B-07 | ✅ |
| S-19 | fora da allowlist / raiz de outra pessoa | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | B-07 | ✅ |
| S-20 | pasta inexistente / que é arquivo | err | integração | `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY` | B-07 | ✅ |
| S-21 | a contenção é no realpath: sessão num symlink que resolve para dentro aparece uma vez; symlink que escapa não aparece | fron | integração | — | B-07 | ✅ |
| S-22 | sessão que fecha entre duas chamadas some; a que abre aparece | est | integração | — | B-07 | ✅ |
| S-23 | sessão em `starting` aparece como `starting`, nunca duas vezes nem sem conversa | conc | integração | — | B-07 | ✅ |
| S-24 | o log de I/O da borda leva pasta e contagem, nunca resumo nem prompt | eq | integração | — | B-07 | ✅ |

## Histórico com atividade — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-25 | o histórico da pasta traz cada conversa com `activity` (`liveHere`, `activeElsewhere`, `idle`) — e as das subpastas quando a D-05 decidir por elas | eq | integração | — | B-08 | ✅ |
| S-26 | conversa externa escrita dentro da janela é `activeElsewhere`; um milissegundo fora dela é `idle` | fron | unit | — | B-08 | ✅ |
| S-27 | conversa viva para o chamador vem `liveHere` com o `liveSessionId`, e não se repete no histórico | eq | integração | — | B-08 | ✅ |
| S-28 | conversa **nossa** recente e encerrada nunca é `activeElsewhere` — quem escreveu fomos nós | eq | unit | — | B-08 | ✅ |
| S-29 | subpasta cujo realpath sai da raiz (symlink) não traz conversas | err | integração | — | B-08 | ✅ |
| S-30 | o cursor continua estável sob escrita concorrente, com subpastas | conc | integração | — | B-08 | ✅ |
| S-31 | a mesma página pedida duas vezes lê o store uma vez | idem | unit | — | B-08 | ✅ |
| S-32 | SDK indisponível no histórico; a lista de vivas continua respondendo | err | integração | `CLAUDE_UNAVAILABLE` | B-08 | ✅ |

## A view de sessões — B-09…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | a view mostra três grupos — em execução aqui, ativas em outro lugar, histórico — com origem, título, quando e modelo | eq | integração | — | B-09 | ✅ |
| S-34 | os quatro estados, por grupo: skeleton, erro com tentar de novo, vazio que ensina o próximo passo, conteúdo | eq | integração | — | B-09 | ✅ |
| S-35 | falha do histórico não esconde as vivas, e o inverso | err | integração | `CLAUDE_UNAVAILABLE` | B-09 | ✅ |
| S-36 | busca por título/resumo, filtro por origem e ordenação; a busca sem resultado diz isso e oferece limpar | fron | integração | — | B-09 | ✅ |
| S-37 | "carregar mais" acrescenta a página; falha mantém o que está, com o erro ao lado | fron | integração | `CLAUDE_UNAVAILABLE` | B-09 | ✅ |
| S-38 | a view é da aba de pasta: duas abas mostram listas diferentes, e filtro de uma não aparece na outra | eq | integração | — | B-09 | ✅ |
| S-39 | clicar numa viva → `session.attach` com `resumeFromSeq: 0`, e a conversa abre no painel | eq | integração | — | B-10 | ✅ |
| S-40 | clicar numa nossa encerrada → retomada in-place, mesmo id | eq | integração | — | B-10 | ✅ |
| S-41 | clicar numa externa → fork, dizendo que a continuação tem id novo e que o editor não verá as respostas | eq | integração | — | B-10 | ✅ |
| S-42 | externa ativa → aviso explícito de que outro processo escreve nela, e o fork só com confirmação | est | integração | — | B-10 | ✅ |
| S-43 | retomar no teto → recusa traduzida que diz que o teto é da instalação, com o tempo de espera e as sessões do usuário | err | integração | `SESSION_LIMIT_REACHED` | B-10 | ✅ |
| S-44 | retomar conversa cuja pasta saiu da allowlist | err | integração | `WORKSPACE_NOT_ALLOWED` | B-10 | ✅ |
| S-45 | clique duplo na mesma conversa → uma retomada e um painel | idem | integração | — | B-10 | ✅ |
| S-46 | retomada sem resposta no prazo do cliente | err | integração | `RESUME_TIMEOUT` | B-10 | ✅ |
| S-47 | as ações da linha estão também no menu de contexto e na command palette | eq | integração | — | B-10 | ✅ |
| S-48 | a lista se atualiza no intervalo com a view visível, e para com a view escondida ou a aba inativa | est | integração | — | B-11 | ✅ |
| S-49 | `session.started`/`session.closed` de sessão observada invalida a lista na hora | est | integração | — | B-11 | ✅ |
| S-50 | duas atualizações sobrepostas não duplicam nem reordenam linha — a mais nova vence | conc | unit | — | B-11 | ✅ |
| S-51 | aba reativada recarrega a lista uma vez | idem | integração | — | B-11 | ✅ |
| S-52 | `/workbench?folder=` com a view de sessões é o lugar do histórico da pasta; `/history` não existe (06 · D-07) | eq | integração | — | B-12 | ✅ |
| S-53 | o link de sessão (D-24) abre a aba da pasta da sessão (abrindo-a, se preciso) com a conversa no painel, ao lado do explorer e do editor; sessão inexistente mostra o erro com caminho de volta | err | integração | `SESSION_NOT_FOUND` | B-12 | ✅ |
| S-54 | o link de conversa (D-24) abre a conversa, somente leitura, no painel da aba da pasta dela | eq | integração | — | B-12 | ✅ |
| S-55 | a gaveta de ajuda da view explica os três grupos, a origem, o fork e a heurística de "ativa", em en e pt-BR | eq | integração | — | B-13 | ✅ |
| S-56 | todo controle de ícone da view tem tooltip e nome acessível; axe sem violação | eq | integração | — | B-13 | ✅ |
| S-57 | literal apresentável nas telas novas | err | unit | — | B-13 | ✅ |

## Markdown, código e caminhos — B-14…B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-58 | títulos, listas, tabelas GFM, citação, código inline e em bloco | eq | unit | — | B-14 | ✅ |
| S-59 | HTML cru no texto aparece escapado, nunca como elemento (`<img onerror>`, `<script>`, `<iframe>`) | err | unit | — | B-14 | ✅ |
| S-60 | link `javascript:`, `data:` ou `vbscript:` não vira link | err | unit | — | B-14 | ✅ |
| S-61 | imagem remota no markdown não é carregada — vira link com o endereço à vista | err | unit | — | B-14 | ✅ |
| S-62 | link externo abre em nova aba com `rel="noopener noreferrer"` | eq | unit | — | B-14 | ✅ |
| S-63 | markdown incompleto durante o delta (bloco de código aberto) renderiza sem quebrar e se acerta no `message.completed` | est | unit | — | B-14 | ✅ |
| S-64 | mensagem de 200 KB em streaming não trava o composer: só a mensagem em voo re-renderiza | fron | integração | — | B-14 | ✅ |
| S-65 | bloco com linguagem recebe realce; sem linguagem ou desconhecida → monoespaçado, sem erro | fron | unit | — | B-15 | ✅ |
| S-66 | copiar copia exatamente o conteúdo do bloco, e a confirmação é anunciada | eq | integração | — | B-15 | ✅ |
| S-67 | "inserir no editor" insere no cursor do editor ativo da mesma aba de pasta, deixa a aba suja e não grava no disco | eq | integração | — | B-15 | ✅ |
| S-68 | sem editor aberto, "inserir no editor" fica desabilitado com a razão no tooltip | fron | integração | — | B-15 | ✅ |
| S-69 | caminho relativo ou absoluto dentro da pasta, com ou sem `:linha`, vira link que abre no editor na linha | eq | unit | — | B-16 | ✅ |
| S-70 | caminho fora da pasta, URL, ou `a/b` em prosa que não é arquivo fica texto | fron | unit | — | B-16 | ✅ |
| S-71 | link para arquivo que não existe mais → erro traduzido, e o painel fica | err | integração | `FILE_NOT_FOUND` (do 07) | B-16 | ✅ |

## Tools, saída, thinking, tarefas, subagents e plano — B-17…B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-72 | `Read`, `Edit`, `Write`, `Bash`, `Grep`, `Glob`, `WebFetch` têm rótulo compacto traduzido com o sujeito relativo à pasta | eq | unit | — | B-17 | ✅ |
| S-73 | tool MCP `mcp__srv__tool` mostra servidor e tool; tool desconhecida mostra o nome, e ao expandir o input inteiro | fron | unit | — | B-17 | ✅ |
| S-74 | expandir mostra o input exato, sem truncar; o título compacto tem o comando inteiro no nome acessível | eq | integração | — | B-17 | ✅ |
| S-75 | `started` → `succeeded`/`failed`/`denied` muda ícone e texto; `denied` mostra o motivo | est | integração | — | B-17 | ✅ |
| S-76 | o card de permissão nunca é compactado | eq | integração | — | B-17 | ✅ |
| S-77 | `tool.progress` chega vivo e o ANSI vira cor por token, pelos tokens de tema | eq | unit | — | B-18 | ✅ |
| S-78 | OSC 8 (hyperlink), título de janela e sequência desconhecida não viram link nem mudam o documento | err | unit | — | B-18 | ✅ |
| S-79 | saída acima do teto da UI mostra o fim e "mostrar tudo", sem travar | fron | integração | — | B-18 | ✅ |
| S-80 | chunks reentregues no replay não duplicam saída | idem | unit | — | B-18 | ✅ |
| S-81 | com a pessoa no fim, a saída acompanha; rolou para cima, respeita | est | integração | — | B-18 | ✅ |
| S-82 | thinking chega vivo como bloco próprio, recolhido por padrão, com "pensou por *n* s" | eq | integração | — | B-19 | ✅ |
| S-83 | thinking redigido pelo modelo mostra que existiu, sem inventar conteúdo | fron | unit | — | B-19 | ✅ |
| S-84 | thinking no histórico (transcript) aparece igual ao vivo — um redutor só | eq | integração | — | B-19 | ✅ |
| S-85 | a lista de tarefas aparece viva, com pendente/em andamento/concluída, e se atualiza a cada chamada — pelo `TodoWrite` (`todo-write-turn`) e pelas `Task*` (`task-tools-turn`), com o mesmo desenho | eq | integração | — | B-20 | ✅ |
| S-86 | `TodoWrite` com lista vazia limpa o painel; `TaskUpdate` com `deleted` tira a tarefa; input malformado, ou `TaskUpdate` de `id` desconhecido, mostra a tool genérica, sem quebrar | fron | unit | — | B-20 | ✅ |
| S-87 | tarefa que muda de estado entre duas chamadas mostra a transição, nas duas formas, e a lista sobrevive a recarga (histórico) | est | integração | — | B-20 | ✅ |
| S-88 | tools e texto de um subagent aparecem aninhados sob o `Task` que o abriu, pelo `parentToolUseId` | eq | integração | — | B-21 | ✅ |
| S-89 | dois subagents em paralelo não misturam os filhos | conc | integração | — | B-21 | ✅ |
| S-90 | subagent no histórico é carregado ao expandir, pelas funções do SDK | eq | integração | — | B-21 | ✅ |
| S-91 | subagent de conversa que o chamador não lê | err | integração | `NOT_FOUND` | B-21 | ✅ |
| S-92 | em modo `plan`, o `ExitPlanMode` vira o card "aprovar plano", com o plano em markdown | eq | integração | — | B-22 | ✅ |
| S-93 | aprovar o plano resolve `allow` e troca o modo para o escolhido (padrão ou aceitar edições) | est | integração | — | B-22 | ✅ |
| S-94 | "continuar planejando" resolve `deny` com o comentário como motivo, que volta ao Claude | est | integração | — | B-22 | ✅ |
| S-95 | o plano aprovado noutro dispositivo atualiza o card, sem segunda resolução | conc | integração | — | B-22 | ✅ |

## Status, turno, cópia e busca — B-23, B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-96 | o indicador segue `session.statusChanged`, e `waitingPermission` leva ao card | est | integração | — | B-23 | ✅ |
| S-97 | o resumo do turno mostra custo, duração e tokens (entrada, saída, cache), formatados pelo idioma | eq | unit | — | B-23 | ✅ |
| S-98 | turno interrompido sem `usage` mostra o que há, sem `NaN` | fron | unit | — | B-23 | ✅ |
| S-99 | o custo da sessão soma os turnos sem contar o replay duas vezes | idem | unit | — | B-23 | ✅ |
| S-100 | copiar mensagem copia o markdown de origem | eq | integração | — | B-24 | ✅ |
| S-101 | buscar na conversa destaca e navega entre ocorrências; "buscar em toda a conversa" carrega as páginas antigas | eq | integração | — | B-24 | ✅ |
| S-102 | busca sem ocorrência diz isso; busca durante o streaming inclui o que chega | fron | integração | — | B-24 | ✅ |

## Diffs no backend — B-25, B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-103 | Edit: o trecho antes/depois vem do input, e o arquivo inteiro quando há snapshot do turno e o disco ainda é o que a sessão deixou | eq | integração | — | B-25 | ⬜ |
| S-104 | MultiEdit: cada edição vira um trecho, na ordem | eq | unit | — | B-25 | ⬜ |
| S-105 | Write sobre arquivo existente: antes = snapshot; Write de arquivo novo: antes = ausente | eq | integração | — | B-25 | ⬜ |
| S-106 | segundo Edit no mesmo arquivo no mesmo turno: só o trecho, com o lado anterior `unavailable` e o motivo | fron | integração | — | B-25 | ⬜ |
| S-107 | arquivo acima do teto do snapshot → lado anterior `notRestorable`; o trecho continua | fron | integração | — | B-25 | ⬜ |
| S-108 | `toolUseId` que a sessão não tem | err | integração | `TOOL_USE_NOT_FOUND` (novo) | B-25 | ⬜ |
| S-109 | tool que não escreve arquivo (`Bash`, `Read`) | err | integração | `DIFF_NOT_APPLICABLE` (novo) | B-25 | ⬜ |
| S-110 | sessão de outra pessoa / encerrada | err | integração | `FORBIDDEN`, `SESSION_NOT_FOUND` | B-25 | ⬜ |
| S-111 | conteúdo binário | err | integração | `FILE_NOT_TEXT` (do 07) | B-25 | ⬜ |
| S-112 | o log da borda tem caminho e tamanhos, nunca conteúdo | eq | integração | — | B-25 | ⬜ |
| S-113 | as alterações listam cada arquivo que a sessão (e a conversa continuada in-place) criou, modificou ou apagou | eq | integração | — | B-26 | ⬜ |
| S-114 | arquivo alterado à mão depois da sessão vem `modifiedOutside` | est | integração | — | B-26 | ⬜ |
| S-115 | sessão que não mudou arquivo → lista vazia | fron | integração | — | B-26 | ⬜ |
| S-116 | o arquivo da alteração traz antes da sessão, agora, os trechos e a `revision`; caminho que não é da sessão | err | integração | `NOT_FOUND` | B-26 | ⬜ |
| S-117 | caminho que virou symlink para fora é recusado sem ler | err | integração | `WORKSPACE_NOT_ALLOWED` | B-26 | ⬜ |
| S-118 | pedido durante um turno que escreve o mesmo arquivo devolve um estado coerente — antes ou depois, nunca metade | conc | integração | — | B-26 | ⬜ |

## Diffs na tela — B-27…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-119 | o card de Edit/Write mostra o diff inline, recolhido acima de *n* linhas | eq | integração | — | B-27 | ⬜ |
| S-120 | "abrir diff" abre a aba de diff no editor da mesma aba de pasta; abrir de novo foca a mesma | idem | integração | — | B-27 | ⬜ |
| S-121 | falha ao carregar o diff mostra o erro no card, e a conversa fica | err | integração | `SESSION_NOT_FOUND` | B-27 | ⬜ |
| S-122 | a view "Alterações" lista os arquivos com +/−, e abre o diff contra antes da sessão | eq | integração | — | B-28 | ⬜ |
| S-123 | a view se atualiza a cada `turn.completed` e `session.rewound` | est | integração | — | B-28 | ⬜ |
| S-124 | `modifiedOutside` aparece com aviso, e diz que rejeitar vai preservar o arquivo | est | integração | — | B-28 | ⬜ |
| S-125 | "aceitar" marca o arquivo como revisado e o tira da lista de pendentes; a marca sobrevive a trocar de aba e a recarregar | est | integração | — | B-28 | ⬜ |
| S-126 | aceitar tudo e filtrar por pendentes/revisados | eq | integração | — | B-28 | ⬜ |
| S-127 | a permissão de Edit mostra o diff contra o disco agora, antes de aprovar | eq | integração | — | B-29 | ⬜ |
| S-128 | a permissão de Write de arquivo novo mostra tudo como acréscimo | eq | unit | — | B-29 | ⬜ |
| S-129 | `old_string` que não existe no disco agora → a prévia diz que a edição não casa, sem inventar diff | fron | unit | — | B-29 | ⬜ |
| S-130 | arquivo grande ou binário → prévia indisponível com o motivo, e o input exato continua à vista | err | integração | `FILE_TOO_LARGE`, `FILE_NOT_TEXT` (do 07) | B-29 | ⬜ |
| S-131 | o disco muda entre a prévia e a aprovação → a prévia é relida ao focar e diz contra que momento foi calculada | conc | integração | — | B-29 | ⬜ |

## Rejeitar por arquivo e por trecho — B-30, B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-132 | rejeitar um arquivo devolve só ele ao estado de antes da sessão; os outros ficam | eq | integração | — | B-30 | ⬜ |
| S-133 | arquivo alterado à mão → preservado (`modifiedOutside`), nada escrito | est | integração | — | B-30 | ⬜ |
| S-134 | rejeitar com um turno em execução | conc | integração | `SESSION_LOCKED` | B-30 | ⬜ |
| S-135 | rejeitar duas vezes: a segunda devolve `unchanged` | idem | integração | — | B-30 | ⬜ |
| S-136 | caminho que a sessão não tocou | err | unit | `INVALID_INPUT` | B-30 | ⬜ |
| S-137 | trilha indisponível → nada é tocado | err | unit | `INTERNAL_ERROR` | B-30 | ⬜ |
| S-138 | rejeitar um trecho restaura só aquele trecho; o resto do arquivo, inclusive outros trechos da sessão, fica | eq | integração | — | B-31 | ⬜ |
| S-139 | trecho cuja `revision` não é mais a do disco (o arquivo mudou) | conc | integração | `SESSION_CHANGE_STALE` (novo) | B-31 | ⬜ |
| S-140 | trecho que toca o primeiro ou o último byte do arquivo, e arquivo sem quebra de linha final | fron | unit | — | B-31 | ⬜ |
| S-141 | rejeitar o último trecho de um arquivo criado pela sessão o apaga, como o desfazer faria | est | integração | — | B-31 | ⬜ |
| S-142 | rejeitar oferece desfazer enquanto o arquivo não mudar de novo; desfazer devolve exatamente o que estava | est | integração | — | B-31 | ⬜ |
| S-143 | a escrita é atômica e entra na trilha antes do disco; falha no meio não deixa arquivo truncado | err | integração | `INTERNAL_ERROR` | B-31 | ⬜ |
| S-144 | o mesmo trecho rejeitado duas vezes (reenvio) escreve uma vez | idem | integração | — | B-31 | ⬜ |

## O painel na aba de pasta, a sessão no primeiro prompt, a fila e o reenviar — B-32…B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-145 | o painel fica **dentro** da aba de pasta, na secondary side bar, visível ao mesmo tempo que o explorer e o editor (a partir de `md`) — não é uma tela separada | eq | integração | — | B-32 | ⬜ |
| S-146 | o painel é da aba de pasta: conversa, rascunho e rolagem de uma aba não aparecem na outra | eq | integração | — | B-32 | ⬜ |
| S-147 | alternar de aba e voltar preserva rascunho, contexto, conversa aberta e rolagem | est | integração | — | B-32 | ⬜ |
| S-148 | a mesma sessão em duas abas de pasta (pasta e subpasta) usa um attach, as duas views ficam coerentes, e fechar uma não desanexa a outra | conc | integração | — | B-32 | ⬜ |
| S-149 | fechar a aba de pasta não encerra a sessão, e diz isso; reabrir a pasta a mostra em execução | est | integração | — | B-32 | ⬜ |
| S-150 | abas de conversa: abrir, alternar, reordenar e fechar — fechar a aba não encerra a sessão, e encerrar é ação separada | est | integração | — | B-32 | ⬜ |
| S-151 | nova conversa não abre subprocesso até o primeiro prompt | eq | integração | — | B-33 | ⬜ |
| S-152 | o primeiro prompt faz `session.start` com modelo/modo/esforço escolhidos, e depois `session.prompt` com o contexto | est | integração | — | B-33 | ⬜ |
| S-153 | start recusado no teto mantém o texto e o contexto no rascunho | err | integração | `SESSION_LIMIT_REACHED` | B-33 | ⬜ |
| S-154 | Enter duas vezes no rascunho abre uma sessão só | idem | integração | — | B-33 | ⬜ |
| S-155 | fechar o rascunho não deixa nada vivo no backend | est | integração | — | B-33 | ⬜ |
| S-156 | prompt enviado durante um turno aparece na fila, com posição, para todos que observam | eq | integração | — | B-34 | ⬜ |
| S-157 | cancelar um prompt na fila o tira antes de chegar ao Claude | est | integração | — | B-34 | ⬜ |
| S-158 | cancelar o que acabou de começar | conc | integração | `CONFLICT` | B-34 | ⬜ |
| S-159 | cancelar duas vezes o mesmo: a segunda é `ack` sem efeito; id desconhecido é recusado | idem | integração | `QUEUED_PROMPT_NOT_FOUND` (novo) | B-34 | ⬜ |
| S-160 | a fila roda na ordem de chegada, de clientes diferentes | conc | integração | — | B-34 | ⬜ |
| S-161 | editar e reenviar um prompt anterior bifurca a conversa naquele ponto, num id novo, e a original continua legível | eq | integração | — | B-35 | ⬜ |
| S-162 | reenviar oferece também desfazer os arquivos para antes daquele turno, desligado por padrão | est | integração | — | B-35 | ⬜ |
| S-163 | ponto de fork que não é da conversa | err | unit | `INVALID_INPUT` | B-35 | ⬜ |
| S-164 | o CLI recusa o ponto (`resumeDropsTurn`) → recusa traduzida e retomada simples oferecida, sem repetir o fork | err | integração | `SESSION_FORK_REJECTED` (novo) | B-35 | ⬜ |
| S-165 | reenviar do primeiro prompt da conversa (fronteira do início) | fron | integração | — | B-35 | ⬜ |

## Modelo, modo, esforço, contexto, MCP e exportação — B-36…B-39

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-166 | a lista de modelos vem do `supportedModels()` da instalação, sem constante no código | eq | integração | — | B-36 | ⬜ |
| S-167 | cache por versão do CLI e workspace: duas sessões juntas fazem uma chamada; versão nova recarrega | idem | integração | — | B-36 | ⬜ |
| S-168 | lista indisponível → o seletor mostra o modelo atual e o composer segue | err | integração | `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT` | B-36 | ⬜ |
| S-169 | trocar o modelo manda `session.setModel`, e o indicador reflete | est | integração | — | B-36 | ⬜ |
| S-170 | o modo oferece padrão, aceitar edições e plan — nunca `bypassPermissions`; aceitar edições avisa que Edit/Write não pedirão aprovação | eq | integração | — | B-36 | ⬜ |
| S-171 | esforço só aparece para modelo com `supportsEffort`, com os níveis dele; nível fora da lista | err | unit | `INVALID_INPUT` | B-36 | ⬜ |
| S-172 | no rascunho sem catálogo em cache, o seletor oferece só o padrão da instalação | fron | integração | — | B-36 | ⬜ |
| S-173 | o medidor mostra o uso da janela de contexto por categoria, e avisa perto do limite | eq | integração | — | B-37 | ⬜ |
| S-174 | `/compact` pelo botão compacta, e a conversa mostra o marco `session.compacted` | est | integração | — | B-37 | ⬜ |
| S-175 | uso de contexto indisponível → o medidor some com o motivo no tooltip, sem bloquear | err | integração | `CLAUDE_UNAVAILABLE` | B-37 | ⬜ |
| S-176 | o indicador de MCP mostra cada servidor com o status (conectado, falhou, precisa auth, pendente, desligado) | eq | integração | — | B-38 | ⬜ |
| S-177 | a resposta nunca traz `config` nem `error` cru do servidor | eq | integração | — | B-38 | ⬜ |
| S-178 | sem servidores o indicador some; consulta que falha mostra erro compacto sem bloquear o chat | err | integração | `CLAUDE_UNAVAILABLE` | B-38 | ⬜ |
| S-179 | sem a tela do plano 11, o indicador não oferece link morto | fron | integração | — | B-38 | ⬜ |
| S-180 | exportar gera o markdown da conversa inteira (todas as páginas), com as tools compactas | eq | integração | — | B-39 | ⬜ |
| S-181 | saídas de tool só entram com a opção ligada, desligada por padrão | est | integração | — | B-39 | ⬜ |
| S-182 | falha ao carregar uma página no meio da exportação não baixa um arquivo pela metade | err | integração | `CLAUDE_UNAVAILABLE` | B-39 | ⬜ |

## Teclado, status bar, badges e ajuda do painel — B-40…B-43

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-183 | Esc no composer com turno em execução interrompe; com menu ou diálogo aberto, Esc fecha o menu e não interrompe | est | integração | — | B-40 | ⬜ |
| S-184 | Esc repetido manda um interrupt só; sem turno, não faz nada | idem | integração | — | B-40 | ⬜ |
| S-185 | abrir painel, nova conversa, focar composer e interromper têm atalho, aparecem na command palette com ele e funcionam com o foco em qualquer parte da aba | eq | integração | — | B-40 | ⬜ |
| S-186 | a status bar mostra status, modelo e custo da sessão ativa da aba ativa, e troca com a aba | eq | integração | — | B-41 | ⬜ |
| S-187 | sem conversa ativa, o item da status bar some, sem vazio | fron | integração | — | B-41 | ⬜ |
| S-188 | permissão com o painel escondido → badge na activity bar e aviso anunciado (`aria-live`) | est | integração | — | B-42 | ⬜ |
| S-189 | permissão de sessão de aba inativa → badge na aba de pasta e aviso global; clicar leva à aba, à conversa e ao card | est | integração | — | B-42 | ⬜ |
| S-190 | permissão resolvida noutro dispositivo tira o badge | conc | integração | — | B-42 | ⬜ |
| S-191 | as sessões das abas inativas continuam anexadas; as dez que a instalação comporta cabem no `maxAttachedSessions` | fron | integração | — | B-42 | ⬜ |
| S-192 | notificação do navegador só com a página escondida, só depois de a pessoa ligar, e sem o conteúdo do comando | eq | integração | — | B-42 | ⬜ |
| S-193 | permissão do navegador negada → o painel diz como reativar e continua com o badge | err | integração | — | B-42 | ⬜ |
| S-194 | a gaveta de ajuda do painel e da view "Alterações" explica modos, fila, reenviar, rejeitar e o que não é gravado, em en e pt-BR | eq | integração | — | B-43 | ⬜ |
| S-195 | todo controle de ícone do painel tem tooltip e nome acessível; foco e teclado percorrem painel, cards e diff; axe sem violação | eq | integração | — | B-43 | ⬜ |
| S-196 | estado vazio do painel ensina a primeira conversa, o `@`, o `/`, o arrastar e o atalho | eq | integração | — | B-43 | ⬜ |

## Referências e anexos no backend — B-44, B-45

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-197 | referência de arquivo, de pasta e de trecho dentro da pasta da sessão chega ao Claude no formato da D-01, e o `Read`/`Glob` que ele fizer entra na trilha | eq | integração | — | B-44 | ⬜ |
| S-198 | com `range`, as linhas; sem `range`, o arquivo | eq | unit | — | B-44 | ⬜ |
| S-199 | caminho fora do workspace da sessão, ou com `..`, recusa o prompt **inteiro** | err | integração | `WORKSPACE_NOT_ALLOWED` | B-44 | ⬜ |
| S-200 | symlink que escapa | err | integração | `WORKSPACE_NOT_ALLOWED` | B-44 | ⬜ |
| S-201 | arquivo inexistente; `kind: 'file'` apontando diretório; arquivo binário que não é imagem | err | integração | `FILE_NOT_FOUND`, `FILE_NOT_TEXT` (do 07), `INVALID_INPUT` | B-44 | ⬜ |
| S-202 | `range` além do fim do arquivo passa: o Claude lê o que existe | fron | unit | — | B-44 | ⬜ |
| S-203 | `text` de provedor (`@terminal`) vai como conteúdo delimitado e rotulado pela origem, dentro do teto | eq | unit | — | B-44 | ⬜ |
| S-204 | o log de `claude.input` leva os caminhos e tamanhos, nunca o conteúdo | eq | integração | — | B-44 | ⬜ |
| S-205 | prompt com contexto durante um turno entra na fila como qualquer prompt | conc | integração | — | B-44 | ⬜ |
| S-206 | imagem PNG/JPEG/GIF/WebP dentro do teto chega ao Claude como bloco de imagem | eq | integração | — | B-45 | ⬜ |
| S-207 | arquivo de texto do desktop dentro do teto vai como conteúdo delimitado com o nome dele, sem tocar a pasta | eq | integração | — | B-45 | ⬜ |
| S-208 | anexo exatamente no teto passa; um byte acima | fron | integração | `PAYLOAD_TOO_LARGE` | B-45 | ⬜ |
| S-209 | tipo não aceito (SVG, PDF, binário) | err | integração | `ATTACHMENT_TYPE_UNSUPPORTED` (novo) | B-45 | ⬜ |
| S-210 | `attachmentId` desconhecido, de outra sessão ou expirado | err | integração | `ATTACHMENT_NOT_FOUND` (novo) | B-45 | ⬜ |
| S-211 | o anexo nunca vai para o workspace, a trilha ou o log — só tipo, tamanho e hash | eq | integração | — | B-45 | ⬜ |
| S-212 | o anexo é descartado ao fechar a sessão e no TTL | est | integração | — | B-45 | ⬜ |
| S-213 | o mesmo upload reenviado (retry) não duplica | idem | integração | — | B-45 | ⬜ |

## O composer e o conjunto de contexto — B-46, B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-214 | Enter envia, Shift+Enter quebra linha, e Enter durante composição IME não envia | fron | integração | — | B-46 | ⬜ |
| S-215 | prompt vazio e sem contexto não envia: o botão fica desabilitado com a razão | fron | integração | — | B-46 | ⬜ |
| S-216 | recusa do prompt por contexto chega traduzida pelo `correlationId`, e o texto e o contexto ficam | err | integração | `WORKSPACE_NOT_ALLOWED` | B-46 | ⬜ |
| S-217 | enviar com um turno em execução diz que o prompt vai para a fila | est | integração | — | B-46 | ⬜ |
| S-218 | o contexto aparece em chips acima do composer — arquivo, pasta, trecho com as linhas, imagem, texto enviado, terminal —, cada um removível por clique e por teclado | eq | integração | — | B-47 | ⬜ |
| S-219 | o conjunto mostra tamanho total e tokens estimados; acima do aviso, avisa sem bloquear; acima do teto duro, não envia e diz por quê | fron | integração | — | B-47 | ⬜ |
| S-220 | o mesmo arquivo escolhido duas vezes vira um chip; trecho de arquivo que já está inteiro no contexto não duplica | idem | integração | — | B-47 | ⬜ |
| S-221 | o conjunto persiste no rascunho da conversa, na aba de pasta, até enviar ou limpar — trocar de aba e recarregar o mantêm | est | integração | — | B-47 | ⬜ |
| S-222 | enviar limpa o conjunto; envio recusado o mantém inteiro | est | integração | — | B-47 | ⬜ |
| S-223 | arquivo apagado entre escolher e enviar → o chip fica marcado ao revalidar, e o envio é recusado com o caminho | err | integração | `FILE_NOT_FOUND` (do 07) | B-47 | ⬜ |
| S-224 | arquivo binário escolhido → o chip avisa que o Claude não o lê como texto antes do envio | err | integração | `FILE_NOT_TEXT` (do 07) | B-47 | ⬜ |
| S-225 | duas conversas da mesma aba têm conjuntos distintos | eq | integração | — | B-47 | ⬜ |

## Autocomplete do `@`, arrastar e soltar — B-48, B-49

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-226 | `@` abre o menu: arquivos e pastas por busca fuzzy na pasta, os abertos e recentes primeiro, e as entradas `@seleção` e `@terminal` | eq | integração | — | B-48 | ⬜ |
| S-227 | teclado: setas navegam, Enter/Tab escolhem, Esc fecha sem apagar o texto — tudo sem mouse | eq | integração | — | B-48 | ⬜ |
| S-228 | resposta atrasada de uma consulta velha é descartada: a mais nova vence | conc | integração | — | B-48 | ⬜ |
| S-229 | sem resultado, pasta vazia, resultado acima do teto (`truncated`, "refine a busca") | fron | integração | — | B-48 | ⬜ |
| S-230 | caminho fora da pasta (`@../x`, absoluto de fora) não é oferecido, e digitado à mão é recusado no envio | err | integração | `WORKSPACE_NOT_ALLOWED` | B-48 | ⬜ |
| S-231 | provedor ausente (o `@terminal` antes do plano 10, ou com o terminal desligado) não aparece | fron | unit | — | B-48 | ⬜ |
| S-232 | busca que falha → o menu diz e deixa digitar o caminho, validado no envio | err | integração | `NETWORK_UNREACHABLE` | B-48 | ⬜ |
| S-233 | arrastar um ou vários arquivos e pastas do explorer para o composer ou para a conversa vira chips | eq | integração | — | B-49 | ⬜ |
| S-234 | arrastar uma aba do editor vira o chip do arquivo | eq | integração | — | B-49 | ⬜ |
| S-235 | pasta enorme arrastada vira **um** chip de pasta, sem expandir; mais itens que o teto entram até o teto, com aviso | fron | integração | — | B-49 | ⬜ |
| S-236 | arrastar do desktop: imagem e texto viram anexo enviado, nada é gravado na pasta; salvar na pasta é ação separada, do plano 07 | est | integração | — | B-49 | ⬜ |
| S-237 | arquivo do desktop acima do teto ou de tipo não aceito é recusado antes do envio | err | integração | `PAYLOAD_TOO_LARGE`, `ATTACHMENT_TYPE_UNSUPPORTED` (novo) | B-49 | ⬜ |
| S-238 | soltar durante um turno põe no contexto do rascunho; enviar vai para a fila | conc | integração | — | B-49 | ⬜ |
| S-239 | soltar arquivo arrastado de outra aba de pasta (outra pasta) → recusado com o motivo | err | integração | `WORKSPACE_NOT_ALLOWED` | B-49 | ⬜ |
| S-240 | a área de soltar é anunciada, e há alternativa sem arrastar: "adicionar ao contexto" no menu de contexto do explorer e da aba do editor | eq | integração | — | B-49 | ⬜ |

## Autocomplete do `/`, comandos e skills — B-50

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-241 | `/` no começo abre o menu com comandos **e skills** da instalação, cada um com selo de origem (Claude Code · Projeto · Usuário · Sistema), nome simples, descrição e dica de argumento | eq | integração | — | B-50 | ⬜ |
| S-242 | skill de usuário e de sistema (pelo plugin local do plano 11) aparece com o selo certo, e escolhê-la insere o nome qualificado (`plugin:skill`) que o CLI roda; skill desligada no plano 11 não aparece | eq | integração | — | B-50 | ⬜ |
| S-243 | o mesmo nome em duas origens aparece duas vezes, distinguido pelo selo; entre um `builtin` e um sem marca, `/nome` roda o `builtin` qualquer que seja a ordem, e o sem marca aparece como encoberto — a menos que tenha nome qualificado, que é o que se insere | fron | unit | — | B-50 | ⬜ |
| S-244 | no rascunho, o menu vem do catálogo por versão do CLI e pasta; sem cache, uma query efêmera o preenche uma vez e fecha | est | integração | — | B-50 | ⬜ |
| S-245 | duas conversas pedindo o catálogo juntas fazem uma chamada | idem | integração | — | B-50 | ⬜ |
| S-246 | catálogo indisponível → o composer segue, e `/nome` digitado vai como texto, validado no envio | err | integração | `CLAUDE_UNAVAILABLE` | B-50 | ⬜ |
| S-247 | o menu filtra enquanto se digita (nome, alias, descrição) e descarta resposta velha | conc | integração | — | B-50 | ⬜ |
| S-248 | escolher insere `/nome ` com a dica de argumento como placeholder | eq | integração | — | B-50 | ⬜ |

## Do editor para o contexto, e a ajuda do composer — B-51, B-52

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-249 | "Adicionar seleção ao chat" no editor cria o chip do trecho na conversa ativa da mesma aba | eq | integração | — | B-51 | ⬜ |
| S-250 | aba do editor suja → o chip avisa que o Claude lê o que está salvo | est | integração | — | B-51 | ⬜ |
| S-251 | seleção vazia adiciona o arquivo inteiro; várias seleções (multicursor) viram um chip por trecho, até o teto | fron | integração | — | B-51 | ⬜ |
| S-252 | a ajuda do composer explica `@`, `/`, arrastar, o conjunto de contexto, o que o Claude lê e o que vai para a trilha, em en e pt-BR | eq | integração | — | B-52 | ⬜ |
| S-253 | só pelo teclado: abrir `@` e `/`, escolher, remover chip, enviar e interromper; axe sem violação | eq | integração | — | B-52 | ⬜ |
| S-254 | literal apresentável no composer e no menu | err | unit | — | B-52 | ⬜ |

## E2E — B-53…B-58

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-255 | prompt → markdown → tool compacta → abrir o diff no editor | eq | e2e | — | B-53 | ⬜ |
| S-256 | thinking, lista de tarefas e subagent aninhado aparecem no painel, vivos e depois de recarregar | eq | e2e | — | B-53 | ⬜ |
| S-257 | recarregar no meio do turno volta à mesma aba e conversa, sem duplicar | est | e2e | — | B-53 | ⬜ |
| S-258 | `@` escolhe um arquivo, outro vem arrastado do explorer e uma imagem do desktop: as referências chegam e o `Read` aparece em `/audit` | eq | e2e | — | B-54 | ⬜ |
| S-259 | `/` mostra a skill do projeto da fixture, com selo, e escolhê-la a dispara | eq | e2e | — | B-54 | ⬜ |
| S-260 | contexto fora da pasta é recusado com o erro traduzido, e o rascunho fica | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-54 | ⬜ |
| S-261 | permissão de Edit mostra o diff, aprova, o disco muda e a view "Alterações" lista | eq | e2e | — | B-55 | ⬜ |
| S-262 | rejeitar um trecho e um arquivo pela view "Alterações", e desfazer a rejeição | est | e2e | — | B-55 | ⬜ |
| S-263 | modo plan: aprovar o plano troca o modo e o Claude segue | est | e2e | — | B-55 | ⬜ |
| S-264 | a view de sessões mostra viva, externa ativa e histórico; `attach`, retomar e fork a partir dela | eq | e2e | — | B-56 | ⬜ |
| S-265 | duas abas de pasta: a permissão pedida na inativa vira badge e é respondida | conc | e2e | — | B-56 | ⬜ |
| S-266 | o link de sessão (D-24) colado no navegador abre a aba da pasta com a conversa no painel, ao lado do explorer e do editor; retomar pela view de sessões e a conversa removida voltam a ser provados pelo web (devolvidos pelo 06 · B-33) | eq | e2e | — | B-56 | ⬜ |
| S-267 | fila: dois prompts durante um turno, um cancelado; editar e reenviar bifurca | est | e2e | — | B-56 | ⬜ |
| S-268 | viewport de celular: painel como view única, sem scroll horizontal; axe sem violação | fron | e2e | — | B-56 | ⬜ |
| S-269 | `test:e2e:mobile` verde com o contrato novo | eq | e2e | — | B-57 | ⬜ |
| S-270 | `smoke-live`: menção real gera `Read` auditado; `supportedModels()`, `mcpServerStatus()` e `getContextUsage()` reais respondem | eq | e2e | — | B-58 | ⬜ |
| S-271 | `smoke-live`: `@caminho` no streaming input **não** é expandido em silêncio pelo CLI — a premissa da D-01 vale na versão atual | est | e2e | — | B-58 | ⬜ |
| S-272 | `smoke-live`: skills de projeto (e de usuário e sistema, quando o plano 11 existir) aparecem no `supportedCommands()` real com o nome que o menu insere; imagem real chega (se a D-02 a mantiver); thinking e subagent reais têm o formato das fixtures | eq | e2e | — | B-58 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato (B-01…B-06) | `est`, `conc` | o schema é validação pura de um frame por vez; estado e ordem entram com o comportamento, nas fases que o implementam (S-22, S-23, S-148, S-160) |
| Histórico com atividade (B-08) | `est` | a transição que importa — viva → encerrada → externa ativa — é da lista inteira e está em S-22 e S-49; o endpoint é leitura sem estado próprio |
| Markdown, código e caminhos (B-14…B-16) | `conc`, `idem` | renderizar é função do texto; a única concorrência real — o delta chegando — é S-63/S-64, e re-renderizar o mesmo texto é o mesmo resultado por construção |
| Status, turno, cópia e busca (B-23, B-24) | `err`, `conc` | tudo é derivado de eventos já validados; a falha possível (página antiga que não carrega) é a do histórico, em S-37 |
| Diffs na tela (B-27…B-29) | `idem` além de S-120 | ler uma prévia duas vezes é ler duas vezes; o que tem efeito é rejeitar, e a idempotência dele está em S-135 e S-144 |
| Modelo, modo, esforço, contexto, MCP e exportação (B-36…B-39) | `conc` | os seletores mandam comandos que já existem e cuja ordem o backend garante (ack antes do efeito); a concorrência do catálogo é S-167 e S-245 |
| Teclado, status bar, badges e ajuda do painel (B-40…B-43) | `err` além de S-193 | são apresentação de estado que já chegou validado; a recusa relevante — o teto de sessões — está em S-43 e S-153 |
| Do editor para o contexto e ajuda do composer (B-51, B-52) | `conc`, `idem`, `err` além de S-254 | acrescentar ao contexto passa pelo mesmo conjunto da B-47, cuja idempotência (S-220) e recusas (S-223, S-224) já cobrem o caminho |
| E2E (B-53…B-58) | `idem` | a repetição que importa — clique duplo, reenvio, replay, rejeitar duas vezes, o mesmo chip duas vezes — é determinística e está em S-45, S-80, S-135, S-144, S-154 e S-220; pela porta do usuário só acrescentaria minutos |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
