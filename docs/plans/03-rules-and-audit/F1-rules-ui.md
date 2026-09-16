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

**Rota própria** (`/rules`), não uma seção de configurações
([D-04](decisions.md#d-04--onde-a-revogação-mora)): o R-02 promete revogação a um clique, e
dentro de configurações ela fica a três.

Lista por escopo e por projeto, com tool, padrão, autor, data e **validade** — com sinal para a
regra perto de expirar. Sem o aviso, a sessão volta a perguntar sem explicação, que é perder a
comodidade e não explicar a perda. Revogar é uma ação direta, com os quatro estados de tela e
i18n em `en` e `pt-BR`.

Cadeia `Component → Hook → Service → api.ts`, sem atalho
([web/01](../../architecture/web/01-architecture.md)).

### B-08 — Escolha de escopo na aprovação, no web 🔲

`once` continua sendo o default. `project` e `always` aparecem dizendo **o que significam** —
"não perguntar de novo neste projeto", "não perguntar de novo em lugar nenhum" —, sem eufemismo
e sem sigla, com a validade à vista.

Daqui se chega à lista de regras: é um dos dois pontos de entrada que a D-04 exige (o outro é a
trilha, na B-15).

### B-09 — Lista e revogação no app 🔲

A mesma capacidade no celular, e também em **tela própria** — simetria entre as pontas, como o
plano 02 estabeleceu: quem aprovou de longe retira de longe, pelo mesmo caminho. Material 3, cor
do `ColorScheme`, os quatro estados ([mobile/04-ui](../../architecture/mobile/04-ui.md)).

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
