# F0 — Stack pública

Plano: [20 — Stack pública](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** `pnpm dev:public` sobe túnel e stack, e o web funciona de fora pela URL pública.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Origem pública e o ambiente que ela produz ✅

`scripts/lib/public-url.mjs`. Lê `RC_PUBLIC_URL` (ou `--url`) e aceita só uma **origem HTTPS**:
sem caminho, query, fragmento, porta ou credenciais — o túnel termina o TLS na 443, e HTTP fora
do loopback não é opção ([19 · B-08](../19-distribution/F1-exposure.md)). Um hostname puro ganha
`https://`.

Da origem sai o ambiente do modo público: `RC_PUBLIC_URL` e `OIDC_ISSUER` com a origem pública e
o caminho do issuer local. Sem `--public`, o ambiente local zera `RC_PUBLIC_URL` ([D-02](decisions.md)).

### B-02 — O túnel ✅

`scripts/lib/tunnel.mjs`. Monta o argv (`http [--url=<host>] <porta do web> --log=stdout
--log-format=json`), lê o log JSON e resolve quando aparece `started tunnel`, com a URL. Sai
antes, ou passa do prazo: falha com o erro que ele deu (`ERR_NGROK_nnn`). O authtoken nunca
passa pelo script ([D-05](decisions.md)).

### B-03 — O redirect no realm ✅

`scripts/lib/keycloak-admin.mjs`. Com o admin do `.env`, pelo Keycloak em `localhost`: lê o
client web e acrescenta `<origem>/*` a `redirectUris` e a `post.logout.redirect.uris`, mantendo
todo o resto do client. Já presente → nenhuma escrita ([D-03](decisions.md)).

### B-04 — O Keycloak com o hostname público ✅

`docker-compose.public.yml`: `KC_HOSTNAME` e `KC_PROXY_HEADERS` no Keycloak, e nada mais
([D-08](decisions.md)). `composeRunner` ganha os arquivos de compose; só o modo público passa o
override. Voltar ao modo local recria o container sem hostname, e o volume fica.

### B-05 — O web atrás da origem pública ✅

`web/env.ts`: com `RC_PUBLIC_URL`, a API é `<origem>/api` e o WebSocket `wss://<host>/ws`; sem
ela, nada muda. `devServer()` dá ao Vite, no modo público, o host aceito, o HMR pela 443 e o
proxy — `/api` sem o prefixo e com o `Path=/auth` do cookie reescrito, `/ws` com upgrade,
`/realms` e `/resources` para o Keycloak. `/admin` fica de fora ([D-06](decisions.md)).

### B-06 — `pnpm dev:public` 🔄

`start-local.mjs --public [--url <origem>]`: valida a origem, confere o túnel, **abre o túnel
antes do compose** (falha barata primeiro), sobe o compose com o override, registra o redirect,
sobe backend e web com o ambiente público e mostra a URL pública no quadro, com o aviso do
R-01. Ctrl+C derruba na ordem inversa, o túnel por último antes do `compose stop`.
`.env.example` e o catálogo do README entram na mesma entrega.

### B-07 — O authtoken guardado no repositório, fora do git ✅

`.secrets/ngrok-authtoken` (o diretório já é ignorado). `tunnel.mjs` lê o arquivo e monta o
ambiente **do túnel** com `NGROK_AUTHTOKEN`; o `process.env` do script, e com ele o do backend e
do web, nunca o recebe. Um `NGROK_AUTHTOKEN` exportado vence; sem arquivo, vale a config do
próprio ngrok. Arquivo legível por outros usuários → aviso com o `chmod 600` ([D-05](decisions.md)).

---

## Cenários cobertos

S-01…S-41.

---

## Critério de conclusão

```bash
pnpm verify
```
