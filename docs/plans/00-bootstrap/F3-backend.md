# F3 — Backend esqueleto

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-infrastructure.md), [F2](F2-contracts.md).
**Entrega:** NestJS com as quatro camadas, autenticando, persistindo e emitindo evento pelo WS.

---

## A fatia vertical

Uma única operação, escolhida por atravessar **todas** as camadas sem tocar no Agent SDK:

```
comando WS  session.ping
   → gateway (adapter/inbound/ws)      valida frame contra o contrato
   → use case (application/session)    orquestra
   → domínio (domain/session)          regra: gera o Pong com timestamp do Clock
   → repositório (adapter/outbound)    grava em `sessions`
   → evento WS  session.pong           com seq atribuído no hub
```

É deliberadamente trivial no negócio e completa na estrutura. O valor está no trilho, não na
operação.

---

## Tarefas

### B-15 — Árvore de camadas ✅

`src/domain/`, `src/application/`, `src/adapter/`, `src/infrastructure/`, com domínio dentro
de cada uma — [backend/02](../../architecture/backend/02-folder-structure.md).

Barris por domínio e por camada. Aliases `@domain/*`, `@application/*`, `@adapter/*`,
`@infra/*`, `@shared/*`.

### B-16 — Config validada no boot ✅

Schema de env validado na subida. Variável ausente ou inválida **impede o processo de subir**,
com mensagem que diz qual variável e o que se esperava. Nunca default silencioso.

### B-17 — Logger pino + interceptor de I/O ✅

Schema de campos de [03](../../architecture/shared/03-logging.md), `traceId` em
`AsyncLocalStorage`. Interceptor loga `http.request`/`http.response` e `ws.inbound`/`ws.outbound`
em `debug`, com `durationMs` na saída.

**Domínio nunca recebe `traceId` como parâmetro** — ele não conhece observabilidade.

Redação configurada no logger, não a critério de quem loga.

### B-18 — Erro de domínio + exception filter ✅

Classe base com `code`, `messageKey`, `params` — erro novo sem os três não compila.
Exception filter único mapeia domínio → HTTP, conforme
[04](../../architecture/shared/04-errors-and-http.md).

`domain/` não conhece HTTP.

### B-19 — Drizzle + primeira migration ✅

Schema em `infrastructure/database/schema/`, migration versionada, aplicada no start atrás de
**advisory lock**. Tabela `sessions` mínima. Repositório devolve entity, nunca row.

### B-20 — Validação de token OIDC ✅

`adapter/outbound/identity/`: discovery em `/.well-known/openid-configuration`, cache de JWKS
com recarga em `kid` desconhecido, allowlist de `alg` (`RS256`/`ES256`).

**Nunca aceite o `alg` do token, nunca `none`** — é a vulnerabilidade clássica de JWT.
Resposta `401` não revela qual validação falhou; o log revela.

### B-21 — `GET /health` ✅

Sem autenticação. É o que os scripts usam no `waitForHttp`. Checa banco com `SELECT 1`, nunca
query de negócio.

### B-22 — Gateway WS + handshake ✅

`connection.authenticate` em até 5 s, senão `4401`. `connection.ready` com `connectionId`.
Códigos de fechamento de [05](../../architecture/shared/05-websocket-protocol.md#códigos-de-fechamento).

Frame validado contra o schema gerado. Erro de comando responde `error` e **não derruba o
socket**.

### B-23 — Fatia vertical ✅

`session.ping` → `session.pong`, com `seq` atribuído **em um único ponto** (o hub) e
monotônico por sessão.

### B-51 — `scripts/db.mjs` ✅

`migrate`, `reset` e `seed` num comando só, contra a instância do `start-local`.

`reset` é o que mais se usa no dia a dia (derruba, recria, migra, popula) e é justamente a
sequência que ninguém lembra na ordem certa.

---

## Cenários cobertos

S-09…S-13 (logging), S-14…S-19 (erros), S-20…S-25 (handshake e `seq`), S-29…S-36 (OIDC),
S-38…S-41 (camadas), S-46…S-49 (persistência), S-50…S-51 (config).

---

## Critério de conclusão

```bash
pnpm --filter backend verify     # lint, typecheck, arquitetura, unit, cobertura, integração
curl localhost:3000/health       # 200
```

E: um import de `@nestjs/*` em `src/domain/` **quebra o build**.
