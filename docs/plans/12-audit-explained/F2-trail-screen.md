# F2 — Tela da trilha

Plano: [12 — Auditoria explicada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-trail-backend.md); da moldura de tela e da navegação global do
[plano 06](../06-workbench/README.md) (cabeçalho, propósito, gaveta de ajuda, command palette); e das
decisões D-09…D-12.
**Entrega:** a tela `/audit` responde, sem que ninguém precise saber o que é um `sessionId`, **o que
aconteceu** em cada invocação — pedido, decisão, resultado —, em qual pasta e conversa, e explica o que a
própria tela é.

---

## O que muda para quem usa

Hoje: filtros de texto cru (um id de sessão digitado à mão, o nome técnico da tool), cartões "Run a
shell command · Recorded · Recorded as it was about to run, before any decision", e o comando escondido
num expansor. A mesma invocação aparece em dois cartões separados (`recorded` e `allowed`), e o que
aconteceu depois não aparece em lugar nenhum.

Depois: uma linha por invocação com **o comando à vista**, a pasta, a decisão e o desfecho; um painel
lateral que conta a história em frases; filtros que se escolhem em vez de se digitar; e uma ajuda que
explica a tela para quem nunca a viu.

A regra de toda a fase: a cadeia `Component → Hook → Service → api.ts`, os quatro estados, zero literal
([web/01](../../architecture/web/01-architecture.md), [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria),
[02-i18n](../../architecture/shared/02-i18n.md)). Denso como o VS Code: tokens, ícones lucide, tabela com
colunas, chips de estado.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — Catálogo de tools no web 🔲

Pela D-09: `web/src/shared/tools/` com, por tool, a chave de i18n do nome amigável, o ícone lucide e o
extrator do **campo principal** — `command` do `Bash`, `file_path` do `Read`/`Write`/`Edit`, `pattern`
(e `path`) do `Glob`/`Grep`, `url` do `WebFetch`, `query` do `WebSearch`, `description` do `Task`, a
contagem do `TodoWrite`. Cobre todas as tools do Claude Code, não só as sete que o web traduz hoje. MCP
(`mcp__<servidor>__<tool>`) vira "tool, do servidor MCP X"; desconhecida, "Usar X" com ícone genérico
(S-72…S-75). Funções puras, testadas em unit; os cards do [plano 08](../08-claude-panel/README.md) e o
assistente do [plano 13](../13-rules-management/README.md) usam o mesmo catálogo.

### B-17 — Service, hooks e a search da URL 🔲

- `audit.service.ts` ganha as rotas da F1; hooks com TanStack Query — `useAuditTimeline` (infinita,
  cursor composto), `useAuditSummary`, `useAuditFacets`, `useAuditInvocation`, `useAuditEvent` —, chaves
  hierárquicas no lugar único ([web/04](../../architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só));
- a search de `/audit` passa a ter `q`, `session`, `folder`, `tool`, `decision`, `outcome`, `preset`,
  `from`, `to`, `types`, `group`, `view` e `open` (o item aberto no painel): **o link colado reproduz a
  tela inteira**, inclusive depois do login (S-76); o que vier malformado é descartado campo a campo,
  como o `readAuditSearch` de hoje já faz (S-77);
- filtro novo descarta a resposta do anterior que ainda chegava (S-78);
- toda chave nova em `en` e `pt-BR`, e literal apresentável reprovado por `lint` e `i18n:check` (S-89).

### B-18 — Cabeçalho e o resumo do período 🔲

