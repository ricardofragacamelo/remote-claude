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
| UI de uma aba de pasta | **a aba** | **Zustand**, um store **por pasta**, criado por fábrica | view ativa, painel aberto, onde a conversa de cada aba do painel foi deixada (a rolagem sobrevive à troca de pane e de layout, nunca à recarga — [09 · B-05](../../plans/09-chat-layout/F1-panel-frame.md#b-05--chatframe-as-três-faixas-e-o-único-scroller-)) — [abaixo](#estado-de-aba-de-pasta) |
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

Quem ouve o quê — e a diferença importa, porque a aba de pasta mantém as sessões dela anexadas:

| Método | Ouve | Para quê |
|---|---|---|
| `attach(sessionId, …)` | os frames da sessão, a quem a observa | o store da sessão |
| `observe(listener)` | o que **não** pertence a sessão anexada: recusas por `correlationId`, o `session.started` de uma sessão que acabou de abrir | quem mandou um comando reconhece a resposta dele |
| `onSessionLifecycle(listener)` | todo `session.started`/`session.closed`, anexada ou não | invalidar a lista de sessões ([08 · D-10](../../plans/08-claude-panel/decisions.md#d-10--a-lista-de-sessões-se-atualiza-como)) |
| `onSessionFrame(listener)` | todo `event` e `request` de sessão, anexada ou não, sem desviar o frame | os avisos de pergunta em aba que ninguém olha e as notificações do navegador ([08 · B-42](../../plans/08-claude-panel/F4-chat-panel.md#b-42--permissão-nunca-se-perde-badges-e-notificações-)) |

Aviso que escuta por `observe` nunca ouve uma sessão anexada — e no painel toda sessão está anexada.

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

1. **Descarte evento com `seq <= lastSeq`.** Replay reentrega — sem isso, mensagem duplica. A
   exceção é o `session.started`: uma sessão nascida num rascunho ouve seus primeiros frames ao vivo,
   antes de o replay do attach trazer o início de volta, e ele é o único frame que diz qual conversa
   a sessão é e como roda. Atrasado, o que ele diz é tomado, a menos que um frame posterior já tenha
   dito (`lateStart`, no `live-session.store.ts`; plano 08, S-267).
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

### O painel do Claude dentro da aba

O [plano 08](../../plans/08-claude-panel/README.md) põe o chat na aba de pasta, e o estado dele segue a
regra da aba (08 · B-05):

- **o estado do painel é da aba de pasta** — as conversas abertas em abas do painel, a conversa ativa,
  o rascunho, o conjunto de contexto, a rolagem e os filtros da view Sessões vivem num store **chaveado
  pela pasta real**, nunca global. Duas abas mostram listas diferentes, e o filtro de uma não aparece
  na outra;
- **o rascunho não tem sessão.** "Nova conversa" é estado do cliente: modelo, modo, esforço, texto e
  contexto escolhidos ali, e nenhum subprocesso. A sessão nasce no **primeiro envio**
  (`session.start` e, no `session.started`, o `session.prompt`); recusa no teto mantém o rascunho inteiro
  ([08 · D-07](../../plans/08-claude-panel/decisions.md#d-07--a-sessão-nasce-no-primeiro-prompt)).
  O esforço escolhido no rascunho fica guardado **por sessão** quando ela nasce (`efforts`): na sessão
  viva o chip do esforço só mostra o valor, porque trocá-lo reiniciaria a query sem o `PreToolUse`;
  sessão aberta noutro lugar não tem esse valor, e o chip diz que é o do início
  ([09 · S-90](../../plans/09-chat-layout/scenarios.md));
- **o que o servidor só confirma aparece na hora, e volta com a recusa.** O modo e o modelo trocados
  pela barra da caixa mudam o chip antes da resposta — o servidor confirma, não ecoa —, e o `error` que
  nomeia o comando (`correlationId`) devolve o chip ao valor anterior, com o erro traduzido acima da
  caixa ([09 · S-23](../../plans/09-chat-layout/scenarios.md));
- **as sessões vivem no backend**: fechar a aba do painel ou a aba de pasta **não** as encerra — encerrar
  é um comando. A conversa aberta é registrada no `tabRestorers` e volta ao recarregar;
- **a lista de sessões é polling, com invalidação por evento** — 10 s pelo TanStack Query com a view
  visível, parado com a view escondida ou a aba inativa, e invalidada na hora por `session.started` e
  `session.closed` das sessões que o cliente já observa; nenhum stream novo
  ([08 · D-10](../../plans/08-claude-panel/decisions.md#d-10--a-lista-de-sessões-se-atualiza-como)).
  Resposta velha não sobrescreve a nova; reativar a aba recarrega uma vez;
- **a aba inativa continua anexada** às sessões dela — permissão só chega a quem está anexado — e
  suspende o que é da tela: o polling da lista e a renderização
  ([08 · D-11](../../plans/08-claude-panel/decisions.md#d-11--o-que-a-aba-inativa-mantém));
- **um redutor só** para o stream e para o histórico: thinking, subagents, tarefas e tools chegam pelas
  mesmas funções nos dois, e a timeline guarda a **ordem** em que mensagens e tools aconteceram — não
  duas listas separadas.

## A fila de permissão

É o estado mais delicado do front. Regras:

- Permissão resolvida **em outro dispositivo** chega como `permission.resolved` e some da
  fila sozinha. A UI reage ao evento; não assuma que quem resolveu foi você.
- `expiresAt` vira contagem regressiva. Expirou → sai da fila como negada, **sem** pedir
  confirmação.
- Enquanto envia a resposta, o card fica em `pending` e **não** aceita segundo clique.
- Resposta recusada porque outro venceu a corrida (`ack` sem efeito) **não** é erro na tela —
  atualize mostrando quem resolveu. Resposta que chega **depois do prazo** é recusada pelo servidor
  (`PERMISSION_REQUEST_EXPIRED`) com um `error` que nomeia o frame da resposta: o `respond` do
  `wsClient` devolve o id do frame, e a recusa aparece traduzida acima da caixa
  ([09 · S-61](../../plans/09-chat-layout/scenarios.md#permissão-e-plano-inline--b-23-b-24)).
- A fila é a **fonte**; o lugar é da conversa ([09 · D-12](../../plans/09-chat-layout/decisions.md#f4--inline)).
  O `useInlineRequests` acha cada pedido pela tool (`toolUseId`) e cada pedido decidido também: o
  resultado guarda a tool do card que ele fechou, e se a resposta vencedora foi a desta tela ("por
  você"). Pedido que uma regra decidiu antes de perguntar a alguém nunca esteve na fila e não tem
  tool para marcar.
- O card toma o foco **uma vez**, na chegada (`claimArrival`), e só se ninguém escreve
  ([09 · D-13](../../plans/09-chat-layout/decisions.md#f4--inline)). Redesenhado — movido para o
  lugar da tool, ou de volta com a aba —, não toma de novo.
- A contagem regressiva vive no hook: com um pedido aberto, a tela da sessão re-renderiza a cada
  segundo, e as mensagens não (são `memo`). O relógio do indicador do turno vive no próprio
  indicador ([09 · R-07](../../plans/09-chat-layout/README.md#riscos-e-decisões-em-aberto)).

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

### O explorer e o editor dentro da aba

O [plano 07](../../plans/07-explorer-and-editor/README.md) preenche a view Explorer e a área de
editor que o 06 reservou, e **tudo o que nasce lá é da aba de pasta** — um store por aba, pela mesma
fábrica, nunca um global de "arquivo aberto" ([07 · B-06](../../plans/07-explorer-and-editor/F0-contract.md#b-06--o-estado-do-explorer-e-do-editor-por-aba-de-pasta-)):

| O quê | Onde | Restaurado na recarga? |
|---|---|---|
| a árvore expandida, a seleção, "mostrar ocultos" | o store da aba | sim — só caminhos, pela restauração da aba |
| a pilha de desfazer de operações de arquivo (renomear, mover, apagar) | o store da aba | não: o desfazer vale para o que se fez **nesta** página |
| as abas e os grupos de editor, a ordem, a aba ativa de cada grupo | o store da aba | sim — só caminhos |
| os **buffers sujos** | memória do store da aba | **nunca**: conteúdo de arquivo não vai ao navegador ([07 · D-14](../../plans/07-explorer-and-editor/decisions.md#d-14--rascunho-não-salvo-e-a-recarga)); recarregar ou fechar com buffer sujo pede confirmação (`beforeunload`) |
| o `ETag` de cada aba de editor | o store da aba | não: é revalidado com `If-None-Match` ao reativar a aba de pasta |
| os arquivos recentes da pasta | o store da aba | sim — só caminhos |

**A URL leva o arquivo ativo da aba ativa:** `/workbench?folder=<pasta>&file=<caminho relativo>`.
Colar o link noutro navegador abre a pasta com aquele arquivo ativo; um `file` que sobe acima da
pasta (`../x`) abre a aba com a árvore e um erro traduzido no lugar do editor — a fronteira é do
servidor, a URL só pede. O par `readWorkbenchSearch`/`workbenchLocation` ganha o campo; o resto
(abas abertas, grupos) vem da restauração da aba, nunca da URL.

**Pontos de extensão que outros planos consomem:** a **aba de diff** (o 08 abre nela as alterações
do Claude; o 11, a prévia do substituir); o comando **"Adicionar ao contexto do Claude"** e o tipo do
arraste (`application/x-remote-claude-files+json`, com `scopeDragPayload` em `shared/` —
[07 · D-20](../../plans/07-explorer-and-editor/decisions.md#d-20--o-que-se-arrasta-para-o-claude)), que
só aparecem com um consumidor registrado; e as **ações de arquivo** no menu **Arquivo** e na command
palette do 06, registradas por comando com rótulo traduzido.

**O que a aba ouve do disco:** a pasta ativa assina `workspace.watch` e recebe
`workspace.filesChanged` — um stream com `seq` **próprio**, sem replay: reconectar refaz a assinatura
e recarrega a árvore ([05 · A pasta assistida](../shared/05-websocket-protocol.md#a-pasta-assistida--workspace)).
A aba inativa não gasta watcher.

**Todo acesso a `localStorage` é envolvido em `try/catch`.** Navegador privado, cota cheia ou
armazenamento bloqueado lançam — e a resposta é o default, nunca uma tela quebrada. Estado
corrompido ou de versão antiga também cai no default, sem erro. A URL vence o que estava salvo.

---

## A URL é estado

A pasta da aba ativa, o filtro e a seção de configurações ficam na URL. O teste é simples: **colar o
link em outro dispositivo reproduz a tela?** Se não, o estado está no lugar errado.

```
/workbench?folder=%2Fhome%2Fu%2Fprojects%2Fremote-claude
/workbench?folder=%2Fhome%2Fu%2Fprojects%2Fremote-claude&file=src%2Fmain.tsx
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
| `/workbench?folder=<path>&file=<relativo>` | o workbench, com a pasta ativa na search; `folder` ausente cai na boas-vindas, não num erro. `file` é o arquivo ativo da aba (plano 07), relativo à pasta |
| `/audit?…`, `/rules`, `/rules/$ruleId` | Auditoria e Regras, com os deep links de hoje intactos |
| `/devices` | Dispositivos |
| `/diagnostics` | Logs e diagnóstico |
| `/settings/$section` | Configurações do app, uma seção por vez; `/settings` sozinho e seção desconhecida caem na primeira, com o endereço substituído |
| `/about` | Sobre |
| `/claude…`, `/usage…` | **reservadas** aos planos [12](../../plans/13-claude-settings/README.md) e [15](../../plans/16-usage-and-cost/README.md): ninguém as registra ainda, e caem no "não encontrado" |
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
