# F3 — Orçamentos

Plano: [16 — Uso e custo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-usage-screen.md), e do centro de notificações e da status bar do plano
[06](../06-workbench/README.md).
**Entrega:** orçamentos por usuário e por pasta, diários ou mensais, com limiares que avisam
exatamente uma vez — no web, na status bar e, opcionalmente, no celular — e que, se o usuário
pedir, recusam novos turnos; tudo na trilha e explicado na tela.

**Decisões que bloqueiam:** [D-12](decisions.md#d-12--o-que-acontece-quando-o-orçamento-estoura) (B-26),
D-13 (B-24), D-14 (B-25), D-15 (B-23).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-23 — Domínio do orçamento 🔲

`Budget` em `domain/usage`: escopo (`user` ou `folder` com o `WorkspacePath`), período (`day`,
`month`), unidade e limite — `usd` (`UsdAmount`), que conta só os turnos de motores que anunciam
`cost: 'usd'`, ou `tokens`, para motor que só informa tokens
([discovery 03 §6.8](../../discovery/03-multiplos-motores-de-agente.md#68-uso-e-custo)); motor com
`cost: 'requests'` ou `'none'` fica fora do orçamento, e a ajuda diz isso. A tela só oferece a unidade
que os motores habilitados anunciam — com o Claude, só USD —, limiares em porcentagem (padrão
50/80/100), modo (`notify` ou `block`), push (sim/não). Funções puras:

- período corrente e próximo no fuso da preferência, com a virada à meia-noite local e no dia 1
  (S-91);
- `evaluateBudgets(before, after)` → limiares cruzados, em ordem, inclusive vários de uma vez e o
  igual ao limite (S-88, S-89);
- casamento de pasta por segmento (S-90, [D-15](decisions.md#d-15--orçamento-de-pasta-alcance-e-convivência));
- admissão: orçamento só de aviso nunca recusa; bloqueante recusa a partir de 100 %; com vários, o
  mais apertado decide e é o que a recusa nomeia (S-92, S-107).

### B-24 — Criar, editar e apagar, com trilha 🔲

`GET`/`POST /usage/budgets`, `PATCH`/`DELETE /usage/budgets/:id`. Validação com todos os erros em
`details[]` — valor positivo, teto configurado, 2 casas, limiares 1–100 sem repetição (S-93); pasta
resolvida pelo `workspace`, fora da allowlist ou inexistente recusada (S-94). Criar de novo com os
mesmos valores devolve o existente; mesmo escopo e período com valores diferentes é
`USAGE_BUDGET_CONFLICT` (S-95). De outra pessoa `FORBIDDEN`, inexistente `USAGE_BUDGET_NOT_FOUND`
(S-96). Apagar é `deleted_at` e idempotente — a segunda vez devolve o mesmo apagado (S-97), e é o
que permite o desfazer da B-28.

Conforme [D-13](decisions.md#d-13--mudança-de-orçamento-na-trilha), as três mudanças entram em
`audit_events` **antes** de valer, com escopo, período, limite antes e depois e modo; trilha
indisponível não muda o orçamento (S-98). O documento
[backend/05 · A trilha de auditoria](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria)
ganha os kinds novos.

### B-25 — Avaliação no fim do turno, e os alertas 🔲

Na mesma transação que grava o turno (B-08), o gasto de cada orçamento que casa é recalculado para o
período e os limiares cruzados viram linhas em `usage_budget_alerts` com
`ON CONFLICT DO NOTHING` sobre `(budget_id, period_start, threshold)` — duas sessões cruzando juntas
geram um alerta (S-99). Editar o limite para baixo do já gasto avalia na hora (S-100). Reentrega do
turno não reavalia (S-27).

Cada alerta novo vai para `GET /usage/alerts`; ser visto é por usuário (`POST /usage/alerts/:id/seen`)
— visto num dispositivo não volta como novo em outro (S-109). Com push ligado e conforme
[D-14](decisions.md#d-14--push-do-alerta-de-orçamento), a porta `BudgetAlertNotifier` pede ao
`notification` um aviso para **todos** os aparelhos aprovados, traduzido no idioma de cada um, sem
conteúdo de conversa, um por cruzamento (S-108) — a regra de notificação segue
[backend/03 · notification](../../architecture/backend/03-modules.md#notification).

### B-26 — Recusa de novos turnos 🔲

Conforme [D-12](decisions.md#d-12--o-que-acontece-quando-o-orçamento-estoura): `session.prompt` e
`session.start` perguntam à porta `TurnAdmission` antes de entregar o prompt ao motor ou de subir o
subprocesso.

- Orçamento bloqueante a 100 % → `USAGE_BUDGET_EXCEEDED` (`429`, `retryAfterSeconds` até a virada
  do período), com orçamento, gasto, limite e hora da virada nos `params` (S-101);
- o turno em curso **não** é interrompido; prompt já aceito roda (S-102);
- `session.start` recusado não sobe subprocesso e devolve o slot (S-103);
- orçamento de pasta bloqueia só aquela pasta e as subpastas (S-106);
- banco de uso indisponível na admissão: fechado com `SERVICE_UNAVAILABLE` se há orçamento
  bloqueante, aberto com `warn` se não (S-104);
- aumentar o limite, trocar para aviso, apagar ou virar o período desbloqueia o próximo prompt
  (S-105).

A recusa é log `warn` com o orçamento, sem texto do prompt. O app, que também manda `session.prompt`,
ganha só a chave en/pt-BR de `usage.error.budgetExceeded` (sem tela nova); o teste do app entra no
`verify:full`.

### B-27 — O alerta no web: notificações, status bar e composer 🔲

- **Centro de notificações** do plano 06: cada alerta novo vira toast ("Orçamento diário: 80 % —
  US$ 8,00 de US$ 10,00") e fica no histórico, com a ação "ver uso"; a lista vem de `GET /usage/alerts`,
  revalidada a cada `turn.completed` observado e a cada 60 s com a janela visível;
- **Status bar**: gasto de hoje e porcentagem do orçamento mais apertado, com o estado por token de
  cor **e** por ícone; clicar abre `/usage?tab=budgets`; tooltip com todos os orçamentos (S-110);
- **Recusa no composer** (o do 08, ou o atual da sessão até lá): o erro traduzido diz qual orçamento,
  quanto foi gasto, quando vira, e leva à tela de orçamentos (S-111).

### B-28 — Tela de orçamentos 🔲

Aba "Orçamentos" em `/usage`: lista com escopo, período, barra de progresso acessível
(`role="progressbar"`, `aria-valuenow`, valor em texto, estado por ícone e texto além da cor —
S-112), modo, push, virada do período; filtros por escopo e estado (dentro, perto, estourado).
Criar e editar num painel com validação inline, pasta pelo seletor do 06 (nunca digitada), e a
**prévia** "com o gasto de hoje, este orçamento já estaria em X %" antes de salvar (S-114).
Apagar sem diálogo de confirmação: some da lista com toast "orçamento apagado · desfazer", que
restaura igual (S-113) — confirmação fica só para o que não se desfaz. Ações também pelo menu de
contexto e pela palette.

### B-29 — Usabilidade e ajuda da tela de orçamentos 🔲

Seção própria na gaveta de ajuda: o que é um orçamento; aviso versus recusa; **limite suave** — o
turno que cruza termina, prompts já aceitos rodam, sessões em paralelo podem passar juntas; o teto
rígido por sessão que já existe (`RC_SESSION_MAX_BUDGET_USD`) e a diferença para este; virada do
período no fuso; orçamento de pasta cobre subpastas; push e por que ele pode não chegar. Estado vazio
que ensina ("crie um orçamento diário para ser avisado antes de gastar demais") com o botão de criar;
tooltips e `aria-label` em todos os controles de ícone; atalhos registrados; en e pt-BR; axe sem
violação (S-115).

---

## Cenários cobertos

S-88…S-115.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
