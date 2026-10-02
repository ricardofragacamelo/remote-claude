# Plano 20 — Stack de desenvolvimento num endereço público

**Objetivo:** `pnpm dev:public` sobe a stack do `pnpm dev` atrás de um túnel HTTPS, num domínio
só, e o web — login, API e WebSocket — funciona de um navegador fora desta máquina.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # sai com código 0
```

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Rodar o túnel apontado para a porta do web não basta: o bundle grava `localhost:3000` para a API
e o WebSocket e `localhost:8180` para o issuer ([web/env.ts](../../../web/env.ts)), e `localhost`,
no navegador de quem acessa de fora, é a máquina dele. O token sai do Keycloak com `iss` local,
que o backend compara byte a byte com `OIDC_ISSUER`, e o realm só aceita redirect para
`http://localhost/*`.

A arquitetura já diz como o produto fica atrás de um endereço externo: **a exposição é da
infraestrutura**, e o produto aceita uma URL externa configurável
([19 · D-04](../19-distribution/decisions.md)). Este plano é a versão de **desenvolvimento**
disso: o túnel é o ngrok, a URL externa é `RC_PUBLIC_URL`, e tudo atravessa **um** domínio:

```
navegador ──https──► túnel ──► Vite (RC_WEB_PORT)
                                 ├─ /            → o app
                                 ├─ /api/*       → backend (sem o /api)
                                 ├─ /ws          → backend, upgrade de WebSocket
                                 └─ /realms/*, /resources/*  → Keycloak
```

Um domínio só porque o plano gratuito do túnel dá um domínio fixo, e porque o issuer precisa
ser estável: com três túneis de endereço aleatório, cada subida mudaria o issuer, o bundle e o
redirect ([D-01](decisions.md)).

---

## Escopo

### Entra

| | |
|---|---|
| Origem pública validada, e o ambiente que ela produz (issuer público, `RC_PUBLIC_URL`) | F0 |
| O túnel como processo filho do `pnpm dev:public`, com erro legível quando não abre | F0 |
| O redirect da origem pública registrado no client web do realm, idempotente | F0 |
| O Keycloak com o hostname público (override de compose usado só no modo público) | F0 |
| O dev server do Vite encaminhando API, WebSocket e Keycloak; o bundle com as URLs públicas | F0 |
| `pnpm dev:public`, `.env.example`, README e o quadro de endereços | F0 |

### Não entra

Deliberadamente fora:

- **O app mobile pela URL pública.** O `pnpm dev:mobile` continua no `adb reverse` com
  `localhost`; com a stack em modo público o issuer muda e o login do app quebra
  ([D-07](decisions.md)). Fica para quando alguém precisar aprovar pelo celular fora da rede.
- **A exposição de produção** — loopback por default, TLS no próprio processo, origem verificada
  no handshake do WebSocket. É o [plano 19, F1](../19-distribution/F1-exposure.md); nada aqui
  adianta as tasks dele.
- **Acesso local e público ao mesmo tempo, com refresh.** Em modo público o bundle aponta para a
  origem pública; abrir `localhost:5173` loga, mas o cookie de refresh (`sameSite: strict`) não
  atravessa sites. Em modo público, use a URL pública também nesta máquina.

---

## Fases

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Stack pública](F0-public-stack.md) | `pnpm dev:public` de pé, num domínio só | B-01…B-07 | 🔄 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| A origem pública é HTTPS, sem caminho, e o issuer acompanha | B-01 | [19 · D-04](../19-distribution/decisions.md) | S-01…S-09 |
| O authtoken fica fora do git e chega só ao túnel | B-07 | [D-05](decisions.md) | S-37…S-41 |
| O túnel abre, ou diz por que não abriu, antes do compose | B-02 | [protocolo · automação](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente) | S-10…S-18 |
| O login volta para a origem pública | B-03 | [08-authentication](../../architecture/shared/08-authentication.md) | S-19…S-23 |
| O Keycloak emite o issuer público só no modo público | B-04 | [backend/05](../../architecture/backend/05-persistence.md) (stack local) | S-24…S-26 |
| O web fala com tudo pela origem que o carregou | B-05 | [web/README](../../architecture/web/README.md) | S-27…S-33 |
| Um comando sobe e derruba tudo, na ordem | B-06 | [README · Comandos](../../../README.md#comandos) | S-34…S-36 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
docker-compose.public.yml          o Keycloak com KC_HOSTNAME e KC_PROXY_HEADERS
scripts/lib/public-url.mjs         origem pública, issuer, ambiente público e local
scripts/lib/tunnel.mjs             argv e log do túnel; startTunnel
scripts/lib/keycloak-admin.mjs     o redirect público no client web
scripts/start-local.mjs            --public
web/env.ts                         URLs do bundle e o dev server do modo público
web/vite.config.ts                 usa o dev server de web/env.ts
test/unit/scripts/public-url.spec.mjs
test/unit/scripts/tunnel.spec.mjs
test/unit/scripts/keycloak-admin.spec.mjs
test/integration/scripts/tunnel.spec.mjs
test/integration/scripts/keycloak-admin.spec.mjs
web/test/unit/env.spec.ts
web/test/integration/config/public-dev-server.spec.ts
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | A URL pública leva à tela de login de um backend que executa `Bash` nesta máquina; o realm de desenvolvimento tem `dev/dev` e `approver/approver` | **aberto** — mitigado: o `/admin` do Keycloak não é encaminhado, e o quadro avisa. Trocar as senhas é do operador |
| R-02 | O backend busca discovery e JWKS pelo túnel: túnel caído é login recusado | **aceito** — é o mesmo caminho que o navegador usa; o quadro mostra se o issuer público responde |
| R-03 | O túnel gratuito mostra uma página de aviso na primeira visita | **aceito** — um clique por navegador; requisição de servidor (o backend) não recebe a página |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Ao fim da fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
3. Registre cada ciclo em [progress.md](progress.md).
4. Três ciclos sem progresso no mesmo portão → **pare e escale**.
