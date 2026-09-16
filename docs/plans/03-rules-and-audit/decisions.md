# Plano 03 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Regras

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Qual a sintaxe do padrão de input da regra: prefixo de comando, glob, ou expressão | o que os usuários realmente querem liberar — não há uso medido | B-01 | — | 🔲 |
| D-02 | Regra tem validade máxima (expira em N dias), ou vale até ser revogada | se "sempre" significa "para sempre" é uma escolha de segurança, não de UX | B-01 | — | 🔲 |
| D-03 | `always` vale por usuário ou pela máquina | depende de [D-03 do plano 01](../01-live-session/decisions.md) — dono único ou vários | B-01 | — | 🔲 |

### D-01 — a sintaxe é a superfície de ataque

É o [R-01](README.md#riscos-e-decisões-em-aberto) deste plano. Quanto mais expressivo o padrão,
mais fácil escrever — e mais fácil escrever largo demais.

- **Prefixo de comando** (`Bash(git status)` casa só com o comando exato ou com argumento
  adicional explícito): previsível, verboso, e é o que S-06 cobra.
- **Glob**: cômodo, e `Bash(git *)` já libera `git push --force`.
- **Expressão regular**: poder demais para uma decisão de segurança tomada num toque de celular.

Recomendado: começar no mais restrito. Afrouxar depois é uma migration; apertar depois é tirar
permissão de quem já se acostumou.

### D-02 — regra que expira

Uma regra sem validade sobrevive à razão que a criou. Validade máxima (por exemplo, 90 dias,
como a retenção) força a revisão periódica; e obriga a UI a avisar antes de expirar, senão a
sessão volta a perguntar sem explicação.

---

## F1 — Telas de regra

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Onde a lista de regras mora na UI: tela própria, ou seção dentro das configurações | quantas regras um usuário terá | B-07 | — | 🔲 |

---

## F2 — Consulta da trilha

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | A trilha é escopada por usuário ou pela máquina | mesma dependência de [D-03 do plano 01](../01-live-session/decisions.md) | B-12 | — | 🔲 |
| D-06 | Qual a ordenação estável da paginação por cursor: `(at, id)` ou um sequencial próprio | se o relógio pode voltar atrás na máquina do usuário | B-11 | — | 🔲 |

### D-06 — paginar sobre o tempo

Ordenar por timestamp parece óbvio até dois registros caírem no mesmo milissegundo, ou o relógio
da máquina ser ajustado para trás — e então o cursor repete ou pula linha, que é exatamente o
que S-25 proíbe. Um sequencial próprio (ou o par `(at, id)`) resolve, ao custo de uma coluna.

---

## F3 — Retenção

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Quem dispara a purga: agendador do SO, job do backend, ou comando manual | como o produto é instalado — o que só se decide no [plano 06](../06-distribution/README.md) | B-18 | — | 🔲 |

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que já está decidido)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md).
3. Rode `pnpm plan progress`: o contador sai daqui, no [progresso do plano](progress.md) e no
   [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
