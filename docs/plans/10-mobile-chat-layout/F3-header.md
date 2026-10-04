# F3 — Cabeçalho

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-composer.md).
**Entrega:** a `AppBar` da sessão com o título, o status, o histórico da pasta e o menu `⋯`. Os ícones
soltos de desfazer e encerrar saem, e o texto de status do topo também. A ajuda da tela descreve os
lugares novos.

**Decisões que precisam estar fechadas para começar:** D-08
([decisions.md](decisions.md#f3--cabeçalho)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-15 — A `AppBar`: título, status e histórico ✅

- **Status:** um `StatusChip` com cor **e** texto (conectado, reconectando, rodando, esperando você,
  encerrada), anunciado pelo `Semantics`. O texto de status do `_Header` de hoje sai: o estado do turno é
  a cauda da conversa ([B-18](F4-inline.md)). Pela [D-08](decisions.md#f3--cabeçalho), tocar no status abre
  uma folha com o id da sessão (com copiar) e o custo desde que abriu. Sessão sem turno não mostra "$0".
- **Histórico:** um ícone que abre a lista de conversas da pasta (`ConversationListPage`, plano 04).
  Voltar devolve a sessão com a rolagem e o texto da caixa.
- A `ConnectionLine` deixa a `AppBar` e vai para a faixa da [B-07](F1-session-frame.md).

### B-16 — O menu `⋯` ✅

`SessionMenu`, uma folha de baixo com:

- **Encerrar sessão**, só do dono, com a confirmação da
  [09 · D-10](../09-chat-layout/decisions.md#f3--cabeçalho): o diálogo diz o que se perde (o desfazer) e
  o foco começa em cancelar. Para quem não é dono, o item fica desabilitado e diz por quê;
- **Desfazer alterações de arquivo…**, que abre o `rewind_sheet` de hoje, com o mesmo alcance. A entrada
  pela mensagem é a [B-24](F4-inline.md);
- **Regras de permissão** (a `RulesPage`) e **Ajuda da tela** ([B-17](#b-17--a-ajuda-da-tela-de-sessão-));
- **Copiar id da sessão**.

No rascunho, o menu mostra só o que vale sem sessão (regras e ajuda). Os `IconButton` de desfazer e
encerrar saem da `AppBar`.

### B-17 — A ajuda da tela de sessão ✅

Uma folha que descreve os lugares novos: a barra da caixa, o menu `⋯`, o status, o indicador na cauda, o
card inline, a pílula, as tarefas e as ações da mensagem (pressionar e segurar). É a regra de "ajuda em
toda tela". As chaves saem do inventário da [B-02](F0-norms.md).

---

## Cenários cobertos

S-46…S-53.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile
pnpm verify
```
