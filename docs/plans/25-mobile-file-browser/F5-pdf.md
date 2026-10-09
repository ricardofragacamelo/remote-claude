# F5 — PDF

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-text-viewer.md), e das decisões [D-06](decisions.md#f0--spike-dos-motores) e
[D-22](decisions.md#f5--pdf) (fechadas na F0).
**Entrega:** o PDF abre num leitor de rolagem corrida, com pinça, duplo toque e arrasto, "página N de
M" e "ir para a página"; links seguem a regra do markdown; PDF com senha pede a senha.

Leia antes: [mobile/04](../../architecture/mobile/04-ui.md) e o "Não entra" do
[plano 21](../21-rich-previews/README.md) (formulários e JavaScript do PDF desligados, como no web).

F4, F5 e F6 dependem só da F3, e podem correr em qualquer ordem entre si.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-23 — O motor de PDF ✅

`data/ports/pdf_engine.dart`, a porta, e o adaptador sobre o `pdfrx` (se a D-06 confirmar), com os
bytes pelo caminho da [D-22](decisions.md#f5--pdf) — em memória pelo `ApiClient.bytes`, ou por URI com
o Bearer no cabeçalho e `Range`. Formulários e JavaScript desligados. PDF corrompido vira falha, e o
leitor mostra o erro (o **baixar** entra na [F6](F6-download.md)). O fake da porta serve os testes de
widget; o motor de verdade só roda no e2e (R-06).

Como ficou ([D-22](decisions.md#f5--pdf), [D-27](decisions.md#f4--markdown-e-mermaid)): a porta `PdfEngine`
devolve um widget, então ela e o adaptador `pdfrx` moram em `presentation/engines/`; os bytes vêm por
`domain/ports/byte_reader.dart`, cujo adaptador `data/datasources/remote_byte_reader.dart` pede
`GET /files/raw` com `Range` de blocos de 1 MB pelo `ApiClient.bytesRange` e guarda os últimos 8. O
`pdfrx` abre por `PdfDocument.openCustom`, com as anotações sem formulário
(`PdfAnnotationRenderingMode.annotation`); o PDFium não executa JavaScript. O tipo que o servidor leu
dos bytes confirma o PDF antes do motor (S-48).

### B-24 — O leitor ✅

`widgets/viewers/pdf_viewer.dart`: rolagem corrida, o zoom do motor (pinça e duplo toque), arrasto
livre, "página N de M" e "ir para a página" com a entrada validada. Links do PDF pela regra da
[B-20](F4-markdown.md#b-20--links-e-imagens-) — se a F4 ainda não existir, a regra de esquema e a
confirmação saem dela para `files/presentation` e as duas fases a usam. Índice e miniaturas ficam
fora.

### B-25 — A senha ✅

PDF com senha pede a senha numa folha. Errada, diz isso e pede de novo; cancelar deixa o estado
"protegido por senha", com "digitar a senha". A senha não é guardada nem logada — o teste captura o
log e procura por ela (S-118).

---

## Cenários cobertos

S-107…S-118.

---

## Critério de conclusão

```bash
pnpm verify
```
