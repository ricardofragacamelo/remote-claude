# Estrutura de pastas do backend

A estrutura é **normativa**. Arquivo no lugar errado é bug de arquitetura.

Voltar para o [índice do backend](README.md).

---

## Princípio: camada primeiro, domínio dentro

```
✅ src/domain/session/…        src/application/session/…      (camada primeiro)
❌ src/modules/session/domain/…                                (módulo primeiro)
```

Cada camada da Clean Architecture é uma pasta de primeiro nível, e **dentro de cada uma** o
conteúdo é separado por domínio.

**Por quê:** a camada é a fronteira que o compilador e o lint conseguem defender. Com camada
primeiro, "nada em `domain/` importa `@nestjs/*`" é uma regra sobre um caminho — trivial de
verificar e impossível de burlar por descuido. A Dependency Rule fica visível na árvore: se
você está em `src/domain/`, sabe imediatamente o que pode importar.

**O que isso custa, e como compensamos:** uma feature de sessão toca quatro pastas distantes,
e a coesão do domínio deixa de ser garantida pela proximidade física. Ela passa a ser
garantida por lint — ver [Fronteira entre domínios](#fronteira-entre-domínios).

---

## Árvore

```
backend/
├── src/
│   ├── main.ts                          bootstrap
│   ├── app.module.ts                    composição raiz
│   │
│   ├── domain/                          ← TypeScript puro. Zero import de framework.
│   │   ├── session/
│   │   │   ├── entities/                session.entity.ts, turn.entity.ts
│   │   │   ├── value-objects/           session-id.value-object.ts
│   │   │   ├── errors/                  session-already-running.error.ts
│   │   │   ├── services/                regra que não cabe numa entidade só
│   │   │   └── index.ts                 superfície pública do domínio
│   │   ├── workspace/
│   │   ├── permission/
│   │   ├── transcript/
│   │   ├── auth/
│   │   ├── notification/
│   │   ├── audit/
│   │   └── shared/                      Clock, IdGenerator, DomainError (base)
│   │
│   ├── application/                     ← orquestração. Zero import de @nestjs/*.
│   │   ├── session/
│   │   │   ├── ports/                   claude-session.port.ts, session.repository.ts
│   │   │   ├── commands/                start-session.command.ts
│   │   │   ├── start-session.use-case.ts
│   │   │   └── index.ts
│   │   ├── workspace/
│   │   ├── permission/
│   │   └── …
│   │
│   ├── adapter/                         ← aqui o Nest pode entrar
│   │   ├── inbound/
│   │   │   ├── http/
│   │   │   │   ├── session/             session.controller.ts, dto/
│   │   │   │   └── workspace/
│   │   │   └── ws/
│   │   │       ├── session/             session.gateway-handler.ts
│   │   │       └── permission/
│   │   └── outbound/
│   │       ├── claude/                  agent-sdk.adapter.ts, sdk-message.mapper.ts
│       ├── identity/                oidc-discovery.ts, jwks-cache.ts, token-verifier.ts
│   │       ├── persistence/
│   │       │   ├── session/             drizzle-session.repository.ts, session.mapper.ts
│   │       │   ├── permission/
│   │       │   └── audit/
│   │       └── notification/            fcm.sender.ts
│   │
│   ├── infrastructure/                  ← montagem e conexão com o mundo
│   │   ├── modules/                     wiring do Nest, UM arquivo por domínio
│   │   │   ├── session.module.ts
│   │   │   ├── permission.module.ts
│   │   │   └── …
│   │   ├── config/                      schema de env, validação no boot
│   │   ├── database/
│   │   │   ├── schema/                  schema Drizzle, por domínio
│   │   │   ├── migrations/              versionadas; nunca edite uma já aplicada
│   │   │   └── database.module.ts
│   │   ├── websocket/                   gateway raiz, registry, ring buffer
│   │   └── observability/
│   │
│   └── shared/                          técnico, transversal, sem regra de negócio
│       ├── logging/                     pino, serializers, interceptor de I/O
│       ├── errors/                      exception filters, mapa domínio→HTTP
│       ├── i18n/                        catálogos (só push) e resolver de locale
│       ├── validation/                  pipes, schemas
│       └── utils/
│
└── test/
    ├── unit/                            espelha src/
    │   ├── domain/session/…
    │   └── application/session/…
    ├── integration/
    │   └── adapter/outbound/persistence/session/…
    └── support/                         builders, fakes, testcontainers, sdk-script
```

---

## O que vai em cada camada

| Camada | Contém | **Nunca** contém |
|---|---|---|
| `domain/` | entidades, VOs, erros de domínio, regras puras | `@nestjs/*`, `drizzle-orm`, `@anthropic-ai/*`, I/O |
| `application/` | use cases, portas (interfaces), comandos | `@nestjs/*`, SQL, HTTP, o Agent SDK |
| `adapter/` | controllers, gateways, repositórios, mappers, adapters de SDK | regra de negócio |
| `infrastructure/` | módulos do Nest, config, conexão, migrations | regra de negócio, `if` de domínio |
| `shared/` | logger, filters, pipes, utilitários | regra de negócio, conhecimento de domínio |

Detalhe do porquê de cada fronteira: [01-clean-architecture.md](01-clean-architecture.md).

### `domain/shared/` vs `src/shared/`

- **`domain/shared/`** — conceitos de domínio sem dono: `Clock`, `IdGenerator`, a classe base
  `DomainError`. Continua sendo TypeScript puro.
- **`src/shared/`** — preocupação **técnica** transversal: logger, exception filter, pipe de
  validação. Pode importar framework.

Na dúvida: é *conceito do negócio* (`domain/shared/`) ou é *ferramenta* (`src/shared/`)?

---

## Fronteira entre domínios

Como a camada agora vem primeiro, a coesão do domínio não é protegida pela pasta. Ela é
protegida por **regra de lint**, e isso é obrigatório — sem ela a estrutura degrada em um
monte de arquivos que importam qualquer um.

Cada domínio expõe um barril por camada:

```ts
// src/domain/session/index.ts
export { Session } from './entities/session.entity'
export type { SessionId } from './value-objects/session-id.value-object'

// src/application/session/index.ts
export { CLAUDE_SESSION_PORT } from './ports/claude-session.port'
export type { ClaudeSessionPort } from './ports/claude-session.port'
export { StartSessionUseCase } from './start-session.use-case'
```

Regras:

1. **Domínio A importa domínio B só pelo barril.** `@domain/workspace`, nunca
   `@domain/workspace/entities/workspace.entity`.
2. **Use case não chama use case de outro domínio.** Depende da **porta** do outro
   (`@application/workspace` → só `ports/`), implementada por um adapter.
3. **Sem ciclo entre domínios.** Se A precisa de B e B precisa de A, ou falta um domínio, ou
   os dois são um só.
4. Adapter pode importar o barril de qualquer domínio — é o papel dele, juntar as pontas.

O catálogo de domínios e o mapa de quem pode falar com quem estão em
[03-modules.md](03-modules.md).

---

## Sufixos de arquivo

Sufixo não é enfeite: é como se lê o papel de um arquivo sem abrir.

| Sufixo | Camada | É |
|---|---|---|
| `.entity.ts` | domain | entidade com identidade e ciclo de vida |
| `.value-object.ts` | domain | valor imutável, igualdade por conteúdo |
| `.error.ts` | domain | erro de domínio |
| `.port.ts` / `.repository.ts` | application | **interface** |
| `.use-case.ts` | application | um caso de uso |
| `.command.ts` / `.query.ts` | application | entrada de use case |
| `.controller.ts` | adapter/inbound/http | HTTP |
| `.gateway-handler.ts` | adapter/inbound/ws | WebSocket |
| `.adapter.ts` | adapter/outbound | implementação de porta externa |
| `.mapper.ts` | adapter | tradução entre representações |
| `.dto.ts` | adapter | forma de transporte |
| `.module.ts` | infrastructure | wiring do Nest |
| `.spec.ts` | `test/` | teste — **nunca** em `src/` |

Implementação de porta leva o prefixo da tecnologia: `DrizzleSessionRepository`,
`AgentSdkClaudeSessionAdapter`, `FcmNotificationSender`. Ler o nome deve dizer o que vai
quebrar quando aquela tecnologia mudar.

---

## Path aliases

```jsonc
{ "paths": {
    "@domain/*":      ["src/domain/*"],
    "@application/*": ["src/application/*"],
    "@adapter/*":     ["src/adapter/*"],
    "@infra/*":       ["src/infrastructure/*"],
    "@shared/*":      ["src/shared/*"],
    "@contracts":     ["../packages/contracts/src"]
} }
```

Import relativo (`../`) só **dentro** do mesmo domínio, na mesma camada. Atravessou camada ou
domínio, usa alias — o alias deixa a violação da Dependency Rule visível na linha do import.

---

## Onde colocar o quê

| Vou criar… | Vai em |
|---|---|
| Regra de negócio pura | `src/domain/<domínio>/` |
| Erro de domínio | `src/domain/<domínio>/errors/` **e** no [catálogo](../shared/04-errors-and-http.md) |
| Caso de uso | `src/application/<domínio>/` |
| Interface de dependência externa | `src/application/<domínio>/ports/` |
| Endpoint HTTP | `src/adapter/inbound/http/<domínio>/` |
| Handler de comando WS | `src/adapter/inbound/ws/<domínio>/` |
| Repositório | `src/adapter/outbound/persistence/<domínio>/` |
| Wiring de DI | `src/infrastructure/modules/<domínio>.module.ts` |
| Tabela / migration | `src/infrastructure/database/` |
| Interceptor, filter, pipe | `src/shared/` |
