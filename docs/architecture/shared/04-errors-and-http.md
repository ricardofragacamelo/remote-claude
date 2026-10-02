# Erros e códigos HTTP

Três regras curtas:

1. **Nunca** devolva `200` com erro no corpo.
2. **Nunca** devolva `500` para erro que o cliente causou.
3. Todo erro tem **código**, **chave de tradução** e **status** — os três.

Voltar para o [índice transversal](README.md).

---

## O envelope de erro

Resposta HTTP de erro e evento WS de erro usam **o mesmo formato**:

```jsonc
{
  "error": {
    "code": "WORKSPACE_NOT_ALLOWED",
    "messageKey": "session.error.workspaceNotAllowed",
    "params": { "path": "/etc" },
    "traceId": "9f2c1e5a-...",
    "details": [                        // opcional — só validação
      { "field": "workspacePath", "rule": "mustBeAbsolute" }
    ]
  }
}
```

- `code` — estável, para **lógica** do cliente. Mudar um `code` é breaking change.
- `messageKey` — para **exibição**. Quem traduz é o cliente. Ver [02-i18n.md](02-i18n.md).
- `traceId` — permite ao usuário reportar o problema e alguém achá-lo no log.
- Nunca inclua `stack`, caminho absoluto de arquivo do servidor ou mensagem do banco.

---

## Como o erro atravessa as camadas

```
domain/       lança erro de domínio puro        WorkspaceNotAllowedError
   ↓          (sem HTTP, sem Nest, sem i18n)
application/  deixa subir, ou traduz para outro erro de domínio
   ↓
adapter/      mapeia domínio → status HTTP / código de erro WS
```

**A camada de domínio não conhece HTTP.** Um `WorkspaceNotAllowedError` não sabe que vira
`403`. Quem sabe é o exception filter no adapter — ponto único de mapeamento. Ver
[backend/01-clean-architecture.md](../backend/01-clean-architecture.md).

Todo erro de domínio herda de uma base que carrega `code`, `messageKey` e `params`. Erro
novo sem esses três campos não compila.

---

## Tabela de status HTTP

### Sucesso

| Status | Quando |
|---|---|
| `200 OK` | Leitura, ou mutação que devolve o recurso |
| `201 Created` | Recurso criado — inclua `Location` (e o `ETag`, quando é um arquivo) |
| `202 Accepted` | Aceito para processamento assíncrono (ex.: sessão subindo) |
| `204 No Content` | Sucesso sem corpo (delete, ack) |
| `206 Partial Content` | `GET` com `Range` de um intervalo — inclua `Content-Range` (a paginação do `raw`, plano 07 · F7) |
| `207 Multi-Status` | Lote processado com **resultado por item**, quando ao menos um item falhou: o corpo diz o de cada um, e o que falhou leva o envelope de erro dele (`code`, `messageKey`, `params`). Lote em que todos passaram é `200`; lote recusado inteiro antes de começar tem o status do motivo — nunca `207` ([07 · F7](../../plans/07-explorer-and-editor/F7-previews-and-transfer.md), o upload) |
| `304 Not Modified` | `GET` com `If-None-Match` que nomeia a versão atual — sem corpo, com o `ETag` |

### Erro do cliente

