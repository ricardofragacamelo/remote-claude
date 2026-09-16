# Estrutura de pastas do front web

Organização **por feature**, com a cadeia
[`Component → Hook → Service`](01-architecture.md) visível dentro de cada uma.

Voltar para o [índice do web](README.md).

---

## Por que por feature, e não por tipo

```
❌ src/components/…  src/hooks/…  src/services/…      (por tipo)
✅ src/features/session/{components,hooks,services}    (por feature)
```

Por tipo, uma mudança em "sessão" toca três pastas distantes e nada indica que os arquivos
se relacionam. Por feature, a mudança fica contida — e a pasta revela a fronteira.

---

## Árvore

```
web/
├── src/
│   ├── main.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx              rotas
│   │   └── providers.tsx           QueryClient, i18n, tema, error boundary
│   │
│   ├── features/
│   │   ├── session/
│   │   │   ├── components/         SessionList.tsx, SessionTranscript.tsx
│   │   │   ├── hooks/              useSessions.ts, useSessionStream.ts
│   │   │   ├── services/           session.service.ts
│   │   │   ├── types/              modelos da feature (não DTO)
│   │   │   ├── store/              zustand, só se a feature precisar
│   │   │   └── index.ts            superfície pública da feature
│   │   │
│   │   ├── workspace/
│   │   ├── permission/             pedido, escolha de escopo e as regras persistidas
│   │   ├── audit/                  consulta da trilha
│   │   ├── transcript/
│   │   └── auth/
│   │
│   ├── shared/
│   │   ├── api/
│   │   │   ├── api.ts              ← o cliente HTTP. Existe UM.
│   │   │   ├── ws-client.ts        ← o cliente WebSocket. Existe UM.
│   │   │   └── errors.ts           normalização → AppError
│   │   ├── components/
│   │   │   ├── ui/                 ← shadcn/ui (gerado). Não edite à mão.
│   │   │   └── …                   compostos nossos: ErrorState, EmptyState
│   │   ├── hooks/                  genéricos: useDebounce, useMediaQuery
│   │   ├── i18n/                   config + locales/{en,pt-BR}.json
│   │   ├── logging/                logger pino
│   │   ├── lib/                    cn(), formatadores
│   │   └── config/                 env validado com Zod
│   │
│   └── styles/
│       └── globals.css             Tailwind + tokens de tema
│
└── test/
    ├── unit/                       espelha src/
    ├── integration/
    └── support/                    handlers MSW, builders, render helper
```

---

## Fronteira de feature

Cada feature expõe **uma** superfície pública:

```ts
// src/features/session/index.ts
export { SessionList } from './components/SessionList'
export { useSessions } from './hooks/useSessions'
export type { Session } from './types/session'
```

Regras:

1. Feature importa outra feature **apenas pelo barril** (`@/features/workspace`), nunca por
   caminho profundo.
2. Feature **não** importa `services/` ou `hooks/` internos de outra feature. Precisou? Ou é
   `shared/`, ou as duas features são uma só.
3. Sem ciclo entre features. O lint reprova.
4. `shared/` **nunca** importa de `features/`. A seta aponta sempre para `shared/`.

---

## Quando algo vira `shared/`

Só quando é usado por **três ou mais** features **e** não tem regra de negócio.

Com duas features, duplique. Abstração criada cedo demais vira código que ninguém pode mudar
sem quebrar um consumidor desconhecido — e a duplicação teria custado menos.

`shared/components/ui/` é exceção: é o shadcn/ui gerado, e vive lá por definição.

---

## Convenções de arquivo

| Tipo | Nome | Exemplo |
|---|---|---|
| Componente | `PascalCase.tsx` | `PermissionPrompt.tsx` |
| Hook | `useCamelCase.ts` | `usePermissionQueue.ts` |
| Service | `kebab.service.ts` | `session.service.ts` |
| Store | `kebab.store.ts` | `session-stream.store.ts` |
| Tipo | `kebab.ts` | `session.ts` |
| Teste | `*.spec.ts(x)` em `test/` | **nunca** em `src/` |

**Um componente por arquivo**, com o mesmo nome do arquivo. Subcomponente usado só ali pode
ficar no mesmo arquivo, abaixo, sem export.

---

## Path aliases

```jsonc
{ "paths": {
    "@/*":           ["src/*"],
    "@/features/*":  ["src/features/*"],
    "@/shared/*":    ["src/shared/*"],
    "@contracts":    ["../packages/contracts/src"]
} }
```

Relativo (`./`, `../`) só **dentro** da mesma feature. Atravessou fronteira, usa alias.

---

## Regras verificadas por lint

| Regra | Proíbe |
|---|---|
| `no-api-in-components` | import de `@/shared/api` ou de `*/services/*` dentro de `components/` |
| `no-react-in-services` | import de `react` dentro de `services/` |
| `no-cross-feature-internals` | caminho profundo entre features |
| `shared-cannot-import-features` | `shared/` importando `features/` |
| `no-literal-jsx-text` | texto literal apresentável no JSX |
| `no-console` | `console.*` em qualquer lugar |
| `no-test-in-src` | arquivo de teste dentro de `src/` |
