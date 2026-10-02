# F4 — Inline

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-header.md).
**Entrega:** o que acontece no turno aparece **dentro** da conversa, na ordem, como no painel web
depois do 09:

- o indicador na cauda;
- o thinking vivo e o "pensou por *n* s";
- a permissão e o plano para aprovar no lugar da tool;
- a pílula quando o card sai de vista;
- as tarefas sobre a caixa;
- as ações de cada prompt.

A fila de permissão do topo deixa de existir. A tela que a notificação abre continua.

**Decisões que precisam estar fechadas para começar:** D-09 e D-10
([decisions.md](decisions.md#f4--inline)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-18 — O indicador de processamento na cauda 🔲

`WorkingIndicator`: a última entrada da conversa enquanto o turno roda (`thinking`, `running`,
`waitingPermission`). Some no fim do turno, e o resumo do turno toma o lugar dele.

- **Glifo animado + verbo + tempo**, com a mesma lista de verbos do web (09 · D-16, verificada pela
  [B-03](F0-norms.md)), sorteada por turno e estável no turno, inclusive depois de o app ir para trás e
  voltar;
- **diz o que está acontecendo** quando sabe: "Executando *tool*…" e "Esperando sua resposta", que leva
  ao card;
- **`MediaQuery.disableAnimations`:** glifo parado. O texto e o tempo continuam;
- **`Semantics(liveRegion: true)`** anuncia **só a troca de estado**, nunca cada segundo (R-06). O
  relógio vive no widget, e a lista não se reconstrói a cada segundo.

### B-19 — Thinking vivo e encerrado 🔲

A entrada de thinking da [B-05](F1-session-frame.md) ganha o desenho: enquanto chegam deltas, "Pensando…"
com o glifo; quando o bloco fecha, "Pensou por *n* s", recolhida, e um toque expande para o texto.
Thinking redigido diz que existiu, sem conteúdo inventado. No histórico, sem duração por bloco, diz só
"Pensou". Vários blocos no mesmo turno são várias linhas, na ordem, entre as tools.

### B-20 — A permissão no lugar da tool 🔲

`InlinePermission`: o `PermissionCardView` de hoje desenhado **no lugar da linha da tool** cujo
`toolUseId` o pedido traz, ou na cauda quando a linha ainda não chegou (09 · D-12). **Nada do card
muda**:

- comando exato, monoespaçado e sem truncar, inclusive em fonte de 200 %;
- destaque por risco com ícone e texto;
- contagem regressiva e estender o prazo;
- escopos com `once` como padrão;
- dois passos para destrutivo e para `project` e `always`;
- aprovar que não é o alvo mais fácil com `defaultToNo`;
- o caminho para as regras.

Respondido, o card vira a linha da tool com a decisão em palavras: "aprovado por você", "recusado —
ninguém respondeu a tempo", "aprovado no navegador por *X*" ou "por uma das suas regras" (a regra do 03,
sem dizer o escopo). O `ConstrainedBox` da fila no topo sai da `SessionPage`. O
`PermissionQueueController` continua sendo a fonte.

### B-21 — O plano para aprovar, inline 🔲

O pedido de `ExitPlanMode` vira o cartão do plano, no lugar da tool, pela regra da B-20. O plano aparece
como texto legível, e aprovar oferece os modos (08 · B-22). Aprovar com um modo troca o chip de modo da
barra ([B-11](F2-composer.md)) no mesmo gesto. Recusar volta ao modo plan com o motivo.

### B-22 — Nunca fora de vista, o teclado, e a tela da notificação 🔲

- **`PendingPill`:** com um pedido aberto e o card fora da área visível, aparece uma pílula **sobre a
  caixa**: "Claude espera sua resposta (*n*)". Tocar rola até o pedido mais antigo e põe o foco nele.
  Com o card à vista, a pílula some.
- **O teclado** (09 · D-13): o pedido que chega com o teclado aberto **não** fecha o teclado nem tira o
  foco da caixa, e o envio continua sendo do prompt. A pílula e o `liveRegion` anunciam o pedido. Só um
  toque no próprio card responde a ele (R-04).
- **A tela da notificação** ([D-02](decisions.md#f0--normas)): a `PermissionPage` continua como hoje,
  revalidando no servidor. "Abrir sessão" leva à conversa já rolada até o card.
- **A notificação com a sessão aberta** ([D-10](decisions.md#f4--inline)): o que o app faz com o push de
  um pedido da sessão que está na tela.

### B-23 — As tarefas sobre a caixa, e as linhas de sistema 🔲

- **`TaskStrip`:** a lista do `TodoWrite` (o input da tool, como o web lê em `task-list.ts`) ancorada
  acima da caixa, recolhida numa linha ("3/7 · Rodando os testes"). Tocar expande para a lista inteira.
  Sem lista, nada aparece. Atualiza ao vivo sem mexer na rolagem da conversa.
- **Linhas de sistema:** o resumo do turno (o custo e a duração, que o app já mostra), a compactação, o
  replay parcial e o resultado do desfazer viram linhas de uma linha, em tom discreto, na ordem em que
  aconteceram.

### B-24 — As ações da mensagem 🔲

Pela [D-09](decisions.md#f4--inline): pressionar e segurar o prompt do usuário abre as ações, que também
existem como `Semantics` custom actions para o TalkBack (R-08):

- **editar e reenviar:** a caixa recebe o texto, a faixa "editando" aparece ([B-13](F2-composer.md)), e
  enviar manda `session.start` com `resumeSessionId` e `forkAt`, num id novo (08 · D-19). O ponto que
  não é prompt da conversa é recusado com `INVALID_INPUT` (`session.error.forkPointUnknown`); o fork que
  o CLI recusa (`SESSION_FORK_REJECTED`) oferece a retomada simples;
- **bifurcar daqui**, o mesmo fork sem editar;
- **desfazer arquivos até aqui**, que abre o `rewind_sheet` com o alcance daquele prompt. O resultado
  vira linha na conversa. Com o turno rodando, a ação fica desabilitada e diz por quê; o backend recusando
  assim mesmo, `SESSION_LOCKED` aparece traduzido. Com a sessão encerrada, a ação não aparece.

---

## Cenários cobertos

S-54…S-84.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile
pnpm verify
```
