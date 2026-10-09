# F2 — Navegação no PDF

Plano: [21 — Rich previews](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-pdf-reader.md).
**Entrega:** o painel lateral do leitor, com o índice do PDF e as miniaturas, e a busca no texto.

**Decisões que precisam estar fechadas para começar:** D-10, D-11 ([decisions.md](decisions.md#f2--navegação-no-pdf)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-11 — O painel lateral ✅

Um botão na barra abre e fecha o painel, com duas abas: índice e miniaturas. Ele abre no índice quando o PDF
tem um, e nas miniaturas quando não tem. Abaixo de 480 px de largura da prévia
([D-11](decisions.md#f2--navegação-no-pdf)), o painel abre por cima do leitor e fecha depois de navegar. O
estado (aberto, aba) é o da [B-10](F1-pdf-reader.md).

### B-12 — O índice ✅

`getOutline()` vira uma árvore `role="tree"`, com expandir e recolher e a navegação do padrão WAI-ARIA (setas,
Home, End, Enter), com só o primeiro nível aberto. Clicar ou Enter vai ao destino pelo `PDFLinkService`.
Destino quebrado loga `warn` e não navega (S-35). Sem índice, a aba diz isso (S-36).

### B-13 — As miniaturas ✅

Uma lista de miniaturas com o número da página. Cada uma se desenha pelo `renderPage` da porta, com o
`AbortSignal` da [B-03](F0-norms.md), só quando chega perto da vista (`IntersectionObserver`), e o desenho se
cancela quando ela sai. No máximo dois desenhos ao mesmo tempo, numa fila. A miniatura da página atual fica
marcada e rola junto. Desenho que falha mostra o número no lugar (S-41).

### B-14 — A busca ✅

`Ctrl+F` com o foco no leitor ([D-10](decisions.md#f2--navegação-no-pdf)), e um botão na barra, abrem a
barra de busca com o campo focado. O `PDFFindController` acha e destaca, e a contagem "*n* de *m*" vem do
`updatefindmatchescount`. Enter vai ao próximo e Shift+Enter ao anterior, dando a volta. Há os botões
"diferenciar maiúsculas" e "palavra inteira". Esc fecha e limpa o destaque, e reabrir traz a última busca.
A contagem que chega de uma busca já trocada é descartada (S-48). O comando entra no registro de atalhos, com
o rótulo traduzido.

---

## Cenários cobertos

S-31…S-49.

---

## Critério de conclusão

```bash
pnpm verify
```
