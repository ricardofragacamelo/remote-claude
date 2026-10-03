# F3 — Cabeçalho

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-composer.md).
**Entrega:** o cabeçalho do painel numa faixa, como o do plugin: as abas de conversa, nova conversa,
histórico, alterações, o ponto de status e o menu da sessão (`⋯`). A linha de ícones solta (chat,
alterações, notificações, ajuda) e os botões grandes saem.

**Decisões que precisam estar fechadas para começar:** D-10 e D-11
([decisions.md](decisions.md#f3--cabeçalho)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — Uma faixa só ✅

`PanelHeader`: as abas do `PanelTabStrip` (08 · B-32), que rolam **na faixa** quando não cabem, e à direita:
nova conversa (`+`), histórico ([B-19](#b-19--o-histórico-da-pasta-a-um-clique-)), alternar
conversa/alterações (com a contagem de arquivos alterados) e `⋯`. A linha separada de `IconButton`s do
`ClaudePanel` sai. Os ícones têm nome acessível e tooltip, e o alvo de toque é de 44 px no celular.

### B-17 — O menu da sessão ✅

`SessionMenu` (`⋯`), com:

- **Encerrar sessão**, só do dono, com a confirmação da [D-10](decisions.md#f3--cabeçalho). Para quem não
  é dono, o item fica desabilitado e diz por quê (a regra do plano 01, agora no item);
- **Exportar conversa** (08 · B-39);
- **Desfazer alterações de arquivo…**, que abre a lista de pontos em diálogo, com o mesmo alcance
  arquivo a arquivo do `UndoPanel` (a entrada pela mensagem é a [B-27](F4-inline.md));
- **Notificações do navegador** liga/desliga, com o "negado: como devolver" dentro do item, e não numa
  linha solta no cabeçalho (08 · D-21);
- **Regras de permissão** (o caminho para `/rules`) e **Ajuda do painel**;
- **Copiar id da sessão**.

Com o rascunho aberto, o menu mostra só o que vale sem sessão (ajuda, notificações, regras).

### B-18 — Status, custo e MCP ✅

O `StatusDot` mostra conectado, reconectando, rodando ou encerrado por cor **e** por texto no tooltip
(nunca só cor). No tooltip vão o id da sessão e o custo desde que abriu, onde a
[D-11](decisions.md#f3--cabeçalho) mandar. Sessão sem turno não mostra "$0". O `McpIndicator` vira ícone
no cabeçalho: neutro quando todos estão conectados, em aviso quando algum falhou, e com a lista no
popover. Lista ilegível vira um item que diz isso, sem quebrar a faixa. O `TurnStatus` e o rótulo de
status (`IDLE`, `THINKING`) somem do topo: o estado do turno é a cauda da conversa ([B-21](F4-inline.md)).

### B-19 — O histórico da pasta a um clique ✅

O ícone de histórico, como o do plugin, abre a view "Sessões do Claude" da pasta (08 · F1). Escolher uma
conversa a abre em aba do painel, pelas regras de `attach`, retomar e fork que já existem. Voltar ao chat
mantém a aba e a rolagem.

### B-20 — A ajuda do painel ✅

A `PanelHelp` passa a descrever os lugares novos: a barra da caixa, o menu `⋯`, o indicador na cauda, o
card inline, a pílula e as ações da mensagem. É a regra de "ajuda em toda tela" do workbench. As chaves
saem do inventário da [B-02](F0-norms.md).

---

## Cenários cobertos

S-37…S-47, S-91.

---

## Critério de conclusão

```bash
pnpm verify
```
