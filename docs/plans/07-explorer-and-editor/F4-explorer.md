# F4 — Explorer

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-file-watch.md).
**Entrega:** a view Explorer do workbench — a árvore da pasta aberta com expansão preguiçosa,
virtualização e teclado do padrão ARIA tree; todas as funções de arquivo (criar, criar a partir de
modelo, renomear, mover, copiar/colar, duplicar, apagar, copiar caminho, revelar, comparar), em lote
e com desfazer; atualização viva; os fatos de arquivo na Auditoria; e a ajuda da view.

## Por quê

A árvore é a porta de entrada do pedido do usuário ("listar pastas e arquivos"). Ela vem antes do
editor porque o editor abre **a partir dela**, e porque todas as funções de arquivo moram nela — o
editor da F5 só as reusa (salvar como, revelar, comparar).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-24 — A feature `explorer`: service, hooks e store por aba 🔲

`web/src/features/explorer/`, na cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md#os-quatro-elos)): o service sobre as rotas do
`files`; os diretórios são **dado do servidor** no TanStack Query, com chave por pasta + caminho
([web/04](../../architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só)), pedidos só
ao expandir; a expansão, a seleção e a pilha de desfazer num store **por aba de pasta** (B-06), nunca
global — `/r/app` e `/r/app/pkg` abertas lado a lado não compartilham nada. Os quatro estados de tela
([web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre)); raiz recusada
leva de volta às boas-vindas do plano 06.

### B-25 — A árvore 🔲

Componente com o padrão **ARIA tree** (`tree`/`treeitem`, `aria-expanded`, `aria-level`,
`aria-setsize`/`aria-posinset`, tabindex móvel): setas, Home/End, type-ahead, Enter abre, → expande,
← recolhe ou vai ao pai. Virtualizada (a janela visível só), sem perder os atributos ARIA. Ícone por
tipo de arquivo (lucide, pelo mapa do plano 06). Pastas de um filho só compactadas (`a/b/c`), como no
VS Code, com preferência para desligar; ordenar por nome, tipo ou modificação; filtrar por nome
dentro da árvore; recolher tudo. Ocultos da [D-10](decisions.md#d-10--exclusões-padrão-e-teto-da-árvore)
escondidos com alternador; `truncated` com aviso traduzido; symlink para fora marcado e não
expansível; entrada `unreadableName` visível e inerte, com tooltip que explica.

### B-26 — As funções de arquivo 🔲

Cada ação existe **em três lugares** — menu de contexto, command palette e atalho —, registrada no
registro de comandos do plano 06, e as de arquivo também no menu **Arquivo**:

- **novo arquivo / nova pasta** inline, com validação antes de enviar;
- **novo a partir de modelo** ([D-19](decisions.md#d-19--de-onde-vêm-os-modelos)): o conjunto
  embutido (nome traduzido, extensão sugerida, marcadores `${fileName}`/`${date}` resolvidos) e
  "novo a partir deste arquivo"; é um `POST /files` com conteúdo;
- **renomear** inline (F2), Esc cancela sem requisição;
- **mover** por arrastar, com a alternativa por teclado "Mover para…" (a11y: arrastar não pode ser o
  único caminho);
- **copiar, recortar, colar, duplicar**;
- **apagar**: até a F8, diálogo que mostra a contagem do `409` com o destrutivo **sem foco inicial**
  ([web/03](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional)); duplo clique
  envia uma vez;
- **copiar caminho** (relativo e absoluto), **revelar no explorer** a partir do editor (expande até o
  arquivo e o seleciona), **abrir ao lado**, **comparar selecionados** (dois arquivos → aba de diff).

Erro de cada ação é traduzido **onde ela aconteceu** (inline no nome, no diálogo), com o que fazer.

### B-27 — Seleção múltipla, lote e desfazer 🔲

Seleção com Shift/Ctrl e pelo teclado; apagar, mover e copiar N itens com **uma** confirmação (quando
confirmação há) e resultado **por item** — o que foi, o que não foi e por quê; lote impossível (mover
para dentro de um dos próprios itens) é recusado inteiro antes de começar.

**Desfazer operação de arquivo** (Ctrl+Z com o foco na árvore, como no VS Code): uma pilha por aba de
pasta com a operação inversa de renomear, mover, criar e copiar — enviada com `If-Match` quando há
`ETag`, e recusada com explicação se o arquivo mudou depois (412). Desfazer o apagar é da F8, pelo
histórico local. É o princípio do produto: desfazer em vez de confirmar, onde dá.

### B-28 — Atualização viva, e a aba inativa 🔲

`workspace.watch` ao abrir a aba de pasta; `filesChanged` invalida os diretórios expandidos afetados
(nó novo aparece, nó apagado sai e a seleção vai ao vizinho sem perder o foco); `overflow` e
reconexão recarregam o que está expandido. Aba de pasta **inativa** segue a D-11 do
[plano 06](../06-workbench/README.md) (assinatura suspensa) e recarrega ao voltar. `WATCH_UNAVAILABLE`
vira aviso com botão de recarregar à mão; `watchStopped { folderDeleted }` leva a aba ao estado de
erro sem derrubar as outras.

### B-29 — Os fatos de arquivo na Auditoria 🔲

Uma seção "Arquivos" mínima na tela de Auditoria do plano 06, sobre o `GET /audit-events` (B-17):
ato, caminho, quem, quando — nunca conteúdo. O redesenho e a linha do tempo única são do
[plano 12](../12-audit-explained/README.md) ([D-13](decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha)).

### B-30 — Usabilidade e ajuda do Explorer 🔲

A view entra no "screen frame" do plano 06 com uma gaveta de ajuda escrita para quem nunca viu o
produto, em en e pt-BR: o que é a árvore, o que "ocultos" esconde e o que deixa de ser assistido, o
que Ctrl+Z desfaz e o que é definitivo, o que o ícone de symlink para fora significa. Tooltip e
`aria-label` traduzidos em todo controle de ícone; estado vazio que **ensina** (criar arquivo, criar
de modelo, arrastar do desktop — este último a partir da F7); atalhos no registro do 06 (aparecem na
palette com a tecla); axe sem violação com menu de contexto e diálogo abertos
([web/06](../../architecture/web/06-testing.md#acessibilidade-em-teste)).

---

## Cenários cobertos

S-157…S-203.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
pnpm test:integration
```
