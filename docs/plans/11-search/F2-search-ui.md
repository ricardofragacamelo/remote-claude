# F2 — Busca na web

Plano: [11 — Busca](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-search.md); da F3 do [plano 06](../06-workbench/README.md) (abas de pasta,
activity bar, command palette com o registro de comandos e atalhos, configurações, screen frame com
ajuda) e da F5 do [plano 07](../07-explorer-and-editor/README.md) (editor, abas de editor, diff
editor, arquivo ativo na URL); a B-25, também da F5 do [plano 08](../08-claude-panel/README.md) (o
composer e o seu `@`).
**Entrega:** Quick Open, a view Busca com substituir e prévia em diff, o editor de resultados, o
histórico de buscas e a seção "Busca" das configurações — traduzidos, acessíveis, com ajuda, no
celular também.

Tudo é **por aba de pasta** do 07: consulta, resultados, histórico e rascunho do substituir são
estado da aba; trocar de aba e voltar não perde nada, e nada de uma aba aparece noutra.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-13 — Service e hooks da busca 🔲

`web/src/features/search/`, na cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md)): `search.service.ts` com as quatro chamadas;
`useFileFinder`, `useTextSearch`, `useReplacePreview`, `useApplyReplace`. Chaves de query
hierárquicas por pasta ([web/04](../../architecture/web/04-state-and-data.md)); toda consulta passa o
`AbortSignal` do TanStack Query, então consulta superada é **cancelada**, não só ignorada. A
busca em texto e a prévia leem o fluxo NDJSON da D-02 pelo `api.ts`, que ganha um leitor de fluxo
(`ReadableStream`, uma linha por vez, com o mesmo log de I/O). Os hooks inserem cada arquivo na
posição ordenada (caminho, depois posição), então a lista na tela não depende da ordem de chegada. A
linha `error`, o fluxo sem linha final e a linha malformada viram o mesmo estado de erro traduzido,
com o que já chegou mantido e marcado como parcial. O
`useFileFinder` é exportado pela superfície da feature para o `@` do composer do
[plano 08](../08-claude-panel/README.md) — um hook, dois consumidores. Log de I/O em `debug` pelo
`pino` do web, sem o padrão.

### B-14 — Quick Open (Ctrl/Cmd+P) 🔲

Sobre o componente de palette do 06 (shadcn `command`), padrão ARIA *combobox*: consulta vazia
mostra recentes e abertos da aba; digitando, os mesmos sobem pelo `prefer` e o resto vem pontuado,
com o trecho casado em destaque; Enter abre no editor do 07 como aba de *preview*, Ctrl/Cmd+Enter
abre ao lado, seta direita mantém a palette aberta. `arquivo.ts:42` abre na linha 42 e `:42` sozinho
é encaminhado ao "ir para linha" **do 07** — o Quick Open não reimplementa. `>` troca para os
comandos da palette do 07. Resultado truncado diz isso. Em tela pequena, ocupa a tela.

### B-15 — A view Busca 🔲

Na activity bar do 06, com contagem de resultados no ícone. Campo de busca com os três botões do VS
Code — `Aa` caixa, `ab` palavra inteira, `.*` regex —, "arquivos a incluir" e "a excluir" (com o
botão "usar exclusões e arquivos de ignore" e o "só nos editores abertos"), árvore de resultados
virtualizada (arquivo → casamentos) com contagem, e ações: recolher/expandir tudo, dispensar um
casamento ou um arquivo, copiar resultado/caminho/tudo, abrir, abrir ao lado — também pelo **menu
de contexto**. Clique abre o editor na linha e coluna com o trecho selecionado. Arquivo que muda depois da busca (`workspace.filesChanged` do 07) tem o resultado marcado como desatualizado, com "buscar de novo". Regex inválida mostra
o erro traduzido junto ao campo, **sem apagar** os resultados anteriores; truncado mostra o motivo e
como refinar.

Duas entradas que o VS Code tem: "Buscar na pasta…" no menu de contexto do explorer do 07 (preenche
o "a incluir") e Ctrl/Cmd+Shift+F com seleção no editor (preenche o campo). A consulta e os botões
vão para a search da URL — o link reproduz a busca ([a URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado)).
Atualiza [web/03](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) com o padrão
da view.

### B-16 — Substituir, com prévia em diff 🔲

Campo "substituir" (seta que abre, como no VS Code) com o botão "preservar caixa". Cada casamento
mostra o antes riscado e o depois; clicar num arquivo abre a prévia no **diff editor do 07**
(original × substituído, só leitura). Substituir um casamento, um arquivo ou tudo; "substituir tudo"
pede a prévia e **mostra o alcance** ("12 substituições em 4 arquivos") antes de aplicar — prévia
antes de efeito amplo, não um "tem certeza?". O relatório diz quantos foram aplicados e **quais
foram preservados** porque mudaram desde a prévia, com ação de refazer a prévia deles.

