# F1 — Telas de regra

Plano: [03 — Regras e trilha](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-rules.md).
**Entrega:** o usuário vê o que autorizou antecipadamente, e retira.

---

## Por que a tela vem colada na regra

Porque uma autorização que sobrevive à sessão e não tem onde ser vista é uma porta que ninguém
sabe que está aberta. A regra e a tela que a revoga são a mesma entrega, em duas fases apenas
por causa do ciclo de validação.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-07 — Tela de regras no web 🔲

Lista por escopo e por projeto, com tool, padrão, autor e data. Revogar é uma ação direta, com
os quatro estados de tela e i18n em `en` e `pt-BR`.

Cadeia `Component → Hook → Service → api.ts`, sem atalho
([web/01](../../architecture/web/01-architecture.md)).

### B-08 — Escolha de escopo na aprovação, no web 🔲

`once` continua sendo o default. `project` e `always` aparecem dizendo **o que significam** —
"não perguntar de novo neste projeto", "não perguntar de novo em lugar nenhum" —, sem eufemismo
e sem sigla.

### B-09 — Lista e revogação no app 🔲

A mesma capacidade no celular: quem aprovou de longe precisa poder retirar de longe.
Material 3, cor do `ColorScheme`, os quatro estados
([mobile/04-ui](../../architecture/mobile/04-ui.md)).

### B-10 — Escolha de escopo na tela de permissão do app 🔲

Junto da confirmação em dois passos que já existe. Escolher `always` num toque acidental é
exatamente o que a [tela de permissão](../../architecture/mobile/04-ui.md#a-tela-de-permissão)
existe para impedir.

---

## Cenários cobertos

S-15…S-22.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
