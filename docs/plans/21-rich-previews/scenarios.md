# Plano 21 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Erro esperado.** Este plano não cria código de erro nem toca o backend. O PDF chega pelo `GET
/files/raw` do 07, cujos erros já estão no
[catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) e na prévia
(S-29). Um `err` com `—` é recusa do próprio cliente: arquivo que o motor não lê, senha errada, diagrama
inválido, URL fora da regra, ou um portão que reprova.

---

## Normas e base — B-01…B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `web/03` descreve o leitor de PDF, as tabelas e os diagramas; a ADR-020 existe e está indexada; `docs:check` verde | eq | unit | — | B-01 | ✅ |
| S-02 | toda chave nova existe em `en` e `pt-BR`; a chave cujo uso saiu (`pdfPrevious`, `pdfNext`) sai dos dois; chave órfã ou literal reprova o `i18n:check` | err | unit | — | B-02 | ✅ |
| S-03 | a página 1 ainda em desenho quando a 2 é pedida, e a 2 quando a 3 é: os dois desenhos são cancelados, a tela não diz que falharam, e o canvas fica livre para o seguinte (o efeito duplo do `StrictMode` é o mesmo caso) | conc | integração | — | B-03 | ✅ |
| S-04 | desenho abandonado enquanto a página era buscada não desenha; abandonado no meio do `render()` cancela e resolve; falha própria é repassada, e abortar depois dela não cancela nada | est | unit | — | B-03 | ✅ |
| S-05 | `scripts/pdf-fixtures.mjs` gera os PDFs de teste byte a byte iguais aos versionados (rodar duas vezes não muda nada), e `--check` reprova fixture divergente | idem | unit | — | B-04 | ✅ |

## Leitor de PDF — B-05…B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | o adapter monta o `PDFViewer` com `EventBus`, `PDFLinkService`, camada de texto ligada, anotações sem formulário, scripting e XFA desligados; `destroy` solta o documento e o leitor | eq | unit | — | B-05 | ✅ |
| S-07 | os eventos do pdf.js (`pagechanging`, `scalechanging`, `pagesinit`) viram callbacks da porta; depois do `destroy`, nenhum callback chega | est | unit | — | B-05 | ✅ |
| S-08 | todas as páginas numa rolagem só; o indicador "página *n* de *m*" acompanha a rolagem | eq | integração | — | B-06 | ✅ |
| S-09 | "ir para a página": 1 e *m* vão; 0, *m*+1, vazio e texto não vão, e o campo volta à página atual | fron | integração | — | B-06 | ✅ |
| S-10 | PDF de uma página: "1 de 1", anterior e próxima desligados | fron | integração | — | B-06 | ✅ |
| S-11 | na primeira página "anterior" desliga, na última "próxima" desliga; Home e End vão às pontas com o foco no leitor | fron | integração | — | B-06 | ✅ |
| S-12 | aumentar e diminuir passam pelos degraus da [D-09](decisions.md#f1--leitor-de-pdf); em 25 % "diminuir" desliga, em 500 % "aumentar" desliga | fron | integração | — | B-07 | ✅ |
| S-13 | "ajustar à largura", "à página", "automático" e os percentuais pelo seletor; redimensionar o painel recalcula o ajuste escolhido, e um percentual fica fixo | est | integração | — | B-07 | ✅ |
| S-14 | `Ctrl+=`, `Ctrl+-`, `Ctrl+0` e `Ctrl`+roda dão zoom no leitor com o foco ou o ponteiro nele, e não no navegador; fora do leitor, nada muda | eq | integração | — | B-07 | ✅ |
| S-15 | o zoom mantém à vista a página em que se estava | est | e2e | — | B-07 | ✅ |
| S-16 | ao abrir, o zoom é "ajustar à largura" ([D-05](decisions.md#f1--leitor-de-pdf)) | eq | integração | — | B-07 | ✅ |
| S-17 | o texto da página se seleciona e se copia | eq | e2e | — | B-08 | ✅ |
| S-18 | link interno (destino nomeado e explícito) leva à página do destino | eq | e2e | — | B-08 | ✅ |
| S-19 | link externo `http`, `https` e `mailto` abre em nova aba com `rel="noopener noreferrer nofollow"`; `javascript:`, `file:`, `ftp:`, `tel:` e `data:` não viram link | err | unit | — | B-08 | ✅ |
| S-20 | PDF com JavaScript e campos de formulário: nenhum script roda, e os campos não são interativos | err | unit | — | B-05 | ✅ |
| S-21 | PDF com senha: o leitor pede; a senha certa abre; a senha não aparece em log, URL, `localStorage` nem no backend | eq | integração | — | B-09 | ✅ |
| S-22 | senha errada: diz que está errada, pede de novo, e o campo vem limpo | err | integração | — | B-09 | ✅ |
| S-23 | cancelar o pedido de senha: "protegido por senha", com "tentar de novo"; tentar de novo pede outra vez | est | integração | — | B-09 | ✅ |
| S-24 | enviar a senha duas vezes seguidas faz uma tentativa só | idem | integração | — | B-09 | ✅ |
| S-25 | trocar de aba e voltar devolve página, zoom e painel lateral | est | integração | — | B-10 | ✅ |
| S-26 | dois PDFs em abas diferentes, e o mesmo PDF em dois grupos, guardam cada um o seu estado | conc | integração | — | B-10 | ✅ |
| S-27 | recarregar a página recomeça: página 1, ajustar à largura, painel fechado ([D-06](decisions.md#f1--leitor-de-pdf)) | est | integração | — | B-10 | ✅ |
| S-28 | o PDF muda no disco com a aba aberta: o leitor recarrega e fica na mesma página; se ela não existe mais, vai para a última | fron | integração | — | B-10 | ✅ |
| S-29 | PDF corrompido e chunk do leitor que não chegou continuam dizendo o porquê, com "tentar de novo" (07 · B-50) | err | integração | `NETWORK_UNREACHABLE` | B-05 | ✅ |
| S-30 | fechar a prévia durante o carregamento ou o desenho solta o documento, e nada chega depois | conc | integração | — | B-05 | ✅ |

## Navegação no PDF — B-11…B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-31 | o botão do painel abre e fecha; abre no índice quando o PDF tem um, e nas miniaturas quando não tem | eq | integração | — | B-11 | ✅ |
| S-32 | prévia estreita (abaixo da largura da [D-11](decisions.md#f2--navegação-no-pdf)): o painel abre por cima do leitor e fecha depois de navegar | fron | integração | — | B-11 | ✅ |
| S-33 | o índice é uma árvore com expandir e recolher; setas, Home, End e Enter navegam pelo teclado (`role="tree"`) | eq | integração | — | B-12 | ✅ |
| S-34 | clicar num item do índice leva ao destino | eq | e2e | — | B-12 | ✅ |
| S-35 | item do índice com destino quebrado não navega, loga `warn` e não derruba o leitor | err | unit | — | B-12 | ✅ |
| S-36 | PDF sem índice: a aba do índice diz que não há, sem árvore vazia | fron | integração | — | B-12 | ✅ |
| S-37 | índice com 500 itens e 6 níveis: desenha, com só o primeiro nível aberto | fron | unit | — | B-12 | ✅ |
| S-38 | miniaturas só se desenham perto da vista; rolada para longe, a miniatura em desenho é cancelada | conc | integração | — | B-13 | ✅ |
| S-39 | a miniatura da página atual fica marcada e à vista enquanto se lê | est | integração | — | B-13 | ✅ |
| S-40 | clicar numa miniatura leva à página | eq | e2e | — | B-13 | ✅ |
| S-41 | miniatura que não desenha mostra o número da página no lugar | err | integração | — | B-13 | ✅ |
| S-42 | no máximo dois desenhos de miniatura ao mesmo tempo, os outros em fila | conc | unit | — | B-13 | ✅ |
| S-43 | `Ctrl+F` com o foco no leitor abre a busca com o campo focado; fora do leitor, não é interceptado | eq | integração | — | B-14 | ✅ |
| S-44 | digitar acha, conta "*n* de *m*" e destaca; Enter vai à próxima, Shift+Enter à anterior, e dá a volta nas pontas | eq | e2e | — | B-14 | ✅ |
| S-45 | sem resultado diz "nenhum resultado"; campo vazio limpa o destaque | fron | integração | — | B-14 | ✅ |
| S-46 | "diferenciar maiúsculas" e "palavra inteira" mudam o resultado | eq | unit | — | B-14 | ✅ |
| S-47 | Esc fecha e limpa o destaque; reabrir traz a última busca selecionada | est | integração | — | B-14 | ✅ |
| S-48 | digitar rápido: só a contagem da última busca aparece | conc | unit | — | B-14 | ✅ |
| S-49 | PDF sem texto (página escaneada): a busca diz "nenhum resultado", sem erro | fron | integração | — | B-14 | ✅ |

## Markdown — B-15…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-50 | tabela de 7 colunas com células longas rola na própria caixa; a prévia e a página não rolam na horizontal | fron | e2e | — | B-15 | ✅ |
| S-51 | texto longo de célula quebra linha; um token sem espaço (caminho, URL) não alarga a tabela além da caixa | fron | e2e | — | B-15 | ✅ |
| S-52 | o alinhamento de `:---:` e `---:` é respeitado; o cabeçalho tem o estilo próprio; `\|` dentro da célula fica texto | eq | unit | — | B-15 | ✅ |
| S-53 | a tabela numa resposta do Claude e no plano para aprovar tem o mesmo layout | eq | integração | — | B-15 | ✅ |
| S-54 | o Mermaid carrega sob demanda, uma vez por página; uma carga que falhou é esquecida, e tentar de novo carrega | idem | unit | `NETWORK_UNREACHABLE` | B-16 | ✅ |
| S-55 | cinco diagramas pedidos juntos desenham um por vez, todos, e cada um recebe o seu SVG | conc | unit | — | B-16 | ✅ |
| S-56 | as três camadas da ADR-020: `securityLevel: 'strict'`; o DOMPurify remove `<script>`, `on*`, `<foreignObject>` com script e `<iframe>`; `<a>` só `http`, `https` e `mailto`, em nova aba com `rel` | err | unit | — | B-16 | ✅ |
| S-57 | fonte acima do teto da [D-13](decisions.md#f3--markdown) não é desenhada: fica como código, com "grande demais para desenhar" | fron | unit | — | B-17 | ✅ |
| S-58 | bloco `mermaid` válido vira SVG inline com nome acessível (o `accTitle` do diagrama, ou "Diagrama") e texto selecionável | eq | integração | — | B-17 | ✅ |
| S-59 | bloco `mermaid` inválido: mensagem traduzida com a linha do erro, e o código-fonte à vista; nenhuma exceção escapa | err | integração | — | B-17 | ✅ |
| S-60 | "ver código" e "ver diagrama" alternam; "copiar" copia a fonte | eq | integração | — | B-17 | ✅ |
| S-61 | `Mermaid` em maiúscula e cerca com texto depois do nome (` ```mermaid title `) também desenham; `mermaidx` não | fron | unit | — | B-17 | ✅ |
| S-62 | na resposta em voo, a cerca aberta é código; quando ela fecha, vira diagrama, desenhado uma vez | est | integração | — | B-18 | ✅ |
| S-63 | delta que chega depois do diagrama não o redesenha | idem | integração | — | B-18 | ✅ |
| S-64 | trocar o tema claro ↔ escuro redesenha o diagrama no tema | est | integração | — | B-18 | ✅ |
| S-65 | dois diagramas com a mesma fonte no mesmo texto: ids únicos, os dois desenhados, sem estilo vazando de um para o outro | conc | integração | — | B-17 | ✅ |
| S-66 | o diagrama desenha na prévia, na resposta do Claude e no plano para aprovar | eq | integração | — | B-17 | ✅ |
| S-67 | o `editor-bundle` reprova o build que puser `mermaid` no primeiro chunk | err | unit | — | B-19 | ✅ |
| S-68 | `scan:security` verde com as dependências novas | err | unit | — | B-19 | ✅ |

