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
| `403` | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | Autenticado, mas não pode. **Workspace fora da allowlist mora aqui.** |
| `404` | `SESSION_NOT_FOUND` | Recurso não existe, ou o requisitante não pode saber que existe |
| `409` | `SESSION_ALREADY_RUNNING` | Conflito com o estado atual |
| `410` | `PERMISSION_REQUEST_EXPIRED` | Existiu, não existe mais, e não volta |
| `413` | `PAYLOAD_TOO_LARGE` | Prompt ou upload acima do limite |
| `422` | `WORKSPACE_NOT_A_DIRECTORY` | Sintaxe válida, semântica impossível |
| `423` | `SESSION_LOCKED` | Sessão em uso exclusivo por outra connection |
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
| `WORKSPACE_NOT_A_DIRECTORY` | 422 | workspace | Caminho existe, mas é arquivo |
| `SESSION_NOT_FOUND` | 404 | session | Sessão inexistente ou inacessível |
| `SESSION_ALREADY_RUNNING` | 409 | session | Já há turno em execução — política em revisão, ver [backend/03](../backend/03-modules.md#session) |
| `SESSION_LOCKED` | 423 | session | Em uso exclusivo por outra connection |
| `SESSION_LIMIT_REACHED` | 429 | session | Máximo de sessões simultâneas |
| `PERMISSION_REQUEST_NOT_FOUND` | 404 | permission | `requestId` desconhecido |
| `PERMISSION_REQUEST_EXPIRED` | 410 | permission | Timeout — foi negado automaticamente |
| `PERMISSION_NOT_OWNED` | 403 | permission | Quem respondeu não é quem podia responder |
| `CLAUDE_UNAVAILABLE` | 502 | session | Subprocesso do CLI falhou |
| `CLAUDE_TIMEOUT` | 504 | session | Sem resposta no prazo |
| `RATE_LIMITED` | 429 | — | Limite nosso ou do plano Claude |
| `INVALID_INPUT` | 400 | — | Falha de validação; detalhe em `details[]` |
| `INTERNAL_ERROR` | 500 | — | Não previsto |

---

## Erro no WebSocket

WS não tem status code. O envelope de erro viaja no frame, e o mapeamento HTTP acima
**continua valendo** como campo:

```jsonc
{
  "v": 1, "type": "error", "id": "...", "correlationId": "<id do comando>",
  "payload": { "error": { "code": "SESSION_ALREADY_RUNNING", "httpEquivalent": 409,
                          "messageKey": "session.error.alreadyRunning", "traceId": "..." } }
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
