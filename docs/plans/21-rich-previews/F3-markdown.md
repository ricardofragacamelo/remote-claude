# F3 — Markdown

Plano: [21 — Rich previews](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md). Não depende da F1 nem da F2: pode rodar antes delas, se convier.
**Entrega:** tabelas que não quebram o layout, e o bloco `mermaid` como diagrama, em todo `Markdown`: a
prévia do editor, a resposta do Claude e o plano para aprovar.

**Decisões que precisam estar fechadas para começar:** D-02, D-12, D-13, D-14 ([decisions.md](decisions.md#f3--markdown)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-15 — Tabelas que não quebram 🔲

O `Markdown` passa a desenhar `table` dentro de uma caixa que rola na horizontal e tem `max-width: 100%`.
As células ganham padding nas duas direções e alinhamento ao topo, o cabeçalho ganha fundo `muted`, as linhas
se alternam, e o token longo quebra dentro da célula ([D-12](decisions.md#f3--markdown)). O alinhamento das
colunas do GFM é mantido. Tudo por token de tema, sem cor literal.

### B-16 — O Mermaid sob demanda, em fila, sanitizado 🔲

`mermaid-loader.ts` carrega o motor por `import()`, uma vez por página, e esquece a carga que falhou (o molde
do `pdf-loader`). `mermaid-engine.ts` inicializa com `startOnLoad: false`, `securityLevel: 'strict'`,
`maxTextSize` da [D-13](decisions.md#f3--markdown) e o tema da vez. Ele desenha **um diagrama por vez** (o
`mermaid.render` não é reentrante) e passa o SVG pelo DOMPurify, perfil SVG, sem `<script>`, `on*`,
`<iframe>`, `<object>` nem `<embed>`. Os `<a>` são reescritos pela regra do `Markdown`
([D-02](decisions.md#f0--normas), ADR-020). Devolve o SVG sanitizado, ou o erro com a linha.

### B-17 — O bloco `mermaid` como diagrama 🔲

No `Markdown`, antes do `renderCode` do hospedeiro: cerca cuja primeira palavra é `mermaid` (sem diferenciar
maiúsculas) e que está fechada vira `MermaidDiagram`. Acima do teto, fica como código, com o aviso. O
`MermaidDiagram` mostra o SVG inline com `role="img"` e o nome acessível (o `accTitle` ou "Diagrama"), os
botões "ver código" / "ver diagrama" e "copiar", e o erro traduzido com a linha e a fonte à vista. Ids únicos
por instância (`useId`), para dois diagramas iguais não dividirem estilo (S-65). Vale na prévia, no chat e no
plano para aprovar, porque os três usam o mesmo `Markdown` (S-66).

### B-18 — Streaming e tema 🔲

Só a cerca fechada desenha ([D-14](decisions.md#f3--markdown)): um plugin remark marca o bloco de código cuja
cerca de fechamento existe no texto. O diagrama é memorizado pela fonte e pelo tema, então o delta que chega
depois não o redesenha (S-63). Trocar o tema redesenha (S-64).

### B-19 — Os portões que veem o Mermaid 🔲

`mermaid` entra em `PREVIEW_LIBRARIES` do [editor-bundle](../../../scripts/lib/editor-bundle.mjs), com teste
que reprova o primeiro chunk que o contiver (S-67). `pnpm scan:security` verde com as dependências novas
(S-68). Aviso sem versão corrigida segue a [ADR-019](../../architecture/shared/00-decisions.md#adr-019--aviso-de-dependência-sem-versão-corrigida-exceção-datada-por-adr),
nunca supressão.

---

## Cenários cobertos

S-50…S-68.

---

## Critério de conclusão

```bash
pnpm verify
```