## E2E — B-20…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-69 | abrir o PDF de fixture pela árvore, ler rolando até a última página, e o indicador acompanha | eq | e2e | — | B-20 | ✅ |
| S-70 | o PDF com senha: errada diz que está errada, a certa abre | err | e2e | — | B-20 | ✅ |
| S-71 | diagrama na prévia de markdown: SVG de tamanho real, com o texto do diagrama | eq | e2e | — | B-22 | ✅ |
| S-72 | diagrama na resposta do Claude (cenário roteirizado) desenhado quando a mensagem completa | est | e2e | — | B-22 | ✅ |
| S-73 | axe sem violação no leitor com painel e busca abertos, e na prévia com tabela e diagrama | eq | e2e | — | B-23 | ✅ |
| S-74 | só pelo teclado: abrir o painel, andar pelo índice, buscar, dar zoom | eq | e2e | — | B-23 | ✅ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas (B-01, B-02) | conc, est | documento e chave i18n não têm estado nem concorrência; o `i18n:check` e o `docs:check` são determinísticos |
| PDFs de fixture (B-04) | conc, est | o script roda uma vez, sozinho, sem estado entre execuções além dos arquivos que ele confere (S-05) |
| Tabelas (B-15) | conc, est, idem | tabela é marcação sem estado; o redesenho a cada delta é o do `Markdown` de hoje (08 · B-14) |
| E2E (B-20…B-23) | conc, idem | a concorrência e a idempotência são provadas no nível em que se controlam (S-03, S-24, S-38, S-42, S-48, S-55, S-63); no navegador seriam timing, isto é, flaky |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
