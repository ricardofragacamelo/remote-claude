# F9 — Várias sessões abertas no app

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F8](F8-folder-screen.md).
**Entrega:** o app mantém várias sessões abertas ao mesmo tempo, de uma pasta ou de várias. Na tela da
sessão, um painel lateral mostra as sessões abertas **da mesma pasta** — o ponto do status, o número
de pedidos esperando — e **Nova sessão**. Trocar é um toque, e as outras continuam
anexadas: o stream e os pedidos delas seguem chegando.

**Decisões que precisam estar fechadas para começar:** [D-26](decisions.md#f7f9--pastas-e-sessões-no-app)
e [D-28](decisions.md#f7f9--pastas-e-sessões-no-app).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-44 — O registro das sessões abertas no app ✅

Um provider que vive o app inteiro guarda, por pasta, as sessões abertas no app — na ordem em que
entraram ([D-28](decisions.md#f7f9--pastas-e-sessões-no-app)). Entra uma sessão quando é aberta da
pasta, nasce do rascunho, é retomada do histórico ou chega por uma notificação. Enquanto está no
registro, o `LiveSessionController` dela **não é descartado** ao sair da tela (`keepAlive`), então o
`follow` continua; tirar do registro solta o controlador, e o `unfollow` dispara. Uma sessão que
termina (`session.closed`) continua no registro, encerrada, até ser fechada — como a aba do web.

### B-45 — O painel lateral das sessões da pasta ✅

Na tela da sessão, o painel lateral da pasta ([D-26](decisions.md#f7f9--pastas-e-sessões-no-app)),
aberto ao arrastar da borda esquerda ou pelo ícone da pasta na `AppBar` — com rótulo, e anunciado
como "Sessões da pasta":

- no alto, o nome da pasta e **Nova sessão** (o rascunho da mesma pasta);
- uma linha por sessão aberta da pasta no app, na ordem do registro: o ponto do status (o mesmo do chip
  da `AppBar`), o modelo e a hora de início, e "*n*" em âmbar quando há pedidos esperando. A da tela
  fica marcada;
- tocar troca de sessão sem empilhar telas (substitui a rota) e fecha o painel. Pressionar e segurar
  abre a folha: **Fechar no app** (solta, não encerra — e diz isso) e **Encerrar** (a confirmação do
  menu `⋯`);
- no fim, **Todas as sessões da pasta**, que leva à tela da pasta (as vivas de outros aparelhos e o
  histórico).

Com uma sessão só, o painel existe do mesmo jeito: é por ele que se abre a segunda. O ícone da pasta
na `AppBar` mostra um ponto âmbar quando alguma **outra** sessão do painel espera resposta.

### B-46 — O que acontece fora da tela ✅

Um pedido de permissão numa sessão aberta que não está na tela acende o "*n*" da linha dela no painel e o ponto do ícone da pasta e, se a
pasta não está na tela, a contagem da pasta na tela **Pastas**. A notificação do sistema continua
valendo para a sessão que não está visível ([D-10](decisions.md#f4--inline)). Trocar para a sessão leva
ao card, rolando até ele. Reconectar o socket refaz o `follow` de **todas** as sessões do registro, cada
uma do seu ponto.

### B-47 — Documentação ✅

`mobile/03` (o registro e o `keepAlive`), `mobile/04` (a tela Pastas, a tela da pasta, o painel lateral e a
navegação), a ajuda das três telas, e o README do app.

---

## Cenários cobertos

S-163…S-174.

## Critério de conclusão

```bash
pnpm verify:full    # portões 1-11, sai com código 0 (o e2e destas fases é a B-48, na F10)
```
