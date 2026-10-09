# F1 — Leitor de PDF

Plano: [21 — Rich previews](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md).
**Entrega:** a prévia de PDF vira um leitor: todas as páginas numa rolagem, indicador e "ir para a página",
zoom e ajustes, texto selecionável, links, PDF com senha, e a posição lembrada por aba.

**Decisões que precisam estar fechadas para começar:** D-04…D-09 ([decisions.md](decisions.md#f1--leitor-de-pdf)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-05 — O leitor do pdf.js atrás de uma porta ✅

A porta de [types/pdf.ts](../../../web/src/features/editor/types/pdf.ts) ganha o **leitor**: montar num
contêiner, ir a uma página ou a um destino, mudar a escala (número, `page-width`, `page-fit`, `auto`), buscar,
ler o índice, e avisar página, escala e resultados da busca por callback. O adapter (`lib/pdfjs-viewer.ts`)
monta o `PDFViewer` de `pdfjs-dist/web/pdf_viewer.mjs` com `EventBus` e `PDFLinkService`, camada de texto
ligada, anotações sem formulário (`AnnotationMode.ENABLE`), sem scripting, e o `getDocument` com XFA desligado,
como hoje. O `pdf_viewer.css` é importado pelo adapter, que só um `import()` alcança.

O `destroy` solta o leitor e o documento, e desliga os callbacks (S-07, S-30). O fake de jsdom implementa a
mesma porta, e os testes de integração rodam dentro de `<StrictMode>` (R-05).

### B-06 — Leitura corrida ✅

O `PdfReader` substitui o `Pages` de página única. A barra tem o campo da página ("*n* de *m*", editável, Enter
vai), anterior e próxima. A rolagem é a do pdf.js. Home e End e as setas funcionam com o foco no leitor.
"Ir para a página" fora do intervalo não vai e devolve o número atual (S-09).

### B-07 — Zoom e ajustes ✅

Diminuir, aumentar e um seletor com "automático", "ajustar à largura", "ajustar à página" e os degraus da
[D-09](decisions.md#f1--leitor-de-pdf). `Ctrl+=`, `Ctrl+-`, `Ctrl+0` (volta à largura) e `Ctrl`+roda, com o
foco ou o ponteiro no leitor, e com `preventDefault` para o navegador não dar zoom na página inteira. O ajuste
escolhido se recalcula quando a prévia muda de tamanho (`ResizeObserver`); um percentual fica fixo. Começa em
"ajustar à largura" ([D-05](decisions.md#f1--leitor-de-pdf)).

### B-08 — Texto e links ✅

A camada de texto do pdf.js deixa selecionar e copiar. Link interno navega pelo `PDFLinkService`. Link externo
passa pela regra do `Markdown` ([D-08](decisions.md#f1--leitor-de-pdf)): o adapter estende o
`addLinkAttributes` e reusa o `kindOfUrl` de `shared/components/markdown/safe-url.ts` (sem segunda regra, que
o `lint:dup` pegaria). O que não passa fica sem `href`.

### B-09 — PDF com senha ✅

O `PdfEngine.open` aceita quem responde à senha. O `usePdf` traduz o `onPassword` do pdf.js num estado
`password` (`needed` ou `incorrect`), e o `PdfPassword` pede a senha num campo `type="password"`. A senha vai
direto ao `updatePassword`, sem passar por store, log nem URL ([D-07](decisions.md#f1--leitor-de-pdf)).
Cancelar mostra "protegido por senha", com "tentar de novo". Enviar fica desligado enquanto há tentativa em
voo (S-24).

### B-10 — O leitor lembra, por aba ✅

Página, escala (o modo ou o número) e painel lateral (aberto e qual aba) moram no store do editor, por id de
aba, em memória ([D-06](decisions.md#f1--leitor-de-pdf)). Voltar à aba restaura depois do `pagesinit`.
Recarregar a página recomeça (S-27). Se o arquivo mudar no disco, a prévia recarrega e fica na mesma página,
ou na última, se ela não existir mais (S-28).

---

## Cenários cobertos

S-06…S-30.

---

## Critério de conclusão

```bash
pnpm verify
```
