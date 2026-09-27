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
2. **`gap: true` → limpe o store e recarregue o transcript por HTTP.** Não tente costurar. A
   conversa a recarregar é a que o ack nomeia em `claudeSessionId` — o id da **conversa** no store
   do Claude, não o da sessão viva —, e a página é **posta por baixo** do que o stream trouxer
   enquanto ela carrega: mesmo `messageId`/`toolUseId` fica com a versão do stream, o resto do
   stream vem depois, e `lastSeq` não se move. É o que deixa recarregar com o stream chegando sem
   duplicar mensagem (`withHistory`, em `live-session.service.ts`). A mesma carga vale para uma
   sessão **retomada**: o que foi dito antes dela vem do transcript da conversa em `resumedFrom`,
   nunca do ring buffer.
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

### O histórico é dado do servidor

As telas de histórico (`/history?workspacePath=` e `/history/:conversationId`) são leitura paginada
por cursor, e vivem no **TanStack Query** (`usePagedQuery`, em `shared/hooks/`), não num store:
abrir a mesma conversa de novo dentro da janela de `staleTime` lê o cache e não refaz a chamada.
A lista de conversas refaz ao voltar o foco; a conversa aberta, não — é detalhe. A recarga depois
de um `gap` é a exceção, e de propósito: ela vai sempre à rede, porque responde a um estado em que o
que está na tela deixou de ser confiável.

---

### Menu de comandos e desfazer

Os dois são **dado do servidor**, lidos por TanStack Query só quando o painel é aberto
([plano 04 · F3/F4](../../plans/04-transcript-and-resume/README.md)):

- **o menu** (`GET /sessions/:id/commands`) chega filtrado e ordenado pelo backend; a busca é
  local, por nome, alias e descrição. Menu indisponível mostra erro com ação de tentar de novo, e a
  caixa de prompt continua enviando — o menu é descoberta, não fronteira;
- **a recusa de um prompt** (`session.error.unknownCommand`) é reconhecida pelo `correlationId`
  do `session.prompt`, que `sendPrompt` envia com `wsClient.issue()`;
- **a prévia do desfazer** (`GET /sessions/:id/checkpoints`) é lida sempre da rede (`staleTime: 0`) e
  relida a cada `turn.completed` e `session.rewound`: ela descreve o disco **agora**, e cache aqui
  seria confirmação com informação velha. O resultado do último desfazer (`lastRewind`) vive no
  store do stream, porque chega como evento com `seq`.

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
