# F1 — Sessões da pasta

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** na aba de pasta, a view **Sessões do Claude** responde ao que o usuário pediu — o que
está rodando aqui, o que parece estar rodando em outro lugar (VS Code, terminal) e o histórico da
pasta —, e cada linha leva à integração certa com a sessão existente: `attach`, retomar ou fork.

**Decisões que precisam estar fechadas para começar:** D-10 ([decisions.md](decisions.md#f1--sessões-da-pasta)),
além das da F0 que esta fase implementa (D-05, D-06).

---

## Por que esta fase vem antes do painel

É a queixa concreta do usuário, e ela não depende de markdown nem de diff: ele abriu a pasta do
projeto e não viu as sessões dela. Entregar a lista cedo também valida, com dado real, a heurística
de "ativa em outro lugar" antes que o resto do painel dependa dela.

A integração com a sessão existente **não** é inventada aqui: é a do
[plano 04](../04-transcript-and-resume/F2-resume.md) — viva é `attach`, nossa encerrada retoma
in-place, externa retoma por fork — e a regra continua não dependendo de detecção
([backend/04](../../architecture/backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro)).
O que esta fase acrescenta é **ver** as três coisas juntas, na pasta.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-07 — `GET /sessions?workspacePath=`: as sessões vivas da pasta 🔲

O registro de sessões vivas é um `Map` em memória ([backend/04](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos)),
e hoje nada o expõe. O endpoint filtra por **dono** (o chamador; sessão de outra pessoa não aparece,
nem como contagem) e por **contenção**: o `cwd` da sessão está na pasta pedida ou abaixo dela,
comparado no realpath e por segmento de caminho (`/repo-old` não está em `/repo`). A pasta passa
antes pelo `ResolveWorkspaceUseCase` — mesma ordem de recusas do resto do módulo (`400`, `403`,
`404`, `422`).

Regra de contenção é **domínio puro** (`live-session-listing`), testada sem I/O; o use case junta o
registro e a resolução. Formato na [B-03](F0-contract.md). Log de I/O em `debug` com pasta e contagem,
sem resumo nem prompt ([logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug)).

### B-08 — O histórico da pasta diz o que está vivo e o que parece ativo 🔲

`GET /transcripts` ganha, por conversa, a `activity`:

| `activity` | Quando | Quem decide |
|---|---|---|
| `liveHere` | a conversa tem sessão viva **do chamador** (aberta, retomada ou o fork que a continua) — com `liveSessionId` | o registro vivo, perguntado pela porta que o `session` já oferece ao `transcript` |
| `activeElsewhere` | conversa **externa** cujo `lastModified` está dentro da janela da D-06 | regra pura, com o relógio do backend |
| `idle` | o resto | — |

A conversa `liveHere` não aparece duas vezes na view: ela é a linha de "em execução aqui". E se a D-05
decidir por subpastas, `includeSubfolders=true` troca o `listSessions({ dir })` pela varredura com
cache e filtro de `cwd` dentro da pasta — sem afrouxar a cerca, que continua sendo o `cwd`
([backend/03](../../architecture/backend/03-modules.md#transcript)). O cursor keyset sobre
`(lastModified, sessionId)` continua valendo, e a leitura continua **só** pelas funções do SDK.

### B-09 — A view "Sessões do Claude" 🔲

Na activity bar do [plano 06](../06-workbench/README.md), a view que ele reservou. Três grupos, cada
um com os [quatro estados](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre),
e o histórico com "carregar mais":

| Grupo | Linha |
|---|---|
| **Em execução aqui** | título, status vivo, modelo, há quanto tempo, de onde foi aberta, pedidos de permissão pendentes |
| **Ativas em outro lugar** | título, origem externa, "escrita há *n* min" — nunca "aberta no VS Code" (a D-06 do plano 04 e a D-06 daqui) |
| **Histórico** | título, origem (nossa · externa), branch, quando; subpasta relativa quando a D-05 as incluir |

Busca por título/resumo, filtro por origem e grupo, ordenação (recente · nome). A view e o estado
dela (filtros, grupo recolhido, rolagem) são **da aba de pasta** — a regra da
[B-05](F0-contract.md). A lista de conversas de hoje (`ConversationList`, em
`features/transcript`) e a `HistoryScreen` são absorvidas aqui; nada fica duplicado.

### B-10 — Integrar com a sessão: `attach`, retomar, fork 🔲

Clicar numa linha abre a conversa no painel da mesma aba (a F4 cria o painel; até lá, a conversa abre
na tela de sessão atual):

| Linha | Ação | O que a tela diz |
|---|---|---|
| em execução aqui | `session.attach` com `resumeFromSeq: 0` ([replay](../../architecture/shared/05-websocket-protocol.md#reconexão-e-replay)) | — |
| histórico, nossa | `session.start { resumeSessionId }` — continua no mesmo arquivo | — |
| histórico, externa | `session.start { resumeSessionId }` — fork num id novo | que a continuação vive num id novo e que o editor não verá as respostas |
| ativa em outro lugar | fork, **com confirmação** | que outro processo escreve nela agora e que as duas continuações vão divergir |

Recusas: `SESSION_LIMIT_REACHED` diz que o teto é da **instalação**, com o tempo de espera e as
sessões do usuário para encerrar (a D-09); `WORKSPACE_NOT_ALLOWED` e `SESSION_NOT_FOUND` traduzidos na
linha; silêncio além do prazo vira `RESUME_TIMEOUT` com tentar de novo. Clique duplo é uma retomada
só — o backend já junta, e a view não manda o segundo. Toda ação da linha está também no menu de
contexto (abrir, retomar, bifurcar, copiar o id da conversa, encerrar a sessão se for o dono) e na
command palette.

### B-11 — A lista acompanha o mundo 🔲

Pela D-10: polling do TanStack Query com a view visível, parado com a view escondida ou a aba de pasta
inativa, e invalidação imediata pelos eventos que o cliente já recebe das sessões que observa
(`session.started`, `session.closed`). Resposta velha não sobrescreve a nova; reativar a aba recarrega
uma vez. Nenhum stream novo no WebSocket.

### B-12 — As rotas de hoje viram deep links do workbench 🔲

O painel do Claude **não é uma tela separada**: vive na aba de pasta, ao lado do explorer e do editor.
Então as rotas de hoje continuam funcionando como link, e abrem o lugar certo (a D-07 do
[plano 06](../06-workbench/README.md)):

| Rota | Abre |
|---|---|
| `/history?workspacePath=` | a aba daquela pasta, com a view de sessões |
| `/history/$conversationId` | a conversa, somente leitura, no painel da aba da pasta dela |
| `/sessions/$sessionId` | a aba da pasta da sessão — aberta se preciso — com a conversa no painel; sessão inexistente ou que não é do chamador → erro traduzido com caminho de volta |

"Colar o link em outro dispositivo reproduz a tela" continua sendo o teste
([a URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado)).

### B-13 — Usabilidade e ajuda da view de sessões 🔲

A gaveta de ajuda do screen frame do plano 06, escrita para quem nunca viu o produto, em en e pt-BR: o
que são os três grupos; o que "nossa" e "externa" significam e de onde vem a origem (o nosso banco, não
o SDK); por que retomar uma externa cria um id novo; por que "ativa em outro lugar" é estimativa e
não certeza; por que o teto é da instalação. Estados vazios que ensinam o próximo passo ("nenhuma
conversa nesta pasta — comece uma no painel ao lado"), tooltip e nome acessível em todo controle de
ícone, atalhos na palette, axe sem violação, e `i18n:check` sobre as chaves novas.

---

## Cenários cobertos

S-13…S-57.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
