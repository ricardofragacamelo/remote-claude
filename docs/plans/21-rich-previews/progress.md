# Plano 21 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está **concluído** em 2026-10-09: `pnpm verify:full` com os onze portões verdes (ciclo 19); F4 (E2E) com o `rich-previews.spec.ts` 8/8, F0 no ciclo 5, F1 no 8, F2 no 10, F3 pelos portões 1-7 do `verify:full`
**Última atualização:** 2026-10-09
**Bloqueios:** nenhum

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-04 | 4/4 | ✅ |
| [F1](F1-pdf-reader.md) | B-05…B-10 | 6/6 | ✅ |
| [F2](F2-pdf-navigation.md) | B-11…B-14 | 4/4 | ✅ |
| [F3](F3-markdown.md) | B-15…B-19 | 5/5 | ✅ |
| [F4](F4-e2e.md) | B-20…B-23 | 4/4 | ✅ |
| **Total** | **B-01…B-23** | **23/23** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 74 | 0 | 0 | 74 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 17 | 0 | 0 | 17 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-03 | F0 (B-03) | 7 — cobertura | `public-dev-server.spec` (plano 20) pede a porta 0, o Vite lê 0 como "sem porta" e cai na 5173 com `strictPort`; o `pnpm dev` do usuário estava nela | `test/support/public-dev-server.mjs` pede uma porta livre ao sistema e a passa ao Vite | 🔄 reiniciado do portão 1 |
| 2 | 2026-10-03 | F0 (B-03) | 7 — cobertura | o `public-dev-server.spec` passou; dois testes pesados do web (`EditorTabs` S-215, `ClaudePanel` S-150) estouraram 15 s com a máquina em carga 25, por um vitest de outro projeto rodando junto. Sozinhos, 39/39 | nenhuma no código: esperar a outra carga terminar e reiniciar do portão 1 (sem subir timeout) | 🔄 reiniciado do portão 1 |
| 3 | 2026-10-08 | F0 | 6 — unit | `i18n.spec` ("nest no deeper than three segments"): a B-02 pediu `editor.preview.pdf.*`, quatro níveis | as chaves do leitor viram `editor.pdf.*` ([D-16](decisions.md#f0--normas)) | 🔄 reiniciado do portão 1 |
| 4 | 2026-10-08 | F0 | 7 — cobertura | `gates.spec` roda o `i18n:check`, que reprova as 56 chaves novas declaradas e ainda sem uso: a B-02 as punha todas na F0, antes das telas | cada chave entra com a fase que a usa — as do leitor na F1 e na F2, as do diagrama na F3; a F0 fica com as duas da ajuda, que já são usadas ([D-16](decisions.md#f0--normas)) | 🔄 reiniciado do portão 1 |
| 5 | 2026-10-08 | F0 | — | — | — | ✅ `pnpm verify` verde (portões 1-7); `docs:check` e `i18n:check` verdes |
| 6 | 2026-10-08 | F1 | 7 — cobertura | `preview-commands.ts` com 85 % de ramos: o ícone opcional dos comandos do leitor (sempre dado), o contexto só-foco (ainda sem uso na F1) e o comando rodado sem leitor ativo | ícone obrigatório, contextos como lista sem condicional, e o teste unitário dos comandos com e sem leitor | 🔄 reiniciado do portão 1 |
| 7 | 2026-10-08 | F1 | 7 — cobertura | backend, sem relação com o plano (que não toca o backend): `push.flow` S-51 "no frame arrived" (o flake de carga conhecido) e `session-panel.spec` com 409 do Docker ao remover um container ainda de pé; carga 24 de outro projeto | nenhuma no código: reinício do portão 1 | 🔄 reiniciado do portão 1 |
| 8 | 2026-10-08 | F1 | — | — | — | ✅ `pnpm verify` verde (portões 1-7); `i18n:check` verde |
| 9 | 2026-10-08 | F2 | 7 — cobertura | backend, sem relação com o plano: `transcript.adapter.spec` (plano 22, S-27/S-33) afirma que o log não contém `599`, e o carimbo de hora da linha de log saiu `01:39:46.599Z` — flake de relógio do próprio teste, de ~1 em 1000 | nenhuma no código do plano; o flake vai para o relatório | 🔄 reiniciado do portão 1 |
| 10 | 2026-10-08 | F2 | — | — | — | ✅ `pnpm verify` verde (portões 1-7); `i18n:check` verde |
| 11 | 2026-10-08 | F3 | 5 — duplicação | dois clones: o link externo do `Markdown` repetido no da imagem remota, e o objeto de página repetido entre `reader.pdf` e `scripted.pdf` no gerador | `OutsideLink` no `Markdown`, `aPage` no gerador — os PDFs saem com os mesmos bytes (`--check` verde) | 🔄 reiniciado do portão 1 |
| 12 | 2026-10-08 | F3 | 7 — cobertura | `gates.spec` refaz o `lint:dup` sobre a árvore, e achou três clones no `e2e/specs/rich-previews.spec.ts` da F4 — copiado para a árvore pelo agente **durante** a execução, erro de processo | o spec ganha `readerOpen`, `goTo` e `showPanel` (0 clones); arquivo nenhum entra na árvore com portão rodando | 🔄 reiniciado do portão 1 |
| 13 | 2026-10-08 | F4 | 9 — e2e (só o spec do plano) | três defeitos reais e três expectativas do teste: os links externos do PDF sem nome acessível (axe `link-name`: o `<a>` do pdf.js fica sobre o texto, vazio); a prévia rolando de lado — a tabela `width: max-content` alargava o texto inteiro; o zoom pelo teclado partindo de "ajustar à largura", que no e2e é 75 %, não 130 % | o link ganha `title` com o endereço (nome e tooltip); a caixa da tabela e o `pre` ganham `contain: inline-size`; o teste compara com o degrau seguinte de verdade | 🔄 de novo |
| 14 | 2026-10-08 | F4 | 9 — e2e | duas imagens com o mesmo nome: o `<svg>` do Mermaid é uma imagem implícita, nomeada pelo `<title>`, dentro da nossa moldura `role="img"`; e a busca começando da página do índice (o 4 de 4, certo) | a raiz do SVG perde os papéis ARIA e fica `aria-hidden` — a moldura é a imagem; o teste espera o resultado a partir da página 9 | 🔄 de novo |
| 15 | 2026-10-08 | F4 | — | — | — | ✅ `rich-previews.spec.ts`: 8 de 8 |
| 16 | 2026-10-08 | fim do plano | 7 — cobertura | `cli.spec` (`plan.mjs progress`): com as 23 tarefas marcadas, o diário do plano e o histórico geral ainda não diziam "concluído" — a checagem da prosa contra os contadores | a "Fase corrente" e a linha do histórico geral dizem que o plano está concluído | 🔄 reiniciado do portão 1 |
| 17 | 2026-10-09 | fim do plano | 8 — integração | backend, sem relação com o plano: `push.flow` S-51 "no frame arrived" (o flake de carga conhecido; carga 30 de outro projeto). Isolado, passa | nenhuma no código: reinício do portão 1 | 🔄 reiniciado do portão 1 |
| 18 | 2026-10-09 | fim do plano | 7 — cobertura | backend, sem relação com o plano: os 4655 testes passaram, e o Vitest acusou um erro solto — "the request was cut before its end" do `multipart-upload.reader`, disparado depois do `files-upload-api` S-305 (07) terminar; carga 30 de outro projeto | nenhuma no código: reinício do portão 1 | 🔄 reiniciado do portão 1 |
| 19 | 2026-10-09 | fim do plano | — | — | — | ✅ `pnpm verify:full` com os onze portões verdes (e2e completo: 9 em 667 s; segurança: 10 em 19 s) |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-03 | Diagrama como SVG inline sanitizado ([D-02](decisions.md#f0--normas)) | escolha do usuário, contra a recomendação (imagem isolada): texto selecionável e links funcionando | ADR-020, B-16, S-56, R-02 |
| 2026-10-03 | PDF com senha pede a senha ([D-07](decisions.md#f1--leitor-de-pdf)) | escolha do usuário, contra a recomendação (só avisar) | B-09, S-21…S-24 |
| 2026-10-08 | Chaves do leitor em `editor.pdf.*`, cada uma com a fase que a usa ([D-16](decisions.md#f0--normas)) | o catálogo aceita três níveis, e o `i18n:check` do portão 7 reprova chave órfã | B-02, F1, F2, F3 |
| 2026-10-08 | Rótulos do diagrama em texto SVG, sem `<foreignObject>`, sem nada que carregue de fora ([D-17](decisions.md#f3--markdown)) | a segunda camada da ADR-020 fica simples de provar, e a regra da imagem remota vale também para o SVG | ADR-020, B-16, S-56 |
| 2026-10-08 | A memória do leitor é por grupo **e** aba | o id da aba é o do arquivo: o mesmo PDF em dois grupos dividiria a memória (S-26) | B-10 |
| 2026-10-08 | Os atalhos do leitor num contexto próprio (`pdfReader`, `pdfPointer`), e a precedência do contexto mais específico no registro | o `Ctrl+F` do editor (`workbench`) e o do leitor colidem; antes, o primeiro registrado vencia | B-07, B-14, `features/commands` |
| 2026-10-08 | O carregador sob demanda virou um só (`shared/lib/lazy-engine.ts`), para o pdf.js e o Mermaid | dois carregadores iguais seriam duplicação | B-16, 07 · B-50 |

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
| R-01 | Mermaid no primeiro chunk | ✅ fechado | `mermaid` em `PREVIEW_LIBRARIES`; o build real do `editor-bundle.spec` o acha só em chunk lazy (S-67) |
| R-02 | XSS pelo SVG inline do diagrama | ✅ mitigado | três camadas da ADR-020, provadas com DOMPurify de verdade no jsdom (S-56) |
| R-03 | CSS global do `pdf_viewer.css` | ✅ fechado | só no chunk do leitor; axe no navegador sem violação (S-73) |
| R-04 | jsdom sem pdf.js nem Mermaid | ✅ aceito | portas com fake; real no e2e |
| R-05 | Efeito duplo do `StrictMode` só em dev | ✅ fechado | toda integração nova roda em `StrictMode` (`renderEditor(…, { strict: true })`) |
| R-06 | Aviso de segurança em dependência nova | ✅ fechado | o Mermaid trouxe `lodash-es` 4.17.23 e `katex` 0.16.47 com aviso: Mermaid 12.1.0 e `katex ^0.18.2` por override — atualizados, nunca ignorados (S-68) |
| R-07 | Outras sessões na mesma árvore | ✅ sem incidente | nenhuma outra sessão rodou portões aqui; os ciclos 4 e 12 foram arquivos do próprio agente copiados com portão rodando |

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
