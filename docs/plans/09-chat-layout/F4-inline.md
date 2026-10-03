# F4 — Inline

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-header.md).
**Entrega:** o que acontece no turno aparece **dentro** da conversa, na ordem, como no plugin: o
indicador de processamento na cauda, o thinking vivo e o "pensou por *n* s", a permissão e o plano para
aprovar no lugar da tool, a pílula "esperando você" quando o card sai de vista, a lista de tarefas sobre
a caixa e as ações de cada prompt. O card "Waiting for you" do topo deixa de existir.

**Decisões que precisam estar fechadas para começar:** D-12, D-13, D-14, D-15 e D-16
([decisions.md](decisions.md#f4--inline)).

---

## O que o usuário pediu, e o que o plugin faz

> "Aquela parte de Claude is thinking tem que ser inline no chat; perguntas sobre execução de tools têm
> que ser inline no chat. Se puder, ter as mensagens de thinking, thought etc., para dar um feedback
> visual de que está acontecendo um processamento."

No plugin, o turno se lê de cima para baixo: cada bloco de raciocínio vira uma linha "Thinking…"
enquanto corre e "Thought for 2s" quando acaba (recolhida, e expande para o texto). Cada tool é uma
linha. Na cauda, enquanto o turno roda, fica um asterisco animado com um verbo ("Deciphering…") que
mostra que há trabalho em curso mesmo quando nada novo chegou. A pergunta de permissão aparece ali,
na conversa.

O plano 08 já entrega as peças: o thinking recolhido com duração (08 · B-19), a tool numa linha
(08 · B-17) e o card de permissão inteiro (03, 08 · B-29). O que falta é a **cauda viva** e o **lugar**
de cada peça.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-21 — O indicador de processamento na cauda ✅

`WorkingIndicator`: a última linha da conversa enquanto o turno roda (`thinking`, `running`,
`waitingPermission`). Some no fim do turno, e o resumo do turno (08 · B-23) toma o lugar dele.

- **Glifo animado + verbo + tempo:** o asterisco pulsa, e o verbo vem de uma lista traduzida, sorteado
  por turno e estável enquanto o turno dura ([D-16](decisions.md#f4--inline)). O tempo é o decorrido
  desde o início do turno.
- **Diz o que está acontecendo** quando sabe: "Executando Bash…" com a tool rodando, e "Esperando sua
  resposta" (que leva ao card) com um pedido aberto.
- **`prefers-reduced-motion`:** glifo parado, sem pulso. O texto continua.
- **Acessibilidade:** `role="status"` com `aria-live="polite"` anunciando **só a troca de estado**,
  nunca cada segundo do relógio.
- **Custo de render:** o relógio vive dentro do componente. A conversa não re-renderiza a cada segundo
  (R-07).

O "Claude is thinking…" e o rótulo `THINKING` do topo já saíram na [B-18](F3-header.md).

### B-22 — Thinking vivo e encerrado, na ordem ✅

O `ThinkingBlock` do 08 · B-19 ganha o estado **vivo**. Enquanto chegam deltas de `blockType: thinking`,
a linha diz "Pensando…" com o glifo animado. Quando o bloco fecha, vira "Pensou por *n* s", recolhida,
que expande para o texto. Thinking redigido diz que existiu, sem inventar conteúdo (a regra do 08).
No histórico, sem duração por bloco, a linha diz só "Pensou" (a regra do 08). Vários blocos no mesmo
turno são várias linhas, na ordem em que vieram, entre as tools.

### B-23 — A permissão no lugar da tool ✅

`InlinePermission`: o `PermissionCard` do 03 (e a prévia de diff do 08 · B-29) desenhado **no lugar da
linha da tool** cujo `toolUseId` o pedido traz, ou na cauda quando a linha ainda não existe
([D-12](decisions.md#f4--inline)). Nada do card muda: comando exato sem truncar, destaque por risco,
contagem regressiva, escopos com o segundo passo e o caminho para as regras. Respondido, o card vira a
linha da tool com a decisão em palavras ("aprovado por você", "recusado — ninguém respondeu a tempo",
"aprovado no celular por *X*", "aprovado pela regra *Y*"), no lugar da linha "última decidida" da fila
de hoje. O `PermissionQueuePanel` sai do painel. O `usePermissionQueue` continua sendo a fonte.

### B-24 — O plano para aprovar, inline ✅

O `PlanApprovalCard` (08 · B-22) no lugar do `ExitPlanMode`, pela mesma regra da B-23. Aprovar com um modo
troca o chip de modo da barra ([B-11](F2-composer.md)) no mesmo gesto.

### B-25 — Nunca fora de vista, e sem roubar o foco ✅

- **`PendingPill`**: com um pedido aberto e o card fora da área visível (rolado para cima, ou com o pane
  "Alterações" aberto), aparece uma pílula **sobre a caixa**: "Claude espera sua resposta (*n*)".
  Clicar volta ao chat se preciso, rola até o pedido mais antigo e põe o foco nele.
- **Foco**, pela [D-13](decisions.md#f4--inline): o pedido que chega com o foco na caixa **não** tira o
  foco dali, e o Enter continua sendo do prompt. A pílula anuncia o pedido (`aria-live`). Sem ninguém na
  caixa, o foco vai ao negar do card quando `defaultToNo`, como manda a norma.
- **Comando "Ir para o pedido de permissão"** na palette, com atalho.
- O badge na aba de pasta inativa (08 · B-42) e a notificação do navegador continuam como estão.

### B-26 — A lista de tarefas sobre a caixa ✅

Pela [D-14](decisions.md#f4--inline): o `TaskListPanel` (08 · B-20) sai do topo da conversa e vira o
`TaskStrip` ancorado acima da caixa, recolhido numa linha ("3/7 · Rodando os testes"). Expande para a
lista inteira. Sem lista, nada aparece. Atualiza ao vivo sem mexer na rolagem da conversa.

### B-27 — As ações da mensagem, e desfazer por ela ✅

`MessageActions` no prompt do usuário, ao passar o mouse e por teclado (foco na mensagem): **editar**
e **bifurcar** (08 · B-35, que já existem) e **desfazer arquivos até aqui** ([D-15](decisions.md#f4--inline)).
Desfazer abre o diálogo com o alcance arquivo a arquivo (o `UndoConfirmation` de hoje), e o resultado
vira uma linha na conversa (o `RewindReport`). Com o turno rodando, a ação fica desabilitada com o
motivo. Com a sessão encerrada, ela não aparece. O `UndoPanel` em `Disclosure` sai. O menu `⋯` da
[B-17](F3-header.md) é a outra entrada.

### B-28 — Busca fixa e linhas de sistema compactas ✅

A barra de busca (`Ctrl/Cmd+F`, 08 · B-24) fica **fixa no topo do scroller** enquanto a conversa rola. O
resumo do turno, a compactação, o replay parcial e o resultado do desfazer são linhas de uma linha, em
tom discreto, na ordem em que aconteceram.

---

**A ajuda do que esta fase desenha.** A [B-20](F3-header.md) descreveu a barra da caixa e o menu `⋯`;
os tópicos do indicador, do card inline, da pílula e das ações da mensagem entram aqui, com os lugares
que descrevem (S-92) — ajuda de um lugar que ainda não existe ensinaria errado.

## Cenários cobertos

S-48…S-80, S-92.

---

## Critério de conclusão

```bash
pnpm verify
```
