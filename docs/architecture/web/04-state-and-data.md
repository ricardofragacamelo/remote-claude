# Estado e dados no web

Voltar para o [índice do web](README.md).

---

## Onde cada estado mora

A pergunta que resolve 90 % dos casos: **quem é o dono deste dado?**

| Estado | Dono | Ferramenta | Exemplo |
|---|---|---|---|
| Dado do servidor | servidor | **TanStack Query** | lista de sessões, workspaces |
| Stream ao vivo | servidor, via socket | **Zustand** (store da feature) | eventos da sessão |
| UI local | o componente | `useState` | menu aberto |
| UI compartilhada | app | **Zustand** (store global) | tema, sidebar |
| Formulário | o formulário | **React Hook Form + Zod** | novo prompt |
| Navegação | **a URL** | TanStack Router | sessão ativa, filtro, aba |

**Erro mais comum:** copiar dado do servidor para dentro de um `useState`. Isso cria uma
segunda fonte de verdade que envelhece sozinha. Dado do servidor fica no cache do Query, e a
UI deriva dele.

---

## TanStack Query — dado do servidor

Por quê: cache, deduplicação de requisição concorrente, revalidação, retry e estados de
`loading`/`error` prontos. Sem ele, cada hook reimplementa isso — pior.

```ts
// features/session/hooks/useSessions.ts
export function useSessions() {
  return useQuery({
    queryKey: sessionKeys.list(),
    queryFn: fetchSessions,        // ← do service. NUNCA api.get aqui
    staleTime: 30_000,
  })
}
```

`queryFn` chama o **service**. Montar a requisição dentro do `queryFn` quebra a
[cadeia](01-architecture.md).

### Chaves hierárquicas, em um lugar só

```ts
export const sessionKeys = {
  all:    ['sessions'] as const,
  list:   () => [...sessionKeys.all, 'list'] as const,
  detail: (id: SessionId) => [...sessionKeys.all, 'detail', id] as const,
}
```

Chave literal espalhada pelo código torna invalidação um exercício de adivinhação.
`invalidateQueries({ queryKey: sessionKeys.all })` derruba a árvore inteira.

### Mutação

```ts
export function useStartSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: startSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKeys.list() }),
  })
}
```

Update otimista só onde a reversão é trivial. Neste produto, quase nada é: iniciar sessão
sobe um processo real. Prefira o estado de `pending` honesto.

### Defaults

| Opção | Valor | Por quê |
|---|---|---|
| `staleTime` | 30 s (dado estável), 0 (dado vivo) | `0` em tudo gera refetch em cada foco |
| `retry` | 1, e **nunca** em `4xx` | repetir `403` não muda o resultado |
| `refetchOnWindowFocus` | `true` em lista, `false` em detalhe | |

---

## WebSocket — o stream ao vivo

O WS **não** vive no TanStack Query. Query modela requisição; WS modela fluxo contínuo com
ordem e replay.

```
Componente → useSessionStream (hook) → wsClient (service) → Backend
                     │
                     └─► sessionStreamStore (Zustand)
```

### `wsClient` — dono do socket, um por app

Responsável por: conectar, autenticar no handshake, **reconectar com backoff exponencial +
jitter**, pedir replay com `resumeFromSeq`, validar cada frame contra o contrato, renovar
credencial com `connection.reauthenticate`, e logar I/O em `debug`.

Não conhece React. Ver [contrato](../shared/05-websocket-protocol.md) e
[autenticação](../shared/08-authentication.md).

### O store de stream

Eventos chegam fora de ordem em replay e podem repetir. O store é quem garante coerência:

```ts
interface SessionStreamState {
  status: SessionStatus
  messages: Message[]
  activeTools: Map<ToolUseId, ToolExecution>
  pendingPermissions: PermissionRequest[]
  lastSeq: number
}
```

Três regras que não podem faltar:

1. **Descarte evento com `seq <= lastSeq`.** Replay reentrega — sem isso, mensagem duplica.
2. **`gap: true` → limpe o store e recarregue o transcript por HTTP.** Não tente costurar.
3. **`message.delta` acumula por `messageId`**, e `message.completed` substitui o acumulado.
   Concatenar delta sem chave duplica texto quando há mais de uma mensagem em voo.

### O hook

```ts
export function useSessionStream(sessionId: SessionId) {
  const store = useSessionStreamStore(sessionId)
  useEffect(() => {
    const sub = wsClient.attach(sessionId, store.apply)
    return () => sub.detach()      // cleanup obrigatório
  }, [sessionId])
  return store
}
```

Sem `detach` no cleanup, trocar de sessão acumula subscrição e a UI passa a receber evento de
sessão que não está mais na tela.

---

## A fila de permissão

É o estado mais delicado do front. Regras:

- Permissão resolvida **em outro dispositivo** chega como `permission.resolved` e some da
  fila sozinha. A UI reage ao evento; não assuma que quem resolveu foi você.
- `expiresAt` vira contagem regressiva. Expirou → sai da fila como negada, **sem** pedir
  confirmação.
- Enquanto envia a resposta, o card fica em `pending` e **não** aceita segundo clique.
- Resposta recusada porque outro venceu a corrida (`ack` sem efeito) **não** é erro na tela —
  atualize mostrando quem resolveu.

Ver [o fluxo](../shared/05-websocket-protocol.md#o-fluxo-de-permissão).

---

## A URL é estado

Sessão ativa, aba e filtro ficam na URL. O teste é simples: **colar o link em outro
dispositivo reproduz a tela?** Se não, o estado está no lugar errado.

```
/sessions/:sessionId?tab=transcript
```

---

## Config e ambiente

Variáveis validadas com Zod no boot do app. Faltando ou inválida, o app **falha a subir** —
não caia em default silencioso que só quebra em produção.

Nada de segredo no front: tudo que vai para o bundle é público. `client_id` de OIDC é público
por definição; **client secret não existe** em SPA. Ver
[autenticação](../shared/08-authentication.md).
