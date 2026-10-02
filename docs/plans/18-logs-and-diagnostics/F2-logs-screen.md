# F2 — Tela de logs

Plano: [18 — Logs e diagnóstico](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-log-backend.md), e da moldura de tela, da command palette e da status bar do
[plano 06](../06-workbench/README.md).
**Entrega:** `/diagnostics/logs` — um visualizador denso do log do backend no molde do painel Output do VS Code, com
filtros que vivem na URL, seguir ao vivo, a cadeia de um `traceId`, controle de nível do backend e do
navegador, exportar, menu de contexto, palette e ajuda de verdade. E todo estado de erro do app
passa a levar até aqui.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — A feature `diagnostics`: service, hooks e filtros na URL 🔲

`web/src/features/diagnostics/`, na cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md)):

- service com as rotas da B-04; hooks `useLogCapabilities`, `useLogQuery` (paginação nos dois
  sentidos), `useLogFacets`, `useLogTail`, `useTrace`, `useBackendLogLevel`;
- os filtros são a **search** da rota, validada pelo router da B-07 — é a fonte de verdade, e o
  link reproduz a vista (S-63);
- resposta de consulta antiga que chega depois da troca de filtro é descartada pela chave da query,
  nunca misturada (S-62).

### B-17 — O visualizador 🔲

Lista **virtualizada** e densa (tipografia mono para `op`, ids e duração; tokens do tema, nunca cor
literal), uma linha por registro com hora, chip de nível, módulo, `op`, mensagem, duração e
`traceId` curto:

- expandir a linha mostra o JSON estruturado em árvore recolhível, com copiar valor, copiar caminho
  e copiar a linha inteira;
- `[REDACTED]` é renderizado como marca com tooltip "removido pela redação — não é recuperável", e
  **não existe** ação de revelar (S-60); `truncated` e `unparsed` também têm marca e explicação;
- alternar quebra de linha, hora local ou UTC, hora relativa;
- os quatro estados ([web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre)):
  skeleton que mantém a grade; erro traduzido com "tentar de novo" e o `traceId` do próprio erro;
  vazio que **ensina** — alargar o período, tirar um filtro, ligar `debug`, "buffer desligado nesta
  instalação"; conteúdo;
- quem não é operador não chega à lista: no lugar dela, a tela diz por que o log do backend é do
  operador e leva à ajuda — o que ela sabe por `useLogCapabilities`, sem pedir a consulta (S-64);
- cabeçalho da lista com o que o buffer guarda: "desde o reinício às HH:MM", "N linhas saíram por
  espaço".

### B-18 — Filtros e busca 🔲

Barra de filtros no topo, tudo refletido na URL:

- nível mínimo e seleção por nível;
- módulo e `op` em seletores com busca e contagem vindas das facetas — ninguém digita nome técnico;
- período com atalhos (últimos 15 min, última hora, desde o reinício) e intervalo livre validado
  inline (`from` antes de `to`);
- busca por termos com `!` para excluir, com dica do formato no próprio campo;
- chips removíveis para `traceId`, `sessionId` e `userId`, "limpar filtros".

### B-19 — Seguir ao vivo 🔲

Botão "seguir" (e o atalho) liga o long-poll de `useLogTail` a partir do último cursor:

- linhas novas entram no fim; rolar para cima pausa a rolagem automática e mostra "N linhas novas",
  que volta ao fim (S-66);
- aba do navegador oculta **pausa** o long-poll, e ao voltar retoma do cursor (S-67) — a mesma regra
  de recurso suspenso das abas do plano 06;
- a vista guarda no máximo um teto de linhas; as mais antigas saem com aviso (S-68);
- `reset` e `gap` viram divisores na lista, com hora e contagem (S-69);
- `429`/`503` recuam respeitando `Retry-After`, com o estado na barra da lista (S-70);
- desligar e religar não duplica linha (S-71).

### B-20 — A cadeia de um `traceId`, e o caminho até ela 🔲

Clicar num `traceId` abre uma gaveta com a cadeia (`useTrace`): linha do tempo das linhas do trace
agrupadas por camada (HTTP/WS → use case → banco → SDK), pares com duração em barras
proporcionais, a operação **pendurada** e os erros destacados, e "filtrar a lista por este trace".
Quando o [plano 14](../14-audit-explained/README.md) oferecer a trilha por `traceId`, a gaveta
ganha o link para ela.

E a porta de entrada: componente compartilhado `TraceLink` usado pelo estado de erro comum do web —
todo erro que mostra o envelope passa a oferecer "copiar id do rastreio" e, para o operador, "ver nos
logs", que abre `/diagnostics/logs?traceId=…` (S-73). Quem não é operador copia o id e o entrega a
quem opera. É o que finalmente dá destino ao `traceId` que o
[envelope de erro](../../architecture/shared/04-errors-and-http.md#o-envelope-de-erro) sempre levou.

### B-21 — Níveis: o do backend e o deste navegador 🔲

- **Backend** (só operador): o nível atual e o configurado, "elevar" com escolha de nível e duração
  (dentro do teto), contador regressivo, "voltar agora", e quem mudou (S-74);
- **Este navegador**, conforme a [D-12](decisions.md#d-12--debug-neste-navegador-prazo-e-alcance):
  "debug neste navegador" muda o nível do logger do web em execução, por prazo, com o indicador na
  status bar do plano 06 e "desligar" a um clique (S-75). As linhas vão para o console do navegador,
  não para esta lista ([web/05-logging](../../architecture/web/05-logging.md#nada-sai-do-navegador)),
  e o controle vale para qualquer usuário, operador ou não.

### B-22 — Exportar, copiar, menu de contexto e palette 🔲

- exportar a vista com os filtros (download do `export` da B-14, nome com o período), e copiar as
  linhas visíveis como JSONL;
- copiar link da vista;
- menu de contexto da linha: copiar linha, copiar JSON, filtrar por este trace/módulo/`op`, excluir
  este módulo, abrir a cadeia (S-77);
- comandos registrados na command palette do plano 06 — "Logs: seguir ao vivo", "Logs: limpar
  filtros", "Logs: exportar", "Logs: definir nível do backend", "Logs: debug neste navegador" —,
  executando a mesma ação do botão (S-78).

### B-23 — Usabilidade e ajuda da tela de logs 🔲

- **ajuda** na gaveta da moldura, escrita para quem nunca viu o produto, em `en` e `pt-BR`: o que é
  a tela; por que o log do web e do app não aparece nela (fica no console de cada um, e o `traceId`
  liga os dois lados); os níveis e quando usar `debug`; o que é `traceId` e
  como seguir uma falha do clique ao Claude; **o que a redação remove e que não volta**; o que o
  buffer guarda (desde o reinício, com teto) e onde está o registro durável; **quem vê o quê** (só o
  operador) e o que ele vê de outros usuários; os atalhos;
- tooltip em todo controle de ícone, com o atalho quando houver;
- atalhos (`/` busca, `F` seguir, setas, `Enter` expandir, `Esc` fechar a gaveta), registrados na
  palette, com foco visível e ordem de tabulação coerente (S-82);
- "saiba mais" dos estados vazio e de erro levando à seção certa da ajuda;
- axe sem violação nos dois temas, com a gaveta aberta (S-83); zero literal apresentável (S-81);
  abaixo de `md`, filtros numa gaveta e a linha expandida em tela cheia.

---

## Cenários cobertos

S-58…S-75, S-77…S-83.

---

## Critério de conclusão

```bash
pnpm verify
```
