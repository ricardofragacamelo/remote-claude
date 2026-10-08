# F0 — Spike dos motores

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** os motores de markdown, PDF e Mermaid e o teto de texto escolhidos **com medida** no
emulador; as [D-06, D-09, D-10 e D-22](decisions.md#f0--spike-dos-motores) decididas; a tabela de
medidas no [progress.md](progress.md).

**Por quê primeiro:** as fases F3 a F5 dependem de três escolhas que não se fazem lendo documentação —
se o `merman` desenha como o `mermaid.js`, se o `pdfrx` lê por intervalo com o Bearer no cabeçalho, e
quanto texto o celular aguenta. Escolher depois de escrever o leitor obrigaria a reescrevê-lo.

O código do spike vive **fora da árvore** ([D-23](decisions.md#f0--spike-dos-motores)): um app
mínimo, descartável, no emulador API 35 (o mesmo do `run-e2e-local`).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — PDF e markdown 🔲

- **`pdfrx`:** abrir um PDF de 50 MB pelos dois caminhos da [D-22](decisions.md#f5--pdf) — da memória
  (os bytes do `ApiClient.bytes`) e por URI com `Authorization` no cabeçalho, contra um `/files/raw` de
  verdade, conferindo no log do backend se chegam pedidos com `Range`. Medir o tempo até a primeira
  página e o pico de memória nos dois. Abrir um PDF com senha.
- **`flutter_markdown_plus`:** um markdown com `<script>`, `<img onerror>`, `<a href>`, link relativo,
  link externo, imagem relativa e remota, e tabela larga. Conferir que nenhum HTML vira elemento, que
  todo `href` passa por um callback nosso e todo `src` por um builder nosso.
- **`flutter test`:** com os dois pacotes no `pubspec.yaml`, um teste de widget com a porta fake passa
  sem carregar o PDFium (S-03).
- O APK por ABI antes e depois dos dois pacotes.

### B-02 — Mermaid: `merman` × WebView 🔲

Os mesmos oito diagramas — fluxograma, sequência, classe, estado, ER, Gantt, pizza e mindmap —, mais
um inválido, um acima do teto e um que passa do *timeout*, desenhados:

- pelo **`merman`** (FFI), pedindo PNG na densidade da tela;
- por um **WebView fora da tela** com o `mermaid.min.js` como asset, CSP `default-src 'none'`,
  navegação bloqueada e `securityLevel: 'strict'`, devolvendo SVG ou PNG por um único canal;
- e pelo `mermaid.js` no navegador, como referência.

Comparar lado a lado (capturas no `progress.md`), medir o primeiro desenho e o seguinte, e o APK por
ABI de cada motor. Conferir também se o SVG do Mermaid desenha no `flutter_svg` (o `<style>` com
classes e o `<foreignObject>` dos rótulos), para saber se o caminho SVG existe ou se é sempre PNG.

### B-03 — Texto grande 🔲

Um leitor mínimo com linhas virtualizadas (`ListView.builder` por linha lógica), abrindo pelo
`/files/content` texto de 1, 5 e 10 MB e uma linha única de 1 MB, com a quebra ligada e desligada.
Medir o tempo de abertura e o pico de memória. É o que decide o teto do app ([D-09](decisions.md#f0--spike-dos-motores)).

### B-04 — O registro 🔲

- As D-06, D-09, D-10 e D-22 viram ✅ em [decisions.md](decisions.md), com o número que as decidiu.
- A tabela de medidas (tempos, memória, APK, capturas dos diagramas) no [progress.md](progress.md).
- Se a D-10 escolher o WebView: uma ADR em [00-decisions](../../architecture/shared/00-decisions.md)
  que delimita o uso — fora da tela, sem rede, sem navegação, só o asset local — e a seção "WebView é
  proibida" do [mobile/07](../../architecture/mobile/07-auth.md#webview-é-proibida) aponta para ela,
  dizendo que a proibição é de login (R-14). E a [D-20](decisions.md#f4--markdown-e-mermaid) ganha a
  fonte da versão.
- As fases F3 a F5 conferidas contra o resultado: o que o spike mudou entra no `progress.md`, em
  "Decisões tomadas durante a execução".

---

## Cenários cobertos

S-01…S-07.

---

## Critério de conclusão

```bash
pnpm verify          # a árvore não ganha código; o portão prova que os documentos e os links seguem verdes
pnpm plan progress   # as quatro decisões fechadas aparecem no contador
```