| Status | Código típico | Quando |
|---|---|---|
| `400` | `INVALID_INPUT` | Payload malformado, tipo errado, JSON inválido |
| `401` | `UNAUTHENTICATED` | Sem credencial, ou token inválido/expirado |
| `403` | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | Autenticado, mas não pode. **Workspace fora da allowlist e recurso de outra pessoa moram aqui.** |
| `404` | `SESSION_NOT_FOUND`, `TOOL_USE_NOT_FOUND`, `QUEUED_PROMPT_NOT_FOUND`, `ATTACHMENT_NOT_FOUND` | O recurso **não existe** |
| `409` | `CONFLICT`, `OPEN_FOLDERS_LIMIT_REACHED`, `FILE_EXISTS`, `DIRECTORY_NOT_EMPTY`, `SESSION_CHANGE_STALE`, `SESSION_FORK_REJECTED` | Conflito com o estado atual — inclusive o teto de abas de pasta, que fechar uma resolve, o destino ocupado de um criar/mover/copiar (com o `ETag` do que está lá), a pasta não vazia que pede a contagem, o trecho calculado sobre um disco que mudou e o ponto de fork que o CLI recusou |
| `410` | `PERMISSION_REQUEST_EXPIRED` | Existiu, não existe mais, e não volta |
| `412` | `FILE_CHANGED` | A versão que o cliente nomeou em `If-Match` não é a do disco — **inclusive o arquivo apagado**, que nunca é recriado em silêncio. Leva o `ETag` atual no cabeçalho e em `params.currentEtag` ([07 · D-03](../../plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)) |
| `413` | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` | Prompt, upload ou corpo acima do limite — e o arquivo acima do teto de edição (`params.size`, `params.limit`, `params.measure`) |
| `415` | `FILE_NOT_TEXT`, `ATTACHMENT_TYPE_UNSUPPORTED` | O arquivo não é texto que o servidor decodifique: binário, ou bytes que não são UTF-8 sem encoding pedido (`params.reason`) — nunca um palpite. E o anexo do prompt de tipo que ele não leva |
| `416` | `RANGE_NOT_SATISFIABLE` | `Range` que começa depois do fim do arquivo — inclua `Content-Range: bytes */<tamanho>` |
| `422` | `WORKSPACE_NOT_A_DIRECTORY`, `WORKSPACE_DIRECTORY_UNREADABLE`, `FILE_NOT_A_FILE`, `FILE_OPERATION_INVALID`, `FILE_NOT_ENCODABLE`, `FILE_ACCESS_DENIED`, `DIFF_NOT_APPLICABLE` | Sintaxe válida, semântica impossível — inclusive a pasta liberada, ou o arquivo dela, que o processo do backend não pode ler ou escrever: a autorização passou, é o disco que recusa; e o diff pedido de uma tool que não escreve arquivo |
| `423` | `SESSION_LOCKED` | Sessão em uso exclusivo por outra connection, **ou com um turno em execução** — é o que recusa o desfazer no meio de um turno |
| `428` | `PRECONDITION_REQUIRED` | Falta uma condição antes de tocar o disco: o `PUT` sem `If-Match` (ou com `*`, que seria "qualquer versão"), o arquivo que muda a permissão sem a confirmação, o apagar recursivo sem a contagem, o apagar que pediu o histórico e não coube nele (`params.reason`) |
| `429` | `RATE_LIMITED`, `WATCH_LIMIT_REACHED` | Limite nosso **ou** do plano Claude — ou o teto de pastas assistidas por connection. Inclua `Retry-After`. |

`400` vs `422`: `400` é "não consegui entender"; `422` é "entendi e é impossível".
`"workspacePath": 42` é `400`. `"workspacePath": "/nao/existe"` é `422`.

### Erro do servidor

| Status | Código típico | Quando |
|---|---|---|
| `500` | `INTERNAL_ERROR` | Bug nosso. **Nunca** por causa de input do cliente. |
| `502` | `CLAUDE_UNAVAILABLE` | O Agent SDK / CLI falhou ou morreu |
| `503` | `SERVICE_UNAVAILABLE`, `WATCH_UNAVAILABLE` | Em shutdown, ou dependência fora — inclusive a trilha que não grava a escrita humana, e o sistema que recusou mais um watch. Inclua `Retry-After`. |
| `504` | `CLAUDE_TIMEOUT` | O Claude não respondeu no prazo |
| `507` | `STORAGE_FULL` | O disco (ou a cota) encheu ao escrever: o original fica intacto e nenhum temporário fica para trás |

Falha vinda do Claude é **`502`/`504`, não `500`** — a distinção entre "nosso bug" e
"upstream caiu" é o que permite alertar corretamente.

**Trilha indisponível: `503` na escrita humana, `500` no desfazer — de propósito.** A escrita do
humano pelo `files` é HTTP, e um banco fora é uma dependência fora, que é o que `503` diz: o cliente
espera o `Retry-After` e repete, e **nada** foi ao disco. O desfazer de uma sessão
(`AuditUnavailableError`) responde pelo WebSocket, onde o precedente do plano 04 é `INTERNAL_ERROR`.
Não "corrija" um pelo outro ([07 · D-02](../../plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha)).

---

## Catálogo de erros de domínio

Fonte da verdade. Erro novo entra aqui **antes** de existir no código.

| `code` | HTTP | Módulo | Significa |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | auth | Sem credencial válida |
| `TOKEN_EXPIRED` | 401 | auth | Token expirou — cliente deve renovar |
| `DEVICE_NOT_REGISTERED` | 403 | auth | Aparelho não aprovado |
| `DEVICE_REVOKED` | 403 | auth | Aparelho revogado |
| `INSUFFICIENT_SCOPE` | 403 | auth | Autenticado, sem o escopo necessário |
| `WORKSPACE_NOT_ALLOWED` | 403 | workspace | Caminho fora da allowlist |
| `WORKSPACE_NOT_FOUND` | 404 | workspace | Caminho não existe |
| `FORBIDDEN` | 403 | workspace, session, auth, audit | Existe, e é de outra pessoa — ou o pedido parte de quem não pode fazê-lo (aparelho aprovando aparelho). Na trilha: filtrar pela sessão de outra pessoa |
| `WORKSPACE_NOT_A_DIRECTORY` | 422 | workspace | Caminho existe, mas é arquivo |
| `WORKSPACE_DIRECTORY_UNREADABLE` | 422 | workspace | O diretório existe, está liberado, e o **processo do backend** não tem permissão de leitura (`EACCES`/`EPERM`) — `workspace.error.directoryUnreadable`, `params.path`. Não é `403`: a autorização do usuário passou; é o sistema de arquivos que torna o pedido impossível ([06 · B-03](../../plans/06-workbench/F0-contract.md#b-03--backend03-04-errors-and-http-e-o-catálogo-listar-pasta-passa-a-existir-)) |
| `OPEN_FOLDERS_LIMIT_REACHED` | 409 | workspace | Abrir mais uma pasta com o teto de abas já atingido — `workspace.error.openFoldersLimitReached`, `params.limit`. Conflito com o estado atual, não validação ([06 · D-11](../../plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)) |
| `CONFLICT` | 409 | workspace, session | Reordenar as abas com um conjunto diferente do aberto — `workspace.error.openFoldersOrderConflict`: outra janela abriu ou fechou uma aba no meio; reler as abertas e reordenar essas resolve. Na sessão, cancelar o prompt da fila que já virou turno (`session.error.queuedPromptStarted`, `params.queueId`) — pará-lo agora é interromper |
| `SESSION_NOT_FOUND` | 404 | session | Sessão inexistente |
| `SESSION_LOCKED` | 423 | session | Em uso exclusivo, ou ocupada: um turno em execução, outro desfazer da mesma sessão em curso, ou um prompt que chega enquanto o desfazer devolve os arquivos (`session.error.locked`, `params.reason`) |
| `SESSION_LIMIT_REACHED` | 429 | session | Máximo de sessões simultâneas — derivado da RAM da máquina; `params.limit`, `params.retryAfterSeconds` |
| `SESSION_CHANGE_STALE` | 409 | session | O trecho a rejeitar foi calculado sobre um disco que mudou — ou o arquivo deixou de ser o que a sessão deixou, ou mudou depois da rejeição que se quis desfazer — `session.error.changeStale`, `params.path`; recarregar os trechos e escolher de novo ([08 · D-08](../../plans/08-claude-panel/decisions.md#d-08--rejeitar-por-arquivo-e-por-trecho)) |
| `SESSION_FORK_REJECTED` | 409 | session | O CLI recusou o ponto de fork do editar e reenviar (`resumeDropsTurn`) — `session.error.forkRejected`; a tela oferece a retomada simples ([08 · D-19](../../plans/08-claude-panel/decisions.md#d-19--editar-e-reenviar)) |
| `QUEUED_PROMPT_NOT_FOUND` | 404 | session | Cancelar prompt que a fila não tem — `session.error.queuedPromptNotFound`, `params.queueId`. O que **já começou** é `CONFLICT` (`session.error.queuedPromptStarted`) ([08 · D-14](../../plans/08-claude-panel/decisions.md#d-14--a-fila-de-prompts)) |
| `TOOL_USE_NOT_FOUND` | 404 | session | `toolUseId` que a sessão não tem — `session.error.toolUseNotFound`, `params.toolUseId` |
| `DIFF_NOT_APPLICABLE` | 422 | session | Diff pedido de tool que não escreve arquivo (`Bash`, `Read`) — `session.error.diffNotApplicable`, `params.toolName` |
| `ATTACHMENT_NOT_FOUND` | 404 | session | `attachmentId` desconhecido, de outra sessão ou expirado — os três respondem igual (`session.error.attachmentNotFound`, `params.attachmentId`) |
| `ATTACHMENT_TYPE_UNSUPPORTED` | 415 | session | Anexo de tipo que o prompt não leva: imagem que o modelo não lê, binário (`session.error.attachmentTypeUnsupported`, `params.mediaType`). O tamanho acima do teto é `PAYLOAD_TOO_LARGE` ([08 · D-02](../../plans/08-claude-panel/decisions.md#d-02--imagem-no-prompt)) |
| `PERMISSION_REQUEST_NOT_FOUND` | 404 | permission | `requestId` desconhecido |
| `PERMISSION_REQUEST_EXPIRED` | 410 | permission | Timeout — foi negado automaticamente |
| `PERMISSION_NOT_OWNED` | 403 | permission | Quem respondeu não é quem podia responder — ou a regra que se quis revogar é de outra pessoa |
| `PERMISSION_RULE_PATTERN_INVALID` | 400 | permission | Padrão fora da gramática de regra |
| `PERMISSION_RULE_EXPIRY_TOO_LONG` | 422 | permission | Validade pedida acima do teto configurado |
| `PERMISSION_RULE_NOT_FOUND` | 404 | permission | `ruleId` que não existe |
| `FILE_NOT_FOUND` | 404 | files | Nada naquele caminho dentro da pasta aberta (`files.error.notFound`, `params.path` relativo). A **pasta** sumida é `WORKSPACE_NOT_FOUND` |
| `FILE_EXISTS` | 409 | files | Criar, mover ou copiar para cima de algo — nada é sobrescrito (`files.error.exists`, `params.currentEtag` do arquivo que está lá, que é como a web reconhece o próprio reenvio) |
| `DIRECTORY_NOT_EMPTY` | 409 | files | Apagar pasta com conteúdo sem a contagem (`files.error.directoryNotEmpty`, `params.entryCount`, `params.entryCountCapped`); no apagar com `keepInHistory`, também a pasta que não coube no histórico — com `params.notKept`: `tooMany`·`tooLarge`·`unavailable` |
| `FILE_CHANGED` | 412 | files | `If-Match` que não casa — inclusive o arquivo apagado; e o apagar recursivo cuja contagem mudou (`files.error.changed`, `params.currentEtag`, `null` quando nada está lá) |
| `PRECONDITION_REQUIRED` | 428 | files | `PUT` sem `If-Match` ou com `*`; arquivo sensível sem `confirmSensitive`; apagar recursivo sem `expectedEntries`; upload `replace` sem o `If-Match` do existente; apagar com `keepInHistory` de arquivo que não coube no histórico (`files.error.preconditionRequired`, `params.reason`: `ifMatchMissing`·`sensitiveFile`·`expectedEntriesMissing`·`notKept`, e com `notKept` o `params.why`: `tooLarge`·`unavailable`) |
| `FILE_TOO_LARGE` | 413 | files | Acima do teto (`files.error.tooLarge`, `params.size`, `params.limit`, `params.measure`: `bytes`·`entries`) |
| `FILE_NOT_TEXT` | 415 | files | Binário ou encoding que não se decodifica (`files.error.notText`, `params.reason`: `binary`·`encoding`) |
| `FILE_NOT_A_FILE` | 422 | files | Conteúdo pedido de diretório, FIFO, socket ou device (`files.error.notAFile`) |
| `FILE_OPERATION_INVALID` | 422 | files | Mover/copiar para dentro de si, operar na própria pasta aberta, `EXDEV`, laço de symlink (`files.error.operationInvalid`, `params.reason`: `intoItself`·`openFolder`·`crossDevice`·`symlinkLoop`) |
| `FILE_NOT_ENCODABLE` | 422 | files | O conteúdo não cabe no encoding de destino — nunca gravado com `?` (`files.error.notEncodable`, `params.encoding`) |
| `FILE_ACCESS_DENIED` | 422 | files | O sistema operacional recusou ler ou escrever o arquivo (`EACCES`, `EPERM`, `EROFS`) — `files.error.accessDenied`, `params.reason`: `permission`·`readOnlyFileSystem`. Não é `403`, pelo mesmo motivo de `WORKSPACE_DIRECTORY_UNREADABLE` (decisão do usuário de 2026-09-30, que corrigiu S-33, S-58 e S-77 do plano 07) |
| `STORAGE_FULL` | 507 | files | Disco cheio (`ENOSPC`, `EDQUOT`) — `files.error.storageFull` |
| `WATCH_LIMIT_REACHED` | 429 | files | Teto de assinaturas de pasta por connection (`files.error.watchLimitReached`, `params.limit`) |
| `WATCH_UNAVAILABLE` | 503 | files | O sistema recusou mais watches (`files.error.watchUnavailable`, `params.retryAfterSeconds`) |
| `RANGE_NOT_SATISFIABLE` | 416 | files | `Range` que começa depois do fim do arquivo (`files.error.rangeNotSatisfiable`, `params.size`) — com `Content-Range: bytes */<tamanho>` ([07 · B-47](../../plans/07-explorer-and-editor/F7-previews-and-transfer.md#b-47--o-contrato-de-prévia-e-transferência-)) |
| `HISTORY_ENTRY_NOT_FOUND` | 404 | files | Entrada do histórico local que não existe, que a purga levou, ou de pasta que o chamador não alcança **agora** — as três respondem igual, porque dizer qual seria dizer que ela existe (`files.error.historyEntryNotFound`, `params.entryId`) ([07 · B-55](../../plans/07-explorer-and-editor/F8-local-history.md#b-55--o-contrato-do-histórico-e-a-adr-)) |
| `CLAUDE_UNAVAILABLE` | 502 | session, transcript | Subprocesso do CLI falhou — ou a leitura do histórico pelo SDK, ou a lista de slash commands |
| `CLAUDE_TIMEOUT` | 504 | session, transcript | Sem resposta no prazo — inclusive a leitura do histórico e a lista de slash commands (`session.error.claudeTimeout`) |
| `RATE_LIMITED` | 429 | — | Limite nosso ou do plano Claude. `params: { scope, limit, retryAfterSeconds }` — no WebSocket, `scope` é `frames` ou `attachedSessions` |
| `PAYLOAD_TOO_LARGE` | 413 | — | Corpo ou frame acima do limite anunciado; o anexo do prompt acima do teto dele é `session.error.attachmentTooLarge` (`params.limit`) |
| `SERVICE_UNAVAILABLE` | 503 | —, files | Em shutdown, ou dependência fora. No `files`, a trilha que não gravou a escrita humana — e então nada foi ao disco (`files.error.trailUnavailable`, `params.retryAfterSeconds`) |
| `INVALID_INPUT` | 400 | —, transcript, session, files | Falha de validação; detalhe em `details[]`. No histórico, também o cursor cuja mensagem sumiu (`transcript.error.cursorStale`). Na sessão, o slash command que a instalação não tem (`session.error.unknownCommand`), o ponto de desfazer que não é da sessão (`session.error.rewindTargetUnknown`), o arquivo a rejeitar que o ponto não alcança (`session.error.rewindPathUnknown`, `params.path`), o ponto de fork que não é um prompt da conversa (`session.error.forkPointUnknown`, `params.messageId`) o esforço que o modelo não aceita (`session.error.effortUnsupported`, `params.level`, `params.model`) e a referência do contexto do prompt que nomeia uma pasta como arquivo ou o contrário (`session.error.referenceKind`, `params.path`, `params.kind` — [08 · B-44](../../plans/08-claude-panel/F5-composer-and-context.md#b-44--backend-referências-de-arquivo-pasta-e-trecho-e-texto-de-provedor-)). No centro de notificações, a chave fora do catálogo ou os parâmetros que não são os dela (`notification.error.rejected`, com cada problema em `details[]` — [06 · D-19](../../plans/06-workbench/decisions.md#d-19--o-catálogo-de-chaves-das-notificações)). No `files`, o caminho que não é relativo, tem NUL ou `\\`, não nomeia uma entrada ou tem segmento acima de 255 bytes (`files.error.invalidPath`, todos os motivos em `details[]`; no upload, também segmento vazio, `..`, nome reservado do Windows e dois itens no mesmo nome), o encoding desconhecido (`files.error.unknownEncoding`), e a parte de um upload que não trouxe os bytes que o manifesto declarou (`files.error.uploadSizeMismatch`, `params.declared`, `params.received` — no resultado daquele item, `207`) |
| `FORBIDDEN` | 403 | — | Autenticado, e ainda assim não pode |
| `NOT_FOUND` | 404 | —, auth, transcript, session | Rota ou recurso inexistente, sem dono de módulo. Device de outra pessoa responde este, igual ao que não existe: dizer que um id existe já é dizer que ele existe. Conversa do histórico que o chamador não pode ler também. Na sessão, o arquivo que ela não alterou, pedido às alterações, e a rejeição que não há para desfazer (`session.error.changeNotFound`, `params.path`) |
| `INTERNAL_ERROR` | 500 | —, session | Não previsto. No desfazer, o caminho que não pôde ser restaurado (`session.error.rewindIncomplete`, depois do `session.rewound` que o lista) |

**Códigos que só o cliente gera.** Não vêm do backend, e por isso não têm status: `NETWORK_UNREACHABLE`
(`common.error.offline`) e `RESUME_TIMEOUT` (`session.error.resumeTimeout`) — a retomada que ninguém
respondeu no prazo do cliente ([plano 05 · B-26](../../plans/05-hardening-operations/F0-limits.md)).

**`SESSION_ALREADY_RUNNING` não existe mais.** Um segundo prompt durante um turno é
**enfileirado**, não rejeitado — [R-02, decidido](../../plans/00-bootstrap/progress.md#decisões-tomadas-durante-a-execução).
Ver [backend/03](../backend/03-modules.md#session).

---

## Erro no WebSocket

WS não tem status code. O envelope de erro viaja no frame, e o mapeamento HTTP acima
**continua valendo** como campo:

```jsonc
{
  "v": 1, "type": "error", "id": "...", "correlationId": "<id do comando>",
  "payload": { "error": { "code": "SESSION_NOT_FOUND", "httpEquivalent": 404,
                          "messageKey": "session.error.notFound", "traceId": "..." } }
}
```

**Erro de comando não derruba o socket.** Só fecha a conexão o que a torna inútil:
falha de autenticação no handshake (`4401`) ou violação de protocolo (`4400`). Ver
[05-websocket-protocol.md](05-websocket-protocol.md).

---

## Regras de tratamento

- Erro esperado de negócio → `warn`. Inesperado → `error`. Ver [03-logging.md](03-logging.md).
- Nunca capture para devolver `null` silencioso. Ou trata, ou propaga.
- Timeout é erro: toda chamada externa (Agent SDK, banco, push) tem prazo explícito.
- Erro de validação lista **todos** os campos inválidos de uma vez, em `details[]` — não
  devolva o primeiro e pare.
- `Retry-After` é obrigatório em `429` e `503`. Sem ele, o cliente vai martelar. O erro que sabe
  quanto esperar diz em `params.retryAfterSeconds` (`SESSION_LIMIT_REACHED`: 30 s; `RATE_LIMITED`:
  o que o balde pedir); o filtro põe esse valor no cabeçalho, e 1 s quando o erro não disse. No
  WebSocket, que não tem cabeçalho, o cliente lê `params.retryAfterSeconds` do frame.
- Erro do body parser sobre a **requisição** — corpo acima do limite, JSON inválido — vira o `4xx`
  que ele traz (`413` `PAYLOAD_TOO_LARGE`, `400` `INVALID_INPUT`), nunca `500`.
- **`401` vs `403` não é detalhe.** `401` significa "renove a credencial e repita"; `403`
  significa "não adianta insistir". Cliente que trata os dois igual entra em laço de
  renovação. Resposta de `401` nunca revela **qual** validação falhou — isso vai no log.
- **`403` vs `404` também não.** `403` é falha de **autorização**: o requisitante é quem diz ser,
  e ainda assim não pode. `404` é registro que **não está lá**. São perguntas diferentes e têm
  respostas diferentes — inclusive quando o recurso existe e é de outra pessoa, que é `403`.

  Uma versão anterior deste documento mandava responder `404` nesse último caso, para não
  confirmar que um id existe. Isso foi revertido em 2026-09-19
  ([01 · D-17](../../plans/01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é)):
  é semântica própria, e semântica própria deixa o cliente sem como distinguir "sumiu" de "não é
  seu" — que é exatamente a distinção de que ele precisa para decidir se insiste.
