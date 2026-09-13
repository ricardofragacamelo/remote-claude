# Clean Architecture sobre NestJS

Voltar para o [índice do backend](README.md).

---

## O problema que este documento resolve

NestJS traz as próprias camadas — `Module`, `Controller`, `Provider`. A Clean Architecture
traz `domain`, `application`, `adapter`, `infrastructure`. **Elas competem.** Deixadas soltas,
o resultado típico é entidade com decorator de ORM, use case injetando `HttpService`, e regra
de negócio dentro de controller.

A regra que resolve o conflito é uma só:

> **Decorator do NestJS só existe em `adapter/` e `infrastructure/`.
> `domain/` e `application/` são TypeScript puro, sem um único import de `@nestjs/*`.**

O Nest vira o que ele é bom em ser: um container de DI e um transporte. Não vira a
arquitetura.

---

## As camadas

```
┌─────────────────────────────────────────────────────────┐
│ infrastructure/   Nest modules, DI, config, bootstrap    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ adapter/   controllers, gateways, repositories,    │  │
│  │            mappers, SDK adapters                   │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │ application/   use cases, ports, DTOs        │  │  │
│  │  │  ┌───────────────────────────────────────┐  │  │  │
│  │  │  │ domain/   entities, VOs, domain rules  │  │  │  │
│  │  │  │           domain errors                │  │  │  │
│  │  │  └───────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              a dependência aponta sempre para dentro
```

### `domain/` — as regras que existiriam sem computador

Entidades, value objects, erros de domínio, invariantes.

| Pode | Não pode |
|---|---|
| TypeScript puro | `@nestjs/*`, `drizzle`, `@anthropic-ai/*` |
| Lançar erro de domínio | Saber o que é HTTP, SQL ou WebSocket |
| Validar a própria invariante | `async` que faça I/O |
| | Importar `application/` ou `adapter/` |

```ts
// src/domain/workspace/value-objects/workspace-path.value-object.ts
export class WorkspacePath {
  private constructor(readonly value: string) {}

  static create(raw: string, allowedRoots: readonly string[]): WorkspacePath {
    const normalized = normalize(raw)
    if (!isAbsolute(normalized)) throw new WorkspacePathNotAbsoluteError(raw)
    if (!allowedRoots.some((root) => isInside(normalized, root))) {
      throw new WorkspaceNotAllowedError(normalized)
    }
    return new WorkspacePath(normalized)
  }
}
```

Repare: a regra mais crítica do sistema — *este diretório pode ser aberto?* — é uma função
pura, testável sem subir nada. Era esse o objetivo.

### `application/` — orquestração de caso de uso

Um use case = uma intenção do usuário. Coordena domínio e portas; não contém regra de negócio.

| Pode | Não pode |
|---|---|
| Importar `domain/` | `@nestjs/*` |
| Declarar **portas** (interfaces) | Conhecer Drizzle, Nest, Agent SDK |
| Orquestrar, transacionar | Saber status HTTP |

```ts
// src/application/session/ports/claude-session.port.ts
export interface ClaudeSessionPort {
  start(input: StartClaudeSessionInput): Promise<ClaudeSessionHandle>
  prompt(sessionId: SessionId, text: string): Promise<void>
  interrupt(sessionId: SessionId): Promise<void>
  close(sessionId: SessionId): Promise<void>
}
export const CLAUDE_SESSION_PORT = Symbol('ClaudeSessionPort')
```

```ts
// src/application/session/start-session.use-case.ts
export class StartSessionUseCase {
  constructor(
    private readonly claude: ClaudeSessionPort,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: StartSessionCommand): Promise<SessionId> { /* ... */ }
}
```

Construtor com interfaces, sem `@Injectable()`, sem `@Inject()`. Em teste unitário isso é
`new StartSessionUseCase(fakeClaude, fakeRepo, fixedClock)` — sem container, sem
`Test.createTestingModule`.

### `adapter/` — onde o mundo externo encosta

Implementa as portas e traduz protocolo.

