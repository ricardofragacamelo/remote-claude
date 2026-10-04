# Plano 21 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Nasceram ao planejar, em 2026-10-03. O usuário respondeu seis delas no mesmo dia (D-02, D-05, D-06,
> D-07, e o escopo do leitor e do Mermaid, que estão no [README](README.md#escopo)). **Duas divergem da
> recomendação** e mudam o plano: D-02 (SVG inline) e D-07 (pedir a senha). As outras foram decididas pelo
> agente com a recomendação, por serem técnicas ou seguirem uma regra que já existe. O usuário pode revê-las.

---

## F0 — Normas

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde o plano entra na sequência | os planos 12, 15 e 20 estão em andamento, talvez em outra sessão; `--at` renumera todos os seguintes | escopo | **2026-10-03 — no fim, como 21** (agente). Não depende dos planos 10…20, e nenhum depende dele. Renumerar com outra sessão escrevendo nos planos seria pedir conflito | ✅ |
| D-02 | Como o diagrama entra na página | o markdown pode vir do modelo (conteúdo não confiável, 08 · R-01); `<img src=blob:>` isola tudo mas o texto não se seleciona e os links não funcionam | B-01, B-16 | **2026-10-03 — SVG inline sanitizado** (usuário; diverge da recomendação, que era imagem isolada). Três camadas: `securityLevel: 'strict'` do Mermaid; um passe do DOMPurify **nosso** (perfil SVG, sem `<script>`, sem `on*`, sem `<iframe>`/`<object>`/`<embed>`, sem `<foreignObject>` que não seja texto); e `<a>` reescrito pela regra do `Markdown` (`http`, `https`, `mailto`, nova aba, `rel="noopener noreferrer nofollow"`). Abre a **ADR-020** (B-01), porque troca a regra da D-18 do 07 ("SVG só por `<img>`") para este caso | ✅ |
| D-03 | De onde vêm os PDFs dos testes | precisamos de PDF com várias páginas, índice, links internos e externos, texto, JavaScript, formulário e senha; o CI não tem LibreOffice | B-04 | **2026-10-03 — gerados por `scripts/pdf-fixtures.mjs` e versionados** (agente). O script escreve o PDF à mão (sintaxe PDF com fonte padrão Helvetica, sem dependência) e cifra a cópia com senha pelo `gs`, quando há; o CI só usa os arquivos versionados, e `--check` confere que o script ainda os reproduz (S-05). Se o `gs` cifrar de forma não determinística, a cópia cifrada fica fora do `--check`, com a razão escrita no script | ✅ |

## F1 — Leitor de PDF

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Leitor do pdf.js ou um nosso | o `pdfjs-dist` 6.3 exporta `PDFViewer`, `EventBus`, `PDFLinkService`, `PDFFindController` em `web/pdf_viewer.mjs`; não exporta miniaturas | B-05 | **2026-10-03 — o do pdf.js** (agente, recomendação). Rolagem virtualizada, zoom, ajustes, texto, links e busca vêm testados pelo Firefox. O `pdf_viewer.css` entra só no chunk do leitor | ✅ |
| D-05 | Zoom inicial | — | B-07 | **2026-10-03 — ajustar à largura** (usuário, recomendação) | ✅ |
| D-06 | O que o leitor lembra | — | B-10 | **2026-10-03 — página, zoom e painel lateral, por aba, em memória** (usuário, recomendação). Somem ao recarregar a página (S-27). Moram no store do editor, ao lado do estado da aba ([web/04](../../architecture/web/04-state-and-data.md#estado-de-aba-de-pasta)) | ✅ |
| D-07 | PDF com senha | o pdf.js pede a senha por `onPassword` (`NEED_PASSWORD`, `INCORRECT_PASSWORD`) | B-09 | **2026-10-03 — pedir a senha** (usuário; diverge da recomendação, que era só avisar). A senha vive só no estado do componente e no `getDocument`: nunca em log (nem em `debug`), URL, `localStorage`, store persistido ou requisição ao backend. Cancelar mostra "protegido por senha", com "tentar de novo" | ✅ |
| D-08 | Que links do PDF viram link | o `PDFLinkService` aceita `http`, `https`, `ftp`, `mailto` e `tel` | B-08 | **2026-10-03 — a regra do `Markdown`: `http`, `https` e `mailto`**, em nova aba com `rel="noopener noreferrer nofollow"` (agente; regra que já existe em [web/03](../../architecture/web/03-ui-system.md#stream-de-mensagens)). `ftp` e `tel` ficam sem link | ✅ |
| D-09 | Degraus e limites do zoom | — | B-07 | **2026-10-03 — de 25 % a 500 %, degraus 25, 50, 75, 100, 125, 150, 200, 300, 400, 500** (agente; os do Firefox, aparados) | ✅ |

## F2 — Navegação no PDF

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Onde o `Ctrl+F` vale | o Monaco tem a busca própria; o workbench tem o `Ctrl+Shift+F` do plano 11; o navegador tem a dele | B-14 | **2026-10-03 — só com o foco no leitor** (agente). Ali ele abre a busca do PDF e não deixa o navegador abrir a dele (a dele não acha texto na camada virtualizada). Fora do leitor, nada muda. A F0 confere o registro de atalhos e põe o comando nele, com o rótulo | ✅ |
| D-11 | Miniaturas: de onde, e o painel em prévia estreita | o `pdf_viewer.mjs` não exporta o `PDFThumbnailViewer` | B-11, B-13 | **2026-10-03 — nossas** (agente): o `renderPage` da porta, com o `AbortSignal` da B-03, em escala pequena, só perto da vista (`IntersectionObserver`), no máximo dois desenhos ao mesmo tempo. Abaixo de **480 px** de largura da prévia, o painel abre por cima do leitor | ✅ |

## F3 — Markdown

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | O layout da tabela | o que "quebra" quer dizer: as 32 tabelas do arquivo que o usuário mostrou são lidas certo pelo `remark-gfm`; o defeito é de layout (sem caixa que role, sem padding vertical, token sem espaço alargando a tabela) | B-15 | **2026-10-03 — o molde do GitHub** (agente): a tabela numa caixa que rola na horizontal, `max-width: 100%`, células com padding nas duas direções, alinhadas ao topo, cabeçalho com fundo `muted`, linhas alternadas e quebra de token longo dentro da célula. Se o usuário apontar outra quebra, ela vira cenário | ✅ |
| D-13 | Teto da fonte de um diagrama | o Mermaid desenha na thread principal; uma fonte enorme trava a aba | B-17 | **2026-10-03 — 20 000 caracteres** (agente), também passados como `maxTextSize`. Acima disso, o bloco fica como código, com o aviso (S-57) | ✅ |
| D-14 | Diagrama durante o streaming | a cerca aberta do delta muda a cada token; desenhar cada versão pisca erro | B-18 | **2026-10-03 — só a cerca fechada desenha** (agente). Aberta é código; o fechamento é lido da posição do bloco no texto | ✅ |

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-15 | Como o e2e põe um diagrama numa resposta do Claude | o SDK do e2e é um replay roteirizado (`e2e/scenarios/*.json`) | B-22 | **2026-10-03 — um cenário novo, `rich-previews.json`** (agente), com uma resposta que traz uma tabela e um bloco `mermaid` | ✅ |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
