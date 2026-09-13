# Logging estruturado

Regra absoluta: **nenhum `console.log`, nenhum `print()`.** Log é JSON estruturado, nas três
pontas, com o mesmo schema de campos.

Voltar para o [índice transversal](README.md).

---

## Por quê o mesmo schema nas três pontas

Um problema típico neste sistema nasce no celular, atravessa o WebSocket, entra no NestJS,
passa pelo Agent SDK e morre num processo do CLI. Sem `traceId` comum e nomes de campo
idênticos, correlacionar isso é arqueologia manual.

| Ponta | Biblioteca | Saída |
|---|---|---|
| Backend | `pino` | JSON em stdout (`pino-pretty` só em dev) |
| Web | `pino` (build de browser) | console em dev; batch HTTP para o backend em prod |
| Mobile | `logging` (Dart oficial) + formatter JSON próprio | console em dev; batch HTTP em prod |

Ver [ADR-009](00-decisions.md#adr-009--logging-estruturado-com-paridade-entre-as-três-pontas).

---

## Schema de campos

Campos obrigatórios em **todo** log:

| Campo | Tipo | Significado |
|---|---|---|
| `level` | string | `trace` `debug` `info` `warn` `error` `fatal` |
| `time` | ISO-8601 UTC | momento do evento |
| `msg` | string | **em inglês**, minúsculo, sem ponto final, sem interpolação de dado |
| `service` | string | `backend` · `web` · `mobile` |
| `module` | string | módulo de domínio: `session`, `permission`, `workspace`… |
| `op` | string | operação: `session.start`, `permission.resolve` |
| `traceId` | string (UUID) | **propagado por toda a cadeia** |

Condicionais — inclua sempre que existirem no contexto:

| Campo | Quando |
|---|---|
| `layer` | backend: `domain` · `application` · `adapter` · `infrastructure` |
| `sessionId` | qualquer coisa ligada a uma sessão do Claude |
| `connectionId` | qualquer coisa ligada a um socket |
| `userId`, `deviceId` | quando houver identidade |
| `durationMs` | toda operação que termina |
| `err` | erro — serializado pelo serializer, nunca `String(err)` |
| `httpStatus`, `errorCode` | quando a operação virou resposta de erro |

`msg` descreve o **fato**, o dado vai em campo próprio:

```jsonc
// ✅
{ "msg": "permission request resolved", "op": "permission.resolve",
  "decision": "deny", "toolName": "Bash", "sessionId": "..." }

// ❌ — dado embutido em string é ilegível para máquina
{ "msg": "Permissão Bash negada na sessão abc123." }
```

---

## Níveis — quando usar cada um

| Nível | Uso | Exemplo |
|---|---|---|
| `fatal` | O processo vai morrer | não conseguiu abrir o socket de escuta |
| `error` | Operação falhou e alguém precisa saber | Agent SDK morreu no meio do turno |
| `warn` | Anomalia recuperada | reconexão do WS; permission request expirou por timeout |
| `info` | Fato de negócio | sessão iniciada, permissão resolvida, workspace aberto |
| `debug` | **Todo I/O** — ver abaixo | payload de entrada e saída de cada borda |
| `trace` | Passo a passo dentro de um algoritmo | raro; ligue pontualmente |

`info` é para o operador entender o que aconteceu. Se o volume de `info` inviabiliza a
leitura, o evento provavelmente era `debug`.

---

## A regra do I/O em `debug`

**Toda entrada e toda saída de cada borda é logada em `debug`**, com payload. Sem exceção.

As bordas deste sistema:

| Borda | Direção | `op` |
|---|---|---|
| HTTP | request in / response out | `http.request` / `http.response` |
| WebSocket | frame in / frame out | `ws.inbound` / `ws.outbound` |
| Banco | query / result | `db.query` |
| Agent SDK | prompt enviado / `SDKMessage` recebido | `claude.input` / `claude.output` |
| Push | envio / retorno do provedor | `push.send` |

No backend isso é responsabilidade de **interceptor/middleware**, não de cada use case.
Use case que loga o próprio I/O está fazendo o trabalho da camada de fora.

Par obrigatório: toda entrada tem a saída correspondente, com o mesmo `traceId` e com
`durationMs` na saída. Entrada sem saída é operação pendurada — e isso precisa ser visível.

---

## Redação (o que NUNCA vai para o log)

Este sistema tem acesso ao filesystem do usuário e a credenciais. A lista de redação é
configurada no logger, não deixada a critério de quem escreve o log:

- `~/.claude/.credentials.json`, qualquer `access_token`, `refresh_token`, `apiKey`
- `Authorization`, `Cookie`, `Set-Cookie`
- `password`, `secret`, `token`, `credential` (por nome de campo, em qualquer profundidade)
- Push tokens (registre só os 6 últimos caracteres)
- **Conteúdo de arquivo lido pela tool `Read`** — logue `path` e `bytes`, nunca o conteúdo
- **Corpo do prompt do usuário em `info`** — pode conter segredo; em `debug`, truncado em 2 KB

Substitua por `"[REDACTED]"`. Payload grande é truncado em **8 KB** com
`"truncated": true` — nunca omitido em silêncio.

---

## `traceId` — como propaga

1. Nasce no **cliente** (web ou mobile) quando a interação começa.
2. Viaja no header `x-trace-id` (HTTP) ou no campo `traceId` do envelope (WS).
3. O backend, se não receber, **gera** e devolve no `x-trace-id` da resposta.
4. Dentro do backend anda em `AsyncLocalStorage` — nunca passe `traceId` como parâmetro de
   função de domínio. Domínio não conhece observabilidade.
5. Todo evento WS emitido por causa de um comando carrega o `traceId` daquele comando.

Uma sessão do Claude gera muitos `traceId` (um por turno). O que amarra tudo é o `sessionId`.

---

## Regras de erro

- `catch` sem log **e** sem re-lançar é proibido. Um dos dois, no mínimo.
- Logue o erro **onde ele é tratado**, não onde é lançado. Logar nos dois lugares duplica.
- Sempre use o serializer de erro (`err`), que preserva `stack`, `cause` e campos próprios.
  `String(err)` perde a causa raiz.
- Erro esperado de negócio (ex.: workspace não permitido) é `warn`, não `error`. `error` é
  para o que ninguém previu.
