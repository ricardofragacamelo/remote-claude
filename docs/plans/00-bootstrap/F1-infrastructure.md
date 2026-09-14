# F1 — Infraestrutura local

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-foundation.md).
**Entrega:** `pnpm dev` sobe Postgres e Keycloak e derruba limpo.

---

## Tarefas

### B-07 — `docker-compose.yml` ✅

Serviços do bootstrap — só o necessário:

| Serviço | Imagem | Papel |
|---|---|---|
| `postgres` | `postgres:18-alpine` | banco ([ADR-003](../../architecture/shared/00-decisions.md#adr-003--postgresql-18-desde-o-início-com-drizzle-orm)) |
| `keycloak` | `quay.io/keycloak/keycloak:26.2` | provedor OIDC local e de teste |

**Toda porta vem de variável com default**:

```yaml
ports: ["${RC_POSTGRES_PORT:-5432}:5432"]
```

É isso que permite ao `run-e2e-local.mjs` alocar portas aleatórias sem um segundo compose — e
rodar a suíte com a stack de desenvolvimento de pé.

Todo serviço tem `healthcheck`. Sem ele, os scripts viram `sleep` disfarçado.

### B-08 — Realm do Keycloak ✅

`infra/keycloak/realm-remote-claude.json`, importado no start (`--import-realm`).

Contém: o realm, o client público do web e o do mobile (ambos com PKCE e sem secret), o
audience da API, e os usuários de teste com senha fixa.

**Auth0 não entra em teste automatizado.** É configuração
([ADR-010](../../architecture/shared/00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial));
o que o código conhece é OIDC, e o Keycloak é um provedor OIDC como outro qualquer.

### B-09 — `scripts/lib/` ✅

Utilidades compartilhadas entre `start-local` e `run-e2e-local`. Extraídas desde o início:
duplicá-las entre dois scripts é exatamente o que o portão de
[linhas repetidas](../../architecture/shared/09-code-quality.md#linhas-repetidas) existe para pegar.

| Função | Faz |
|---|---|
| `findFreePort()` | porta livre via `net.createServer(0)` |
| `waitForHttp(url, proc, timeoutMs)` | espera health **e detecta o processo morrer antes** — sem isso o script pendura até o timeout |
| `startProc(cmd, args, opts)` | `detached` no POSIX (process group próprio), `shell` no Windows |
| `kill(proc)` | `SIGTERM` no grupo → `SIGKILL` após 5 s; `taskkill /t` no Windows |
| `resolveComposeCli(probe)` | escolhe entre o plugin `docker compose` e o binário `docker-compose` |
| `runCompose(project, env, args)` | invoca o compose com project name e env |
| `purgeStaleProjects(prefix)` | remove projetos **e volumes nomeados** órfãos de execuções anteriores |

`purgeStaleProjects` merece existir desde já: quando o processo morre de forma abrupta
(SIGKILL, terminal fechado), os containers somem mas o **volume nomeado fica órfão para
sempre**, invisível ao `compose ls`. Sem essa varredura, o disco enche ao longo das semanas.

### B-10 — `scripts/start-local.mjs` ✅

Stack de desenvolvimento, **portas fixas** (5432 · 8180 · 3000 · 5173) — cada uma movível pela
variável correspondente, e o projeto compose movível por `COMPOSE_PROJECT_NAME`, que é o que
permite à suíte subir uma cópia descartável sem derrubar a stack de quem está desenvolvendo.

```
1. compose up -d
2. aguarda Postgres e o realm do Keycloak responderem
3. backend (watch)
4. web (watch)
5. imprime o quadro de URLs
```

No encerramento (SIGINT/SIGTERM/SIGHUP): web → backend → **`compose stop`**.

`stop`, não `down`: a stack de desenvolvimento **preserva volumes**. Perder o banco local a
cada Ctrl+C é atrito diário.

Cleanup idempotente (`cleanupOnce`) — o handler pode ser disparado duas vezes.

### B-50 — `scripts/clean.mjs` ✅

Purga o que se acumula: projetos e **volumes nomeados** compose órfãos, `dist/`, `coverage/`,
relatórios do Playwright, `.dart_tool/`.

O volume órfão é o caso que justifica o script: quando uma execução morre de forma abrupta, os
containers somem mas o volume nomeado sobrevive invisível ao `compose ls`. Sem uma varredura
explícita, o disco enche ao longo das semanas.

Compartilha `purgeStaleProjects` com o `run-e2e-local.mjs`, via `scripts/lib/`.

---

## Cenários cobertos

S-53 (sobe e imprime URLs), S-54 (Ctrl+C encerra sem órfão), S-55 (preserva volumes),
S-60 (serviço que não sobe → erro claro e cleanup), S-76 (`clean` remove volume órfão invisível ao compose),
S-83 (plugin ou binário do compose), S-84 (`waitForHttp` detecta o processo morrer), S-85 (SIGTERM → SIGKILL),
S-86 (cleanup idempotente), S-87 (variável do compose ausente do `.env.example`).

---

## Critério de conclusão

```bash
pnpm dev          # sobe tudo, imprime as URLs
# Ctrl+C
docker ps -a      # nenhum container do projeto rodando
docker volume ls  # volume do projeto PRESERVADO
```
