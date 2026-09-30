# Estado e dados no web

Voltar para o [índice do web](README.md).

---

## Onde cada estado mora

A pergunta que resolve 90 % dos casos: **quem é o dono deste dado?**

| Estado | Dono | Ferramenta | Exemplo |
|---|---|---|---|
| Dado do servidor | servidor | **TanStack Query** | lista de sessões, workspaces |
| Stream ao vivo | servidor, via socket | **Zustand** (store da feature) | eventos da sessão |
| O que **este navegador** abriu | a aba | **Zustand** (store da feature) | as sessões que ele pode encerrar — aprendidas por quem mandou o comando, não pela tela que as mostra ([plano 05 · S-84](../../plans/05-hardening-operations/scenarios.md)) |
| UI local | o componente | `useState` | menu aberto |
| UI compartilhada | app | **Zustand** (store global) | tema, navegação recolhida |
| UI de uma aba de pasta | **a aba** | **Zustand**, um store **por pasta**, criado por fábrica | view ativa, painel aberto — [abaixo](#estado-de-aba-de-pasta) |
| Conveniência por visitante | este navegador | `localStorage`, **sempre** com `try/catch` | tamanhos de painel, tema, estado restaurável de cada aba |
| Preferência do usuário | servidor | **TanStack Query** | abas abertas e a ordem delas, recentes, histórico de notificações |
| Formulário | o formulário | **React Hook Form + Zod** | novo prompt |
| Navegação | **a URL** | TanStack Router | a pasta da aba ativa, filtro, seção de configurações |

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

**Um store por sessão**, criado sob demanda e compartilhado por quem pede a mesma
(`liveSessionStoreOf`, `permissionQueueOf`) — nunca um store de "a sessão na tela": a aba de pasta
inativa mantém a sessão dela anexada ([06 · D-11](../../plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)),
e duas conversas no mesmo store se misturariam. O anexo também é compartilhado, com contagem de
donos (`sessionAttachments` em `shared/api/`): a aba e a tela da sessão o seguram; quem chega depois
do primeiro não manda nada no fio, e voltar à aba não reanexa nem pede replay
([06 · D-26](../../plans/06-workbench/decisions.md#d-26--um-store-por-sessão-e-anexos-com-dono)). Sair
esquece todos os stores.

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

> As rotas de histórico **saíram do web** no [plano 06 · B-33](../../plans/06-workbench/F5-screens.md#b-33--a-home-desmontada-e-as-rotas-antigas-)
> ([D-07](../../plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)) e o
> histórico volta com a view Sessões do [plano 08](../../plans/08-claude-panel/README.md). A regra
> abaixo — leitura paginada no Query, não num store — vale para ela também.

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

## Estado de aba de pasta

Cada aba de pasta é um workbench completo ([web/03 · Abas de pasta](03-ui-system.md#abas-de-pasta),
[ADR-014](../shared/00-decisions.md#adr-014--o-web-vira-um-workbench-construído-em-react)), e o
estado dela é **dela**:

- **um store por pasta**, criado por **fábrica** e chaveado pelo **caminho real** que o backend
  resolveu — nunca um global compartilhado. Um store global de "workspace selecionado" foi o que
  levou uma sessão a nascer na primeira raiz em vez da pasta escolhida; é o anti-exemplo, e saiu no
  [plano 06 · B-33](../../plans/06-workbench/F5-screens.md#b-33--a-home-desmontada-e-as-rotas-antigas-),
  com um teste que impede a volta;
- o store de uma aba **inativa** fica em memória, e a árvore dela é desmontada: A → B → A não perde
  nada ([06 · D-11](../../plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas));
- o mesmo store serve o layout de `md+` e o de uma view por vez: mudar a largura não perde estado.

Onde mora cada parte:

| O quê | Onde | Por quê |
|---|---|---|
| a aba **ativa** | a URL (`/workbench?folder=`) | o link reproduz a tela ([D-06](../../plans/06-workbench/decisions.md#d-06--a-url-do-workbench)) |
| o **conjunto e a ordem** das abas | o servidor (`/workspaces/open-folders`) | segue o usuário para outro dispositivo e sobrevive a limpar o navegador ([D-10](../../plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)); a janela relê ao ganhar foco e ao reconectar |
| os recentes | o servidor (`/workspaces/recent`) | idem ([D-13](../../plans/06-workbench/decisions.md#d-13--onde-vivem-as-configurações-do-app-e-quais-seções-entram)) |
| **dentro** da aba: view ativa, tamanhos de painel, painel inferior aberto, e o que os planos seguintes registram (editores abertos, conversa aberta) | `localStorage`, chaveado pela pasta real — uma chave só (`workbench.tabState`), por parte e versão, preenchida pelo registro `tabRestorers` ([06 · D-31](../../plans/06-workbench/decisions.md#d-31--um-registro-de-restauração-por-aba)) | o layout do celular não é o do desktop; é conveniência, não dado |
| tema, densidade, idioma | `localStorage` | por visitante (D-13) |
| a allowlist | o arquivo no disco da máquina | só leitura na UI: mudá-la exige acesso ao disco ([backend/03](../backend/03-modules.md#workspace)) |

O estado guardado de uma aba volta quando o store dela nasce, antes de ela aparecer. Fechar a aba o
descarta; ler o conjunto de abas descarta o de pasta que não está mais aberta; sair descarta o de
todas.

**Todo acesso a `localStorage` é envolvido em `try/catch`.** Navegador privado, cota cheia ou
armazenamento bloqueado lançam — e a resposta é o default, nunca uma tela quebrada. Estado
corrompido ou de versão antiga também cai no default, sem erro. A URL vence o que estava salvo.

---

## A URL é estado

A pasta da aba ativa, o filtro e a seção de configurações ficam na URL. O teste é simples: **colar o
link em outro dispositivo reproduz a tela?** Se não, o estado está no lugar errado.

```
/workbench?folder=%2Fhome%2Fu%2Fprojects%2Fremote-claude
/audit?decision=allowed&toolName=Bash
```

Caminho absoluto vai na **search**, nunca num segmento de path: um splat cheio de `/` é ambíguo com
rotas filhas, e `#` e `%` pedem cuidado dobrado. O valor faz ida e volta sem perda — espaço, acento,
`#`, `%`, `?`, `&` e espaço no fim — e **não é aparado**: uma pasta cujo nome termina em espaço é
outra pasta. Quem lê e escreve essa search é um par só (`readWorkbenchSearch`, `workbenchLocation`
em `app/workbench-location.ts`), para que todo link para uma pasta seja escrito igual.

### O mapa de rotas

O [plano 06](../../plans/06-workbench/F0-contract.md#b-05--desenho-de-rotas-e-da-navegação-) fixa o
mapa; as fases dele o constroem, e o router o testa.

| Rota | Tela |
|---|---|
| `/` | a aba ativa, se há abas abertas — o endereço é **substituído** pelo dela —; sem abas, a boas-vindas ([D-07](../../plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)). Espera o conjunto de abas antes de decidir; conjunto que não se pôde ler abre a boas-vindas |
| `/workbench?folder=<path>` | o workbench, com a pasta ativa na search; `folder` ausente cai na boas-vindas, não num erro |
| `/audit?…`, `/rules`, `/rules/$ruleId` | Auditoria e Regras, com os deep links de hoje intactos |
| `/devices` | Dispositivos |
| `/diagnostics` | Logs e diagnóstico |
| `/settings/$section` | Configurações do app, uma seção por vez; `/settings` sozinho e seção desconhecida caem na primeira, com o endereço substituído |
| `/about` | Sobre |
| `/claude…`, `/usage…` | **reservadas** aos planos [11](../../plans/11-claude-settings/README.md) e [14](../../plans/14-usage-and-cost/README.md): ninguém as registra ainda, e caem no "não encontrado" |
| `/sessions/$sessionId`, `/history`, `/history/$conversationId` | **removidas** ([B-33](../../plans/06-workbench/F5-screens.md#b-33--a-home-desmontada-e-as-rotas-antigas-)), sem deep link de compatibilidade: caem no "não encontrado". A sessão viva mora na secondary side bar da aba, e o histórico volta com o plano 08 |
| o callback do login (`CALLBACK_PATH`) | não muda — voltar ao link pedido depois do login vale para todas |

Endereço que nenhuma rota responde — nunca válido, removido ou reservado — renderiza o **"não
encontrado" traduzido** do root (`NotFoundRoute`), com o caminho de volta ao início; nunca uma tela
vazia. Ele fica fora do portão de login: a tabela de rotas vai no bundle, e dizer que uma não existe
não conta nada a ninguém.

Todas as outras telas moram sob um layout sem caminho próprio (`_frame`): a moldura e o portão de
login estão nele, e nenhuma tela consegue esquecê-los. O endereço não muda; o id da rota ganha o
prefixo (`useSearch({ from: '/_frame/workbench' })`). O `returnTo` do login é o endereço na tela,
search incluída.

---

## Config e ambiente

Variáveis validadas com Zod no boot do app. Faltando ou inválida, o app **falha a subir** —
não caia em default silencioso que só quebra em produção.

Nada de segredo no front: tudo que vai para o bundle é público. `client_id` de OIDC é público
por definição; **client secret não existe** em SPA. Ver
[autenticação](../shared/08-authentication.md).
