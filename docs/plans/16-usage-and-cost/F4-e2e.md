# F4 — E2E

Plano: [16 — Uso e custo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-budgets.md).
**Entrega:** o ciclo inteiro provado pela porta do usuário — turno → custo certo → tela → orçamento
→ alerta → recusa → liberação —, o isolamento entre usuários, o fuso e a acessibilidade.

Os e2e rodam contra a pilha local com o SDK roteirizado
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md)): os `result` roteirizados
carregam acumulados crescentes, com troca de modelo e subagente, a partir das fixtures reais da B-02.
Nenhum cenário depende do Claude real — o custo real é provado pelas fixtures, não por gasto no CI.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-30 — O ciclo do uso 🔲

Abrir uma pasta, mandar dois prompts roteirizados e ver: o custo de cada turno na sessão igual ao
delta; a tela de uso com os dois turnos no detalhe da sessão e a soma nos cartões (S-116); a troca de
modelo entre os turnos empilhando dois modelos no mesmo dia do gráfico (S-117).

### B-31 — O ciclo do orçamento 🔲

Criar pela tela um orçamento diário bloqueante com limite abaixo do segundo turno; o turno cruza e
termina; o alerta aparece no centro de notificações e na status bar; o prompt seguinte é recusado com
a mensagem traduzida no composer; aumentar o limite libera o próximo prompt (S-118). Criar e aumentar
aparecem na trilha em `/audit` (S-123).

### B-32 — Isolamento, fuso e export 🔲

Dois usuários de teste (como em `e2e/specs/trail-isolation.spec.ts`): B abre `/usage` vazio, sem
nada de A, e o link do detalhe de uma sessão de A mostra o erro traduzido (S-119). Navegador com
`timezoneId: 'America/Sao_Paulo'` e relógio da pilha num turno às 23:30 local → o turno cai no dia
local (S-120). O CSV baixado pela tela confere com a tabela filtrada (S-121).

### B-33 — Acessibilidade e celular 🔲

axe na tela de uso e na de orçamentos, nos temas claro e escuro; percorrer o gráfico e as tabelas só
pelo teclado; "ver como tabela"; viewport de celular sem scroll horizontal e com a tabela virando
lista (S-122).

---

## Cenários cobertos

S-116…S-123.

---

## Critério de conclusão

```bash
pnpm verify:full
```
