# F0 — Spike

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:**

- a forma, medida contra o Claude real, das mensagens que o plano 13 traz para a conversa;
- as fixtures do SDK roteirizado gravadas dessas mensagens;
- o custo do markdown num balão do app;
- o motor de realce de sintaxe escolhido.

---

## Por quê

Duas perguntas decidem as fixtures e o desenho das F3…F5, e o `sdk.d.ts` não responde nenhuma delas:

1. **O subagent e a tool MCP sem título.** Com que forma chegam, ao vivo e no histórico, o que o
   subagent emite e o nome de uma tool MCP sem `description`.
2. **O custo no app.** Quanto custa construir um balão de markdown grande, e qual motor de realce
   cobre as linguagens do web sem pesar no APK.

É a mesma disciplina da [B-01 do plano 13](../13-claude-settings/F0-contract.md#b-01--spike-as-medições-que-mandam-no-desenho-):
resultado ruim não é falha do spike, é o que ele existe para achar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Spike: a forma das mensagens novas 🔲

O ambiente é o da B-01 do plano 13:

- um `CLAUDE_CONFIG_DIR` isolado, com a credencial copiada;
- um repositório descartável gerado por execução;
- o servidor MCP de fixture (`e2e/fixtures/mcp-server/`), passado **direto** à sessão do spike
  com `strictMcpConfig`, porque a composição do plano 13 ainda não existe;
- toda sessão com `settingSources: ['project']`, o `PreToolUse` e o `canUseTool`.

É um script em `scripts/`: `pnpm spike:conversation-parity`, com uma sonda por nome e `--json`,
como o `claude-config-spike.mjs`. Ele mede, ao vivo **e** pelo `getSessionMessages` da mesma conversa:

1. Subagent de projeto com um `Write` que pede permissão: confirmar `parent_tool_use_id` nas mensagens,
   no `tool_progress` e no `canUseTool`.

O resultado vai para a [descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md) como uma
nova seção de spikes, com o "como reproduzir".
Cenário S-05.

### B-02 — Fixtures gravadas 🔲

Pelo `scripts/record-agent-sdk-fixtures.mjs`, gravadas do Claude real e não escritas à mão. Vão para
`backend/test/fakes/agent-sdk/fixtures/`:

| Fixture | O que tem |
|---|---|
| `markdown-rich-turn` | resposta com títulos, listas aninhadas, tabela larga, código em três linguagens, citação, link, imagem remota, HTML e um bloco `mermaid` |
| `multi-text-block-turn` | uma mensagem com vários blocos `text` separados por uma tool |
| `explanatory-style-turn` | resposta com o output style `Explanatory` (os blocos `★ Insight`) |
| `mcp-untitled-tool-turn` | tool `mcp__fixture__echo` sem `description` |
| `subagent-permission-turn` | subagent com texto, pensamento, tools e uma permissão |

Cada fixture entra no catálogo do SDK roteirizado (`backend/test/fakes/agent-sdk/fixture.ts`) e serve
às F3…F7. Cenário S-06.

### B-03 — Spike do app: custo do markdown e motor de realce 🔲

No emulador do e2e do app e num perfil de aparelho modesto:

- o tempo de construção e o de primeiro quadro de um balão com 20 KB de markdown, 3 diagramas e
  10 blocos de código;
- o mesmo durante o streaming, re-parseando a cada delta com limite de 100 ms e sem limite. Isso
  decide a [D-02](decisions.md#f0--spike).

Motor de realce ([D-10](decisions.md#f0--spike)):

- dois candidatos Dart puros (p. ex. `highlight` e `re_highlight`), comparados contra a lista
  `LANGUAGES` do editor do web;
- o tamanho do APK com e sem o motor;
- o tempo de um bloco de 500 linhas;
- se os escopos do motor mapeiam para os tokens de cor do `colorizeCode` do web.

Os números vão para o [decisions.md](decisions.md) e para o
[mobile/04-ui](../../architecture/mobile/04-ui.md). Cenários S-07, S-08.

---

## Cenários cobertos

S-05…S-08.

---

## Critério de conclusão

```bash
pnpm verify
pnpm spike:conversation-parity --json /tmp/conversation-parity.json   # sai com 0 e as sondas respondidas
```
