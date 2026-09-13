# F4 — Web esqueleto

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-contracts.md), [F3](F3-backend.md).
**Entrega:** a cadeia `Component → Hook → Service → api.ts` de pé, autenticando e consumindo o WS.

---

## Tarefas

### B-24 — Vite + React + TS

Estrutura por feature de [web/02](../../architecture/web/02-folder-structure.md). Features do
bootstrap: `auth` e `session`. Barril por feature; `shared/` nunca importa `features/`.

### B-25 — Tailwind + shadcn/ui

`shared/components/ui/` é território gerado. Tokens **semânticos** (`bg-destructive`), nunca
cor literal — cor literal quebra o tema escuro, e tema escuro não é opcional numa ferramenta
de desenvolvedor.

Claro e escuro definidos pelos mesmos nomes de variável. Nenhuma cor definida só em `.dark`.

### B-26 — `api.ts` e `wsClient`

**Um** cliente HTTP e **um** cliente WS na aplicação inteira.

`api.ts`: `Authorization`, `x-trace-id`, `Accept-Language`, retry, timeout, logging de I/O, e
normalização de erro do backend para `AppError` tipado.

`wsClient`: handshake, **reconexão com backoff exponencial + jitter (1 s → 30 s)**, replay com
`resumeFromSeq`, validação de frame contra o contrato, `connection.reauthenticate`.

As três regras do stream, que valem também no mobile:

1. descartar evento com `seq <= lastSeq` — replay reentrega;
2. `gap: true` → limpar o estado e recarregar por HTTP, **nunca** costurar buraco;
3. `message.delta` acumula por `messageId`.

### B-27 — i18n `en` / `pt-BR`

`react-i18next`. Chave em inglês, três segmentos no máximo. Interpolação **nomeada**, nunca
posicional. Nenhum literal apresentável no JSX — regra de lint reprova.

### B-28 — Logger pino no browser

Mesmo schema de campos do backend, `service: "web"`. `traceId` **nasce aqui**, no clique.
Envio em lote, `sendBeacon` no `pagehide` — senão o último lote, o do crash, se perde.

Falha de envio nunca quebra a aplicação. O envio de log nunca é logado.

### B-29 — Login OIDC com PKCE

`state` validado **sempre**. Access token **em memória**; refresh em cookie
`httpOnly`+`Secure`+`SameSite`. `localStorage` é proibido para token — XSS vira sessão
permanente.

Renovação **proativa** (~80 % da vida) e **deduplicada**: N requisições disparando refresh
fazem uma chamada. Sem isso o provedor invalida a família de tokens por reuso.

### B-30 — Tela da fatia vertical

Dispara `session.ping`, renderiza o `session.pong`. Trata os **quatro** estados: loading
(skeleton), erro (`ErrorState` traduzido com `traceId` visível), vazio, conteúdo.

Nenhum componente importa service ou `api.ts` — só hook.

---

## Cenários cobertos

S-05…S-08 (i18n), S-26…S-28 (stream e replay), S-37 (login PKCE), S-42…S-45 (cadeia e estados
de tela).

---

## Critério de conclusão

```bash
pnpm --filter web verify
```

E: um componente importando `@/shared/api` **quebra o build**.