Arquivo com edição suja numa aba de editor: o substituir avisa antes, e depois o editor mostra o
aviso de mudança externa do 07 — nunca sobrescreve a aba em silêncio. Clique duplo aplica uma vez. Alcance acima do teto de arquivos de um aplicar (D-06) é dito na prévia, que pede para refinar; `500` com `params.applied` mostra o que foi aplicado **e** o erro, sem esconder nenhum dos dois.

### B-17 — O editor de resultados de busca 🔲

"Abrir em editor" leva os resultados para uma aba do editor do 07, como o *Search Editor* do VS
Code: cabeçalho com a consulta e os botões, linhas de contexto ajustáveis (1–9), casamentos
destacados, "executar de novo", e clique/F12 num resultado abre o arquivo na linha. Salvável como
`.code-search` conforme a D-08, pela escrita do 08. É só leitura quanto ao conteúdo dos arquivos: nada
que se digita nele escreve nos arquivos encontrados.

### B-18 — Histórico de buscas 🔲

Setas para cima/baixo no campo percorrem as consultas anteriores **da pasta**, como no VS Code;
"limpar histórico" na palette e na ajuda. Guardado por visitante (D-08 → D-13 do 06), com `try/catch`
em toda leitura e escrita: armazenamento indisponível (janela privada) degrada para "sem histórico",
nunca quebra a view. Teto de 50 entradas, sem duplicata consecutiva.

### B-19 — Atalhos, palette e configurações 🔲

Comandos no registro do 06, com título traduzido e atalho: Quick Open (Ctrl/Cmd+P), Buscar em
arquivos (Ctrl/Cmd+Shift+F), Substituir em arquivos (Ctrl/Cmd+Shift+H), próximo/anterior resultado
(F4/Shift+F4), abrir editor de resultados, limpar histórico. Atalho não dispara quando o foco está
num campo que o consome (o terminal do [12](../12-integrated-terminal/README.md), um campo de texto
do próprio atalho). Seção **"Busca"** nas configurações do 07: exclusões (D-03), usar arquivos de
ignore, caixa inteligente, linhas de contexto padrão do editor de resultados.

### B-20 — Usabilidade e ajuda da busca 🔲

No screen frame do 06, cada tela entregue aqui tem **propósito e ajuda**: o que é o Quick Open e a
Busca, o que cada botão faz (com exemplo de regex, de glob e de "preservar caixa"), por que um
resultado pode faltar (ignorado, excluído, binário, grande, truncado), o que o substituir **não**
faz (não mexe em aba suja sem avisar; não desfaz pelo Ctrl+Z do editor — a volta é o histórico local
do 07 ou o controle de versão fora do produto), e a lista de atalhos. *Tooltip* traduzido em todo
botão de ícone; estado vazio que ensina ("digite para buscar; use `.*` para regex"); erro que diz o
que fazer; "saiba mais" que abre a seção certa da ajuda. Os quatro estados de tela em cada view
([web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre)), teclado e foco
completos, axe sem violação, e nenhum literal apresentável fora do i18n.

### B-25 — O `@` do composer do 08 passa ao localizador 🔲

A troca que a [D-12 do plano 08](../08-claude-panel/decisions.md#f5--composer-e-contexto) previu: o
`@` do composer foi entregue (08 · F5) sobre o passo provisório — completação **por nível** sobre
`GET /files/tree` do 07 —, e passa ao localizador desta fase pelo `useFileFinder` da B-13. Vive aqui,
e não no 08, porque é este plano que traz a fonte, e porque a troca só pode ser feita quando ela
existe.

- o `useMentionMenu` do 08 (`web/src/features/session/hooks/useCompletionMenus.ts`) troca o
  `listMentionLevel` pelo `useFileFinder`, importado do barril da feature `search` — `kinds` com
  arquivo e pasta, `prefer` com os abertos e recentes do editor (o `openAndRecentFiles` do 07), na
  ordem de hoje;
- a consulta superada é cancelada pelo `AbortSignal` da B-13 — a S-228 do 08 continua valendo com a
  fonte nova;
- `truncated`, pasta vazia, nada encontrado e busca que falha mantêm os textos e o "usar o caminho
  digitado" do 08 (S-229, S-232 do 08); caminho fora da pasta continua não oferecido (S-230 do 08);
- o resto do menu não muda: os provedores (`@selection`, e o `@terminal` do 12), o teclado e o chip;
- a ajuda do composer (08 · B-52) deixa de dizer "nível a nível" e passa a dizer que a busca é por
  partes do nome em qualquer lugar da pasta;
- o `listMentionLevel` e o casamento solto por nível do 08 saem — sem fonte dupla.

---

## Cenários cobertos

S-102…S-147, S-169…S-174.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
