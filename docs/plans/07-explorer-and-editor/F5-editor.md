# F5 — Editor

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-explorer.md).
**Entrega:** o editor de código na área de editor do workbench — abas (prévia, sujo, fixar, fechar
com confirmação, reabrir, reordenar), grupos lado a lado, salvar / salvar como / salvar todos /
reverter / auto-save com conflito tratado, mudança externa, localizar e substituir, ir para linha,
encoding e fim de linha na status bar, modo arquivo grande, aba de diff, preferências, o arraste para
o chat do Claude, e a ajuda do editor.

## Por quê

É a metade "editar" do pedido, e o lugar onde a perda de trabalho vira visível: o 412 da F2 só
protege se a tela souber o que fazer com ele. Por isso salvar e conflito (B-34) e mudança externa
(B-35) são tasks próprias, e não detalhes das abas.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-31 — O editor, carregado sob demanda ✅

Pela [D-09](decisions.md#d-09--monaco-ou-codemirror-6), depois da medida: chunk próprio, nunca no
bundle inicial; servido pelo nosso build, **nenhum byte de CDN** (o loader configurado com o pacote
local, workers empacotados, CSP ajustada); tema claro/escuro pelos tokens do
[web/03](../../architecture/web/03-ui-system.md#tema). Atrás de uma porta `CodeEditor` na feature
`editor`: componentes e hooks testados em jsdom com um falso que cumpre o mesmo contrato do adaptador
real (conteúdo, sujo, cursor, desfazer), e o editor real no e2e — é o que mantém os 90 % por arquivo
sem excluir ninguém da cobertura. Abaixo de `md`, o modo simplificado da D-09. O que o editor traz de
graça (multicursor, minimap, sticky scroll) entra como está, sem task própria.

### B-32 — Abas de editor ✅

Por aba de pasta (B-06): prévia em itálico (clique simples; o próximo clique simples substitui;
editar ou duplo clique fixa), indicador de sujo, fixar, fechar com Salvar / Não salvar / Cancelar —
o descartar **sem** foco inicial —, fechar outras / à direita / salvas / todas, reabrir a última
fechada (Ctrl+Shift+T), reordenar por arrastar e por teclado; abrir de novo o mesmo arquivo foca a
aba. Muitas abas não geram scroll horizontal da página: há lista de abas. A seção "Editores abertos"
no Explorer; "Abrir recente" no menu **Arquivo** (os arquivos abertos por último naquela aba de
pasta); a trilha de caminho acima do editor navega pelos diretórios da pasta. Arquivo ativo na URL
([web/04](../../architecture/web/04-state-and-data.md#a-url-é-estado)); recarregar restaura pelo
mecanismo do plano 06.

### B-33 — Grupos lado a lado ✅

"Abrir ao lado" cria um segundo grupo (e terceiro); arrastar aba entre grupos; o mesmo arquivo em
dois grupos **compartilha o buffer** — um modelo, duas vistas —, então editar num suja os dois e
salvar num limpa os dois. Fechar a última aba fecha o grupo. Abaixo de `md`, um grupo por vez com
seletor.

### B-34 — Salvar, e o conflito ✅

- Ctrl/Cmd+S com o `ETag` da leitura; um PUT por vez por arquivo (o segundo Ctrl+S espera e vai com o
  `ETag` novo); nada enviado quando não há mudança; o service **nunca** manda PUT sem `If-Match`.
- **412 → diálogo** Comparar (aba de diff disco × buffer) / Sobrescrever (com o `ETag` atual, que o
  412 trouxe — e se o disco mudou de novo, novo 412, nunca às cegas) / Recarregar (descarta).
- 403, 413 e 507 mantêm o buffer sujo, com erro traduzido que diz o que fazer.
- **Salvar como** (`POST /files` com o conteúdo; caminho existente oferece substituir com o `ETag`
  dele), **salvar todos** (Ctrl+K S, relata cada um), **reverter arquivo** (relê do disco).
- **Auto-save** (desligado por padrão; depois de um atraso ou ao perder o foco), respeitando o 412.
- Ao salvar, quando ligados: remover espaço no fim da linha e inserir nova linha final.
- Arquivo sensível ([D-15](decisions.md#d-15--arquivos-que-mudam-a-permissão)): segundo passo que diz
  o que aquele arquivo controla, antes do PUT com `confirmSensitive`.

### B-35 — Quando o disco muda por fora ✅

Com o `filesChanged` da aba de pasta: aba **limpa** recarrega mantendo cursor e rolagem; aba **suja**
mostra um aviso não bloqueante — "o Claude alterou este arquivo" quando `origin: claude`, genérico
sem origem — com Comparar / Recarregar / Manter, e nada é perdido; arquivo **apagado** marca a aba, e
salvar oferece recriar (POST), nunca um PUT silencioso. O eco da nossa própria escrita (`origin: user`
com o nosso `ETag`) não dispara aviso.

### B-36 — Localizar, substituir, ir para linha, desfazer ✅

O localizar/substituir do editor no arquivo (regex, caixa, palavra inteira, só na seleção; regex
inválida avisa inline), ir para linha (Ctrl+G; além do fim vai à última) e desfazer/refazer por aba —
que atravessam um save sem perder passos, e que uma recarga por mudança externa limpa só na aba
recarregada. Os atalhos entram no registro do plano 06. São comportamentos nativos do editor, e por
isso provados no **e2e** (não rodam em jsdom).

### B-37 — Status bar do editor ✅

Na status bar do plano 06, para a aba ativa: linha/coluna, seleção, indentação (converter tabs ↔
espaços), **encoding** (reabrir com encoding, salvar com encoding — `FILE_NOT_ENCODABLE` traduzido
quando não cabe), **fim de linha** (converter LF ↔ CRLF, o que suja a aba) e linguagem de realce
(trocar à mão). Cada item é um botão com tooltip que abre a escolha, e a mesma ação está na palette.

### B-38 — O que não abre no editor, o arquivo grande e o diff ✅

Placeholders com motivo e ação: binário → "abrir em hexadecimal" (F7); acima do teto → tamanho, teto e
"abrir paginado" (F7); sem permissão → o que fazer. Entre o limiar e o teto
([D-04](decisions.md#d-04--teto-de-tamanho-e-encoding)), o **modo leve** — sem minimap, sem folding,
sem realce pesado — e a aba diz isso. A **aba de diff** somente leitura (o diff do editor), usada pelo
conflito, por "comparar selecionados", por "comparar com o salvo" (buffer × disco), e depois pelos
planos 08 (alterações do Claude) e 10 (prévia do substituir).

### B-39 — Preferências do editor ✅

Na seção **Editor** das Configurações do plano 06 (onde cada item mora é a D-13 de lá): fonte e
tamanho, zoom, tamanho da tab e espaços, quebra de linha, minimap, auto-save (desligado por padrão) e
os dois ajustes do save. Valem para todas as abas; armazenamento indisponível → padrões, sem quebrar.

### B-40 — O mesmo arquivo em duas abas de pasta, e a guarda de saída ✅

O caso do usuário com `/r/app` e `/r/app/pkg` abertas: o arquivo aberto nas duas recebe a mudança nas
duas (os dois watches), a limpa recarrega, e das duas sujas a segunda a salvar recebe o 412 — nunca
uma sobrescreve a outra em silêncio. Trocar de aba de pasta e voltar preserva abas, grupos, cursor e
buffer. Pela [D-14](decisions.md#d-14--rascunho-não-salvo-e-a-recarga): recarregar ou fechar a página
com buffer sujo dispara o aviso do navegador, fechar a aba de pasta suja lista os arquivos, e nenhum
conteúdo vai para o armazenamento local.

### B-41 — Usabilidade e ajuda do editor ✅

Gaveta de ajuda do editor em en e pt-BR: os atalhos, o que é prévia, sujo, conflito e mudança
externa, o que o modo leve desliga, por que binário não abre. Atalhos no registro do plano 06 e na
palette com a tecla; área de editor vazia que ensina (abrir da árvore, criar, abrir recente); foco
que volta ao editor ao fechar diálogo; mudar de grupo pelo teclado; axe sem violação no editor, nas
abas e no diálogo de conflito.

### B-42 — Arrastar para o Claude e "Adicionar ao contexto" ✅

A árvore (um item ou a seleção múltipla, pastas incluídas) e as abas de editor são **fonte de
arraste** com o payload tipado da [D-20](decisions.md#d-20--o-que-se-arrasta-para-o-claude) —
`{ folder, entries: [{ path, kind }], selection? }`, caminho relativo à pasta da aba — e `text/plain`
com os caminhos como alternativa. O alvo e os chips de contexto são do
[plano 08](../08-claude-panel/README.md); daqui saem:

- o tipo e a função pura `scopeDragPayload` em `web/src/shared/` — reescopa para a aba de destino o
  que ela contém, recusa o resto (`outsideFolder`) —, que o 08 usa no alvo;
- os itens "Adicionar ao contexto do Claude" no menu da árvore e da aba, e "Adicionar seleção ao
  chat" no menu da seleção do editor (com `range`), registrados com condição: só aparecem quando o
  painel do 08 está registrado;
- a alternativa por teclado (o mesmo comando, por atalho, anunciado por `aria-live`) — arrastar não
  pode ser o único caminho;
- entrada não operável (`unreadableName`, symlink para fora) fica fora do payload, e o item diz por
  quê; pasta vai como `directory`, **sem** expandir o conteúdo.

O arraste é conveniência, não fronteira: o backend valida o caminho no `session.prompt` (plano 08).

---

## Cenários cobertos

S-204…S-279.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
pnpm test:integration
```
