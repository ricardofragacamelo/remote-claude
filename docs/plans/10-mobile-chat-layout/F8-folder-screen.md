# F8 — A tela da pasta

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F7](F7-open-folders.md).
**Entrega:** tocar numa pasta abre a tela dela, no molde da view "Sessões do Claude" do web
([08 · F1](../08-claude-panel/F1-sessions.md)): **Nova sessão** (o rascunho), as sessões **abertas**
nela e nas subpastas — de qualquer aparelho —, e o **histórico** da pasta.

**Decisões que precisam estar fechadas para começar:** [D-24](decisions.md#f7f9--pastas-e-sessões-no-app).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-41 — As sessões vivas de uma pasta, do lado do app ✅

Na feature `session`: `GET /sessions?workspacePath=` no `SessionApiDataSource`, o mapper, o repositório
e o caso de uso, e a entidade `LiveSessionSummary` — `sessionId`, `claudeSessionId`, `resumedFrom`,
`workspacePath`, `status`, `model`, `permissionMode`, `startedAt`, `openedFrom` (`web`/`mobile`),
`pendingPermissions`. Um status ou uma origem que o app não conhece não derruba a lista: vira
"desconhecido", e o log diz qual. O controlador, por pasta, relê ao voltar à tela e ao puxar.

### B-42 — A tela da pasta ✅

`/folders?workspacePath=` (a pasta é parâmetro de query, como a do histórico):

- o título é o nome da pasta, e o subtítulo, a raiz;
- **Nova sessão** abre o rascunho da pasta ([D-05](decisions.md#f1--moldura-da-sessão)): nada roda até o
  primeiro prompt. Sem conexão, fica desligado com o motivo;
- **Abertas**: uma linha por sessão viva — status · modelo · há quanto tempo (o
  `sessions.row.liveDetails` do web), a subpasta quando não é a própria, de onde foi aberta (navegador ou
  celular) e, se houver, "*n* esperando você". Tocar abre a sessão, e ela entra no painel das sessões
  abertas no app ([F9](F9-open-sessions.md)). Vazio: "Nenhuma sessão aberta nesta pasta";
- **Histórico**: a primeira página das conversas da pasta (`GET /transcripts`, a mesma lista da
  [conversa](../04-transcript-and-resume/README.md)), com "Ver todas" para a tela inteira do histórico;
- os quatro estados de tela em cada seção, independentes: uma falha no histórico não esconde as
  abertas. Ajuda da tela, puxar para atualizar.

### B-43 — Os caminhos até a pasta, e de volta ✅

Tocar numa pasta (aberta ou recente) leva à tela dela. O rascunho e a sessão, abertos da pasta, voltam
a ela. O que se alcança por endereço — a pasta, a sessão, o pedido de uma notificação — mora abaixo das
Pastas, então "voltar" de uma notificação chega nelas em vez de fechar o app
([D-29](decisions.md#f7f9--pastas-e-sessões-no-app)). O `mobile/04` (navegação) diz a árvore nova.

---

## Cenários cobertos

S-153…S-162.

## Critério de conclusão

```bash
pnpm verify:full    # portões 1-11, sai com código 0 (o e2e destas fases é a B-48, na F10)
```
