# Arquitetura em camadas do front web

```
Componente
  └── usa → Hook  (estado local + efeitos)
               └── chama → Service  (HTTP via api.ts)
                               └── chama → Backend
```

Esta cadeia é **a** regra do front. Tudo neste documento decorre dela.

Voltar para o [índice do web](README.md).

---

## Por que a cadeia existe

Cada elo isola uma razão de mudar:

- **A API mudou** (URL, header, formato de erro) → muda `api.ts`. Mais nada.
- **O endpoint mudou** (rota, payload) → muda o Service. Nenhum componente sabe.
- **A regra de tela mudou** (quando busca, o que faz com o erro) → muda o Hook.
- **O visual mudou** → muda o Componente.

Quando um componente chama `fetch` direto, essas quatro razões colapsam em um arquivo — e
qualquer mudança de qualquer uma delas obriga a mexer no JSX.

---

## Os quatro elos

### `api.ts` — o cliente HTTP, um por aplicação

```ts
// src/shared/api/api.ts
export const api = createApiClient({
  baseUrl: env.API_URL,
  onRequest:  (req) => { attachAuth(req); attachTraceId(req); logDebug('http.request', req) },
  onResponse: (res) => { logDebug('http.response', res) },
  onError:    (err) => { toAppError(err) },   // → { code, messageKey, params }
})
```

**Responsabilidade única:** transporte. Autenticação, `traceId`, retry, timeout, logging de
I/O, e a normalização de erro do backend para um `AppError` tipado.

| Pode | Não pode |
|---|---|
| Header, baseUrl, retry, timeout | Conhecer endpoint específico |
| Normalizar erro | Ter regra de negócio |
| Logar I/O | Importar React |

**Existe um só.** Segundo cliente HTTP no projeto é sinal de que algo escapou da cadeia.

### Service — um por domínio

```ts
// src/features/session/services/session.service.ts
export async function fetchSessions(): Promise<Session[]> {
  const data = await api.get<SessionDto[]>('/sessions')
  return data.map(toSession)          // DTO → modelo da aplicação
}

export async function startSession(input: StartSessionInput): Promise<Session> {
  return toSession(await api.post<SessionDto>('/sessions', input))
}
```

| Pode | Não pode |
|---|---|
| Saber rota, método, payload | **Importar React** (sem hook, sem contexto) |
| Mapear DTO ↔ modelo | Guardar estado |
| Validar resposta | Decidir *quando* buscar |

Service é função assíncrona pura. Testável com `vitest` sem renderizar nada. **É aqui que a
forma do backend para de existir** — o mapper DTO→modelo é a fronteira.

### Hook — onde React entra

```ts
// src/features/session/hooks/useSessions.ts
export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    staleTime: 30_000,
  })
}
```

| Pode | Não pode |
|---|---|
| Chamar Service | **Chamar `api.ts` direto** |
| Cache, revalidação, estado local | Conter JSX |
| Efeito, subscrição de WS | Saber URL ou status code |
| Orquestrar vários services | |

O Hook é a única camada que conhece **os dois lados**: React e Service. É o tradutor.

### Componente — só apresentação e interação

```tsx
export function SessionList() {
  const { t } = useTranslation()
  const { data: sessions, isLoading, error } = useSessions()

  if (isLoading) return <SessionListSkeleton />
  if (error) return <ErrorState error={error} />
  return <ul>{sessions.map((s) => <SessionCard key={s.id} session={s} />)}</ul>
}
```

| Pode | Não pode |
|---|---|
| JSX, evento de UI, estado visual | Importar Service ou `api.ts` |
| Chamar Hook | `fetch` / `axios` |
| Compor outros componentes | Texto literal apresentável |

---

## O que é proibido, explicitamente

```tsx
// ❌ componente falando com a API
useEffect(() => { fetch('/api/sessions').then(...) }, [])

// ❌ componente chamando service direto
const sessions = await fetchSessions()

// ❌ service usando React
export function sessionService() { const [s] = useState() }

// ❌ hook montando a requisição
useQuery({ queryFn: () => api.get('/sessions') })   // isso é papel do service

// ❌ regra de negócio no JSX
{session.turns.filter(t => t.cost > 0).reduce(...)}  // extraia para o hook ou um selector
```

Regra de lint bloqueia import de `services/` e de `api.ts` dentro de `components/`.

---

## Onde cada tipo de estado mora

| Estado | Onde | Ferramenta |
|---|---|---|
| Dado do servidor (sessões, workspaces) | Hook | TanStack Query |
| Stream ao vivo (eventos WS) | Hook + store da feature | Zustand |
| Estado de UI local (aberto/fechado) | Componente | `useState` |
| Estado de UI compartilhado (tema, sidebar) | Store global | Zustand |
| Estado de formulário | Componente | React Hook Form + Zod |
| Estado de URL (filtro, aba, sessão ativa) | **URL** | TanStack Router |

Detalhes e o porquê de cada escolha: [04-state-and-data.md](04-state-and-data.md).

O que é navegável **mora na URL**, não em estado. Um link para uma sessão precisa funcionar
colado no chat.

---

## Onde o WebSocket entra na cadeia

O WS não quebra a regra — ele ocupa o mesmo lugar do Service:

```
Componente → Hook (useSessionStream) → WsService (socket) → Backend
```

O `WsService` é o dono do socket: conecta, reconecta, faz replay, valida frame contra o
contrato. O Hook **subscreve** e expõe estado pronto para render. O componente continua sem
saber que existe socket.

---

## Fluxo de erro

```
Backend  →  { error: { code, messageKey, params, traceId } }
   ↓  api.ts normaliza para AppError
   ↓  Service deixa subir (ou traduz para erro de domínio da feature)
   ↓  Hook expõe em `error`
   ↓  Componente renderiza <ErrorState> com t(error.messageKey, error.params)
```

O componente **nunca** faz `switch` em status HTTP — ele reage a `error.code`. Ver
[erros](../shared/04-errors-and-http.md).
