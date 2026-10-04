# Plano 21 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0 — a B-03 (o desenho cancelado) foi entregue antes do plano, ao investigar o bug
**Última atualização:** 2026-10-03
**Bloqueios:** nenhum

```
F0 █████░░░░░░░░░░░░░░░  25%   🔄 em andamento
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-04 | 1/4 | 🔄 |
| [F1](F1-pdf-reader.md) | B-05…B-10 | 0/6 | 🔲 |
| [F2](F2-pdf-navigation.md) | B-11…B-14 | 0/4 | 🔲 |
| [F3](F3-markdown.md) | B-15…B-19 | 0/5 | 🔲 |
| [F4](F4-e2e.md) | B-20…B-23 | 0/4 | 🔲 |
| **Total** | **B-01…B-23** | **1/23** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 74 | 72 | 0 | 2 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 15 | 0 | 0 | 15 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-03 | F0 (B-03) | 7 — cobertura | `public-dev-server.spec` (plano 20) pede a porta 0, o Vite lê 0 como "sem porta" e cai na 5173 com `strictPort`; o `pnpm dev` do usuário estava nela | `test/support/public-dev-server.mjs` pede uma porta livre ao sistema e a passa ao Vite | 🔄 reiniciado do portão 1 |
| 2 | 2026-10-03 | F0 (B-03) | 7 — cobertura | o `public-dev-server.spec` passou; dois testes pesados do web (`EditorTabs` S-215, `ClaudePanel` S-150) estouraram 15 s com a máquina em carga 25, por um vitest de outro projeto rodando junto. Sozinhos, 39/39 | nenhuma no código: esperar a outra carga terminar e reiniciar do portão 1 (sem subir timeout) | 🔄 reiniciado do portão 1 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-03 | Diagrama como SVG inline sanitizado ([D-02](decisions.md#f0--normas)) | escolha do usuário, contra a recomendação (imagem isolada): texto selecionável e links funcionando | ADR-020, B-16, S-56, R-02 |
| 2026-10-03 | PDF com senha pede a senha ([D-07](decisions.md#f1--leitor-de-pdf)) | escolha do usuário, contra a recomendação (só avisar) | B-09, S-21…S-24 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| — | — | — | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Mermaid no primeiro chunk | 🔲 aberto | — |
| R-02 | XSS pelo SVG inline do diagrama | 🔲 aberto | — |
| R-03 | CSS global do `pdf_viewer.css` | 🔲 aberto | — |
| R-04 | jsdom sem pdf.js nem Mermaid | ✅ aceito | portas com fake; real no e2e |
| R-05 | Efeito duplo do `StrictMode` só em dev | 🔲 aberto | foi a causa do bug da B-03 |
| R-06 | Aviso de segurança em dependência nova | 🔲 aberto | — |
| R-07 | Outras sessões na mesma árvore | 🔲 aberto | — |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
