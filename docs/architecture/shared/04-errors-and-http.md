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
| `201 Created` | Recurso criado — inclua `Location` |
| `202 Accepted` | Aceito para processamento assíncrono (ex.: sessão subindo) |
| `204 No Content` | Sucesso sem corpo (delete, ack) |

### Erro do cliente

| Status | Código típico | Quando |
|---|---|---|
| `400` | `INVALID_INPUT` | Payload malformado, tipo errado, JSON inválido |
| `401` | `UNAUTHENTICATED` | Sem credencial, ou token inválido/expirado |
| `403` | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | Autenticado, mas não pode. **Workspace fora da allowlist e recurso de outra pessoa moram aqui.** |
| `404` | `SESSION_NOT_FOUND` | O recurso **não existe** |
| `409` | `CONFLICT` | Conflito com o estado atual |
| `410` | `PERMISSION_REQUEST_EXPIRED` | Existiu, não existe mais, e não volta |
| `413` | `PAYLOAD_TOO_LARGE` | Prompt ou upload acima do limite |
| `422` | `WORKSPACE_NOT_A_DIRECTORY` | Sintaxe válida, semântica impossível |
| `423` | `SESSION_LOCKED` | Sessão em uso exclusivo por outra connection, **ou com um turno em execução** — é o que recusa o desfazer no meio de um turno |
| `429` | `RATE_LIMITED` | Limite nosso **ou** do plano Claude. Inclua `Retry-After`. |

`400` vs `422`: `400` é "não consegui entender"; `422` é "entendi e é impossível".
`"workspacePath": 42` é `400`. `"workspacePath": "/nao/existe"` é `422`.

### Erro do servidor

| Status | Código típico | Quando |
|---|---|---|
| `500` | `INTERNAL_ERROR` | Bug nosso. **Nunca** por causa de input do cliente. |
| `502` | `CLAUDE_UNAVAILABLE` | O Agent SDK / CLI falhou ou morreu |
| `503` | `SERVICE_UNAVAILABLE` | Em shutdown, ou dependência fora. Inclua `Retry-After`. |
| `504` | `CLAUDE_TIMEOUT` | O Claude não respondeu no prazo |

Falha vinda do Claude é **`502`/`504`, não `500`** — a distinção entre "nosso bug" e
"upstream caiu" é o que permite alertar corretamente.

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
| `SESSION_NOT_FOUND` | 404 | session | Sessão inexistente |
| `SESSION_LOCKED` | 423 | session | Em uso exclusivo por outra connection |
| `SESSION_LIMIT_REACHED` | 429 | session | Máximo de sessões simultâneas |
| `PERMISSION_REQUEST_NOT_FOUND` | 404 | permission | `requestId` desconhecido |
| `PERMISSION_REQUEST_EXPIRED` | 410 | permission | Timeout — foi negado automaticamente |
| `PERMISSION_NOT_OWNED` | 403 | permission | Quem respondeu não é quem podia responder — ou a regra que se quis revogar é de outra pessoa |
| `PERMISSION_RULE_PATTERN_INVALID` | 400 | permission | Padrão fora da gramática de regra |
| `PERMISSION_RULE_EXPIRY_TOO_LONG` | 422 | permission | Validade pedida acima do teto configurado |
| `PERMISSION_RULE_NOT_FOUND` | 404 | permission | `ruleId` que não existe |
| `CLAUDE_UNAVAILABLE` | 502 | session, transcript | Subprocesso do CLI falhou — ou a leitura do histórico pelo SDK |
| `CLAUDE_TIMEOUT` | 504 | session, transcript | Sem resposta no prazo — inclusive a leitura do histórico |
| `RATE_LIMITED` | 429 | — | Limite nosso ou do plano Claude |
| `PAYLOAD_TOO_LARGE` | 413 | — | Corpo ou frame acima do limite anunciado |
| `INVALID_INPUT` | 400 | —, transcript | Falha de validação; detalhe em `details[]`. No histórico, também o cursor cuja mensagem sumiu (`transcript.error.cursorStale`) |
| `FORBIDDEN` | 403 | — | Autenticado, e ainda assim não pode |
| `NOT_FOUND` | 404 | —, auth, transcript | Rota ou recurso inexistente, sem dono de módulo. Device de outra pessoa responde este, igual ao que não existe: dizer que um id existe já é dizer que ele existe. Conversa do histórico que o chamador não pode ler também |
| `INTERNAL_ERROR` | 500 | — | Não previsto |

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
- `Retry-After` é obrigatório em `429` e `503`. Sem ele, o cliente vai martelar.
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