```
adapter/
├── inbound/     entra no sistema:  controllers HTTP, gateways WS
└── outbound/    sai do sistema:    repositories, Agent SDK, push, mappers
```

Aqui **pode** haver decorator do Nest: `@Controller`, `@WebSocketGateway`, `@Injectable`.
É a fronteira, e é o papel dela.

### `infrastructure/` — montagem

Nest modules, providers, tokens de DI, config, bootstrap, migrations, logger. Nenhuma regra
de negócio. Se você está escrevendo `if` de negócio aqui, está no lugar errado.

---

## Inversão de dependência com o container do Nest

O use case depende da **interface**; o Nest precisa de um **token**. O token mora com a porta,
em `application/`, como `Symbol`:

```ts
// src/infrastructure/modules/session.module.ts
@Module({
  providers: [
    { provide: CLAUDE_SESSION_PORT, useClass: AgentSdkClaudeSessionAdapter },
    { provide: SESSION_REPOSITORY,  useClass: DrizzleSessionRepository },
    {
      provide: StartSessionUseCase,
      inject: [CLAUDE_SESSION_PORT, SESSION_REPOSITORY, CLOCK],
      useFactory: (claude, sessions, clock) =>
        new StartSessionUseCase(claude, sessions, clock),
    },
  ],
})
export class SessionModule {}
```

`useFactory` com `new` explícito é o que mantém o use case livre de decorator. É três linhas
a mais por use case, e é o preço de ter `application/` testável sem framework.

---

## Fluxo de uma requisição

```
HTTP POST /sessions
   │
   ▼  adapter/inbound/http/session/session.controller.ts
      valida DTO · extrai traceId · loga debug (interceptor)
   │
   ▼  application/session/start-session.use-case.ts
      orquestra
   │
   ├──► domain/workspace/value-objects/workspace-path.value-object.ts   ← regra pura
   │
   ├──► ClaudeSessionPort  ──► adapter/outbound/claude/agent-sdk.adapter.ts
   │                                              └─► Claude Agent SDK
   └──► SessionRepository  ──► adapter/outbound/persistence/session/drizzle-session.repository.ts
                                                  └─► Postgres
   │
   ▼  erro de domínio? → exception filter mapeia para HTTP
   ▼  201 Created
```

---

## Verificação automática

A Dependency Rule é garantida por lint, não por boa vontade. `dependency-cruiser` no CI:

| Regra | Proíbe |
|---|---|
| `domain-is-pure` | qualquer import de `@nestjs/*`, `drizzle-orm`, `@anthropic-ai/*` dentro de `domain/` |
| `application-is-framework-free` | import de `@nestjs/*` dentro de `application/` |
| `no-outward-dependency` | `domain/` → `application/`, `application/` → `adapter/` |
| `no-cross-domain-internals` | importar caminho profundo de outro domínio em vez do barril (`@domain/x`, `@application/x`) |

Violação **quebra o build**. Ver [07-testing.md](07-testing.md).

---

## Perguntas que aparecem toda semana

**"Onde valido o input?"** Duas vezes, com propósitos diferentes. Formato no adapter (DTO +
`class-validator` → `400`). Regra de negócio no domínio (`WorkspacePath.create` → `403`).
Não são redundantes: uma protege o parser, a outra protege a invariante.

**"Use case pode chamar outro use case?"** Não. Extraia a lógica comum para um serviço de
domínio. Use case chamando use case vira corrente que ninguém desenrola.

**"Onde fica a transação?"** No adapter, via decorator/interceptor transacional. O use case
declara a intenção; quem abre e fecha conexão é a camada de fora.

**"Entidade de domínio pode virar resposta HTTP?"** Nunca. Sempre passa por um mapper
`domain → DTO` no adapter. Expor entidade acopla a API à modelagem interna.

**"E DTO, mora onde?"** DTO de transporte (HTTP/WS) no adapter. DTO de comando de use case
em `application/`. São coisas diferentes com o mesmo nome.
