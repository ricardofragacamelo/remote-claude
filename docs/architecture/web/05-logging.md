# Logging no browser

Mesmo schema de campos do backend e do mobile — é o que permite seguir um problema do clique
até o subprocesso do Claude. Leia [logging](../shared/03-logging.md) primeiro; aqui está só o
que é específico do browser.

Voltar para o [índice do web](README.md).

---

## `console.log` é proibido

Existe regra de lint (`no-console`) e ela **quebra o build**. O motivo não é estética: `console`
não tem nível, não tem estrutura, não tem correlação, e não pode ser enviado para lugar nenhum.

```ts
import { logger } from '@/shared/logging/logger'
logger.debug({ op: 'http.request', method, url, traceId }, 'http request')
```

---

## Configuração

`pino` no build de browser, em `src/shared/logging/logger.ts`.

| Ambiente | Nível | Saída |
|---|---|---|
| Desenvolvimento | `debug` | console, formatado e legível |
| Produção | `info` | buffer em memória → envio em lote para o backend |
| Produção, com debug ligado | `debug` | idem, com amostragem |

O usuário consegue ligar `debug` em produção por uma flag na UI — reproduzir um bug de
permissão intermitente exige isso, e obrigar a publicar um build novo para investigar é
inaceitável.

### Envio em lote

- Acumula em memória, envia a cada **10 s** ou **50 registros**, o que vier primeiro.
- `error` e `fatal` vão na hora, sem esperar o lote.
- Usa `navigator.sendBeacon` no `pagehide` — senão o último lote, justamente o do crash, se perde.
- Falha de envio **nunca** quebra a aplicação: descarta e segue.
- O envio de log **nunca** é logado (laço infinito).

---

## Campos

Os obrigatórios de [03-logging.md](../shared/03-logging.md), com `service: "web"`, mais:

| Campo | Conteúdo |
|---|---|
| `sessionId` | sessão do Claude, quando houver |
| `connectionId` | connection do WS |
| `route` | rota atual |
| `userId` | `sub` do token, nunca o e-mail |
| `appVersion` | versão do build |

`msg` em **inglês**, minúsculo, sem dado interpolado. Ver
[nomenclatura](../shared/01-language-and-naming.md).

---

## O que logar em `debug`

Toda borda de I/O, entrada **e** saída:

| `op` | Onde | Campos |
|---|---|---|
| `http.request` / `http.response` | interceptor do `api.ts` | método, url, status, `durationMs` |
| `ws.inbound` / `ws.outbound` | `wsClient` | `kind`, `type`, `seq`, payload truncado |
| `ws.connection` | `wsClient` | estado, `closeCode`, tentativa de reconexão |
| `auth.token` | fluxo OIDC | `sub`, `exp` — **nunca o token** |

Isso é responsabilidade do `api.ts` e do `wsClient`, **não** de cada service. Service que loga
o próprio I/O está duplicando o trabalho da camada de transporte.

---

## O que logar em outros níveis

- `info` — fato de negócio do ponto de vista do usuário: sessão aberta, permissão respondida,
  workspace trocado.
- `warn` — anomalia recuperada: reconexão, `gap: true` no replay, retry de requisição.
- `error` — erro não tratado, falha de render (error boundary), falha de mutação.

**Não** logue render, mudança de estado ou navegação em `info`. Isso é `debug`, e na maioria
dos casos é ruído até lá.

---

## Redação

Vale a lista de [03-logging.md](../shared/03-logging.md#redação-o-que-nunca-vai-para-o-log).
Específico do browser:

- **Nunca** logue access token, refresh token ou `code` do OIDC. Nem truncado.
- Conteúdo de prompt só em `debug`, truncado em 2 KB — pode conter segredo colado pelo usuário.
- Nunca logue o `input` completo de uma tool em `info`: pode conter caminho e conteúdo sensível.
  Em `debug`, truncado.
- Payload acima de 8 KB é truncado com `truncated: true`, nunca omitido em silêncio.

---

## `traceId`

Nasce **aqui**, no clique do usuário. Vai no header `x-trace-id` (HTTP) e no campo `traceId`
(WS), e é o que amarra a ação ao que aconteceu no backend e no Claude.

Guarde o `traceId` da última operação com erro e **mostre na tela de erro** — é o que
transforma "deu erro" num relato investigável.

---

## Error boundary

Todo erro não capturado vira `logger.error` com o componente e o `traceId`, e renderiza
`<ErrorState>` traduzido. Tela branca é falha de observabilidade, não só de UX.
