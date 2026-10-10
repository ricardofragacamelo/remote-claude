# F3 — Markdown na mensagem

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-shared-markdown.md); a [D-02](decisions.md#f0--spike) (markdown durante o
streaming) decidida.
**Entrega:**

- o balão do Claude e o do usuário renderizam markdown, ao vivo e no histórico;
- os blocos da mensagem mantêm a ordem;
- o autor aparece como no web;
- a mensagem pode ser selecionada e copiada.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-09 — A mensagem guarda os blocos 🔲

Hoje o `MessageFinished` junta os blocos `text` com `''` e põe as imagens no fim
([session_event_mapper.dart](../../../mobile/lib/features/session/data/mappers/session_event_mapper.dart)).
Ele passa a guardar a **lista ordenada** de blocos desenháveis (texto e imagem, cada um com o
`blockId`), e o `StreamMessage` deixa de ter um texto só.

O pensamento continua extraído para o `ThinkingEntry`, como o web. Os deltas continuam indo para o
último bloco de texto aberto.

O texto "para copiar" é o markdown original, com os blocos separados por linha em branco, como o
`message.text` do web. O mesmo vale para o histórico (`historyEventFrom`) e para o seguidor do plano
22: as três vias passam pelo mesmo mapper. Cenários S-27…S-30.

### B-10 — O balão com markdown 🔲

O `MessageBubble` desenha cada bloco de texto pelo `SafeMarkdown` da F2, para o Claude **e** para o
usuário, como o web. Desenha também:

- o código pelo `CodeBlock`;
- o Mermaid sob demanda;
- a tabela larga com rolagem dentro da caixa.

Durante o streaming, o markdown segue a [D-02](decisions.md#f0--spike).

Nome de arquivo da pasta (`src/x.ts`, `src/x.ts:42`, entre crases ou em link relativo) vira link para
o **leitor do plano 25** naquele arquivo e linha. A regra de reconhecimento é a do `fileLinkOf` do web,
portada, e os casos de teste são uma tabela compartilhada: um JSON que os testes das duas pontas leem.

As regras do conteúdo não confiável valem como no leitor:

- HTML vira texto;
- link externo só `http`, `https` ou `mailto`, com confirmação;
- imagem remota nunca é carregada.

Cenários S-31…S-40.

### B-11 — Autor, selecionar e copiar 🔲

- **Autor:** "Você" e o nome do agente no começo de cada sequência de mensagens do mesmo autor, pela
  regra do web ([plano 22 · D-16](../22-live-history/decisions.md)). O nome do agente entra como o
  parâmetro `{agent}`, o `displayName` do motor da sessão no `GET /engines` do
  [plano 28](../28-agent-neutral-core/README.md), e nunca nasce na chave nem no widget. O par
  `sessions.message.author.*` ↔ `sessionMessageAuthor*`, neutro, entra no `i18n-shared.json`.
- **Selecionar:** `SelectionArea` no balão.
- **Copiar:** "Copiar mensagem" no toque longo, para **toda** mensagem (hoje só o prompt tem menu),
  e um botão no balão do Claude, como o web. Copia o markdown original. O retorno "copiado" é
  anunciado. O par `sessions.message.copy`/`copied` entra no mapa de i18n.

Cenários S-41…S-44.

### B-12 — O preview da pergunta estruturada 🔲

O preview de opção da pergunta estruturada (a `interaction` do plano 24, que depois do
[plano 28](../28-agent-neutral-core/README.md) é escolhida pelo `kind` `question`, e não pelo nome da
tool), hoje em `SelectableText` monoespaçado por causa da
[24 · D-21](../24-structured-questions/decisions.md#f4--mobile) ("sem dependência de markdown no app"),
passa ao `SafeMarkdown`, como o web. A D-21 do plano 24 tinha um motivo que deixou de existir. A
revisão é registrada lá, com uma nota no resultado, e em [mobile/04-ui](../../architecture/mobile/04-ui.md).
Cenário S-45.

---

## Cenários cobertos

S-27…S-45.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # mensagem, blocos, autor e copiar deixam de ser `pending`
```
