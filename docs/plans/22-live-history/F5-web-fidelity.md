# F5 — Fidelidade no web

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-mapping.md). Pode correr antes, depois ou junto da [F6](F6-mobile-fidelity.md), e não
depende do seguidor.
**Entrega:** o web mostra a conversa como o Claude Code mostra: o pensamento rotulado como pensamento, com
"até N s" no histórico e o resumido à vista; o autor uma vez por turno; a ferramenta com a descrição, IN/OUT e a
saída completa sob demanda; e a imagem do prompt marcada e aberta sob demanda. Vale para o leitor **e** para a
sessão viva, que usam os mesmos componentes.

**Decisões que precisam estar fechadas para começar:** D-14…D-16 ([decisions.md](decisions.md#f5--fidelidade-no-web)),
e a D-09 ([F1](decisions.md#f1--mapeamento-e-leituras)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-27 — Pensamento 🔲

[ThinkingBlock.tsx](../../../web/src/features/session/components/conversation/ThinkingBlock.tsx): o omitido é
"Pensou" (não mais `sessions.thinking.hidden`), e ao abrir diz `sessions.thinking.nothingShown`; o resumido à
vista, atenuado ([D-15](decisions.md#f5--fidelidade-no-web)); o `redacted` mantém o aviso. No
[redutor](../../../web/src/features/session/services/conversation-reducer.ts), a duração do histórico sai do `at`
da entrada anterior e do bloco, como limite ([D-14](decisions.md#f5--fidelidade-no-web)); ao vivo, a medida de
hoje.

### B-28 — Autor por turno 🔲

[MessageItem.tsx](../../../web/src/features/session/components/conversation/MessageItem.tsx) e
[TimelineEntries.tsx](../../../web/src/features/session/components/conversation/TimelineEntries.tsx): o autor
aparece na primeira mensagem de cada turno, e mensagem sem bloco visível não desenha cabeçalho
([D-16](decisions.md#f5--fidelidade-no-web)). A decisão de "primeira do turno" olha a entrada anterior, na
lista já dobrada.

### B-29 — Ferramenta: título, IN/OUT e a saída completa 🔲

[tool-labels.ts](../../../web/src/features/session/lib/tool-labels.ts) usa o `title` quando presente.
[ToolRow.tsx](../../../web/src/features/session/components/conversation/ToolRow.tsx): Bash expandido mostra IN
com o `command` em mono e OUT com a saída (ANSI); as outras ferramentas mantêm o input como hoje. Expandir pede
a saída completa por um hook (`useToolResult`) → service → api, uma vez por ferramenta; falha mostra o `summary`
e "tentar de novo"; `truncated` diz quanto tinha.

### B-30 — Imagem do prompt 🔲

O redutor guarda o bloco de imagem (hoje descartado), e o [MessageItem.tsx](../../../web/src/features/session/components/conversation/MessageItem.tsx)
mostra "imagem anexada" com tipo e tamanho. Abrir busca pela rota da B-12 por um hook (`usePromptImage`) →
service → api, com o token no cabeçalho, e mostra por `blob:` num diálogo; fechar revoga o `blob:`. Os erros
`415`, `413` e `404` têm a mensagem traduzida.

---

## Cenários cobertos

S-101…S-122 (os do web).

---

## Critério de conclusão

```bash
pnpm verify
```