Na moldura de tela do plano 06: título, **uma linha de propósito** ("tudo o que o Claude fez nesta
máquina, e quem deixou"), ações à direita (exportar — F3 —, visões, ajuda).

Abaixo, **cartões de resumo** do período filtrado, do `GET /audit/summary`: invocações, sem pergunta,
perguntadas, negadas, falharam, interrompidas, em execução agora. Cada cartão é um filtro: clicar aplica,
e o filtro aparece como chip removível (S-79). Presets de período à vista — última hora, hoje, 7 dias,
30 dias, personalizado — no fuso do navegador, com `from` incluído e `to` excluído, e "hoje" certo na
virada do horário de verão (S-80).

### B-19 — A lista: colunas, agrupamento, teclado e menu de contexto 🔲

- **colunas:** ícone e nome amigável da tool · **o campo principal à vista** (o comando, o caminho),
  em mono, cortado com reticências e inteiro no tooltip · pasta (nome curto, caminho no tooltip) ·
  sessão (título da conversa, ou data) · decisão (chip: sem pergunta · permitida por você · por regra ·
  negada · sem resposta) · desfecho (chip: concluiu · falhou · interrompida · em execução · não concluiu
  · não registrado) · duração · quando (relativo, absoluto no tooltip);
- **agrupar** por sessão, turno (`prompt_id`), pasta ou tool, com cabeçalho de grupo e contagem; o grupo
  que atravessa páginas continua o mesmo ao carregar mais (S-81). Ordem só por momento
  ([D-11](decisions.md#d-11--ordenar-por-outra-coisa)), com "ir para data";
- **teclado:** ↑/↓ e `j`/`k` movem, `Enter` abre o detalhe, `Esc` fecha e devolve o foco à linha, `/`
  foca a busca (S-82) — padrão ARIA de grid, testado com o axe;
- **menu de contexto** da linha e as mesmas ações na command palette: copiar input, copiar link permanente,
  filtrar por esta sessão / tool / pasta, abrir a conversa, abrir a regra (S-83);
- "carregar mais" e rolagem infinita, com falha que **mantém** o que está na tela (S-85); quatro estados
  por região com skeleton que não mexe no layout (S-86); lista longa virtualizada;
- abaixo de `md`, cada linha vira um cartão compacto com o mesmo conteúdo das colunas, sem scroll
  horizontal (S-90).

### B-20 — Filtros por seletor, e a busca no input 🔲

Nenhum filtro pede um id:

- **sessão:** combobox com pasta + título da conversa + data, com busca por texto (S-84), das facetas;
- **tool:** lista com nome amigável e contagem; **pasta:** lista das pastas vistas;
- **decisão** e **desfecho:** chips multisseleção;
- **período:** os presets da B-18 e o personalizado;
- **busca no input:** caixa de texto com espera entre teclas (uma requisição, não uma por tecla), aviso
  inline para termo curto antes de enviar (S-88);
- os filtros ativos aparecem como chips removíveis, com "limpar tudo";
- sessão de outra pessoa vinda da URL → erro traduzido com caminho de volta à trilha inteira (S-87).

### B-21 — O painel de detalhe: a história em frases 🔲

Painel lateral (em `md+`) com:

- **a história**, montada por uma função pura a partir da linha do tempo da invocação: "Registrado às
  22:43:07 → perguntado → aprovado por você, no celular «Pixel 8», às 22:43:12 → executou em 1,2 s e
  saiu com código 1". Uma frase para cada combinação (S-91): por regra (e qual), por regra de sessão
  (que acabou com a sessão), por você, por ninguém a tempo, sem pergunta (o Claude Code liberou sozinho,
  com o porquê); concluiu, falhou, interrompida, com código de saída, em execução, não concluiu, desfecho
  não registrado — anterior a esta versão; decisão anterior à `0009`, sem veredito (S-92);
- **o input exato**, formatado, com copiar (S-93); o campo principal destacado no topo;
- **vínculos:** a conversa naquele ponto (F3), a regra (abre `/rules/$ruleId` em qualquer estado), a
  sessão (filtra), a pasta (filtra), o aparelho (histórico dele no [plano 15](../15-devices/README.md)),
  o `traceId` (copiar; e a tela de logs do [plano 16](../16-logs-and-diagnostics/README.md) quando existir);
- **"o que isso significa"**, um parágrafo por caso, escrito para quem não conhece o produto, com "saiba
  mais" que leva à seção certa da ajuda (S-98).

### B-22 — Endereço permanente e tela cheia no celular 🔲

`/audit/invocations/$invocationId` e `/audit/events/$eventId`: o detalhe como página, com "voltar à
trilha". Aberto deslogado, volta ao mesmo item depois do login (S-94); invocação purgada diz "removida pela
retenção de 90 dias" (S-95); inexistente, o erro com caminho para a trilha (S-96). Em tela pequena, abrir
um item da lista navega para o endereço permanente, e voltar devolve a lista na mesma posição (S-97).

### B-23 — Visões salvas 🔲

Pela D-10: salvar o conjunto de filtros e agrupamento com um nome; lista de visões no cabeçalho;
abrir põe `view=<id>` na URL e aplica (S-99); renomear e apagar pela lista, com **desfazer** no aviso em
vez de confirmação (S-105). Do lado do servidor (se a D-10 for servidor): as rotas `/audit/views`, os
códigos `AUDIT_VIEW_*` (S-100…S-102, S-104), idempotência do "salvar" por chave de pedido (S-103), e
visão **fora** da trilha — é preferência mutável, não fato.

### B-24 — Entradas novas com a tela aberta 🔲

Pela D-12: consulta de novidades a cada 15 s só com a aba visível e só quando o período não está fechado
no passado (S-107, S-108); aviso "N novas entradas" no topo, que não mexe na rolagem; clicar insere sem
duplicar o que já estava (S-106).

### B-25 — Usabilidade e ajuda da tela de auditoria 🔲

A task que o usuário pediu com todas as letras ("ajuda, o que faz, explicação do que aconteceu"):

- **gaveta de ajuda** da moldura do plano 06, com: o que é esta tela; glossário (registrado, perguntado,
  permitido, negado, sem resposta, automático, regra, escopo, origem, desfecho, turno, `traceId`); **por
  que existe o registro antes da decisão** (a
  [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse),
  em palavras: nem toda tool passa por uma pergunta, e a trilha não pode perder as que não passam); a
  retenção de 90 dias e o que acontece depois; **o que não é gravado** — conteúdo de arquivo lido, saída
  das tools, mensagens da conversa, o título da conversa —; por que a lista só ordena por momento; os
  atalhos (S-109);
- tooltip e nome acessível em todo controle só de ícone (S-110);
- atalhos registrados na command palette e no editor de atalhos do plano 06 (S-111);
- **estado vazio que ensina**: sem filtro, "nada rodou ainda — abra uma pasta no workbench e peça algo ao
  Claude"; com filtro, "nenhuma invocação com estes filtros" e "limpar filtros" como ação (S-112);
- texto de erro que diz o que fazer, para cada código que a tela pode receber (S-114);
- axe sem violação, com detalhe e ajuda abertos, nos dois temas (S-113).

---

## Cenários cobertos

S-72…S-114.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
