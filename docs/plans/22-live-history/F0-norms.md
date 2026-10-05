# F0 — Normas e contrato

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** o contrato de acompanhar um transcript escrito no 05 e nos schemas, com os tipos gerados nas
três pontas; as rotas e os campos novos do transcript em `backend/03`; as regras das telas em `web/03` e
`mobile/04`, com a revisão da D-17 do 08 registrada; as chaves i18n e ARB, alinhadas e presas pelo mapa
compartilhado; e as fixtures gravadas que as fases seguintes usam.

**Decisões que precisam estar fechadas para começar:** D-01…D-04 ([decisions.md](decisions.md#f0--normas-e-contrato)),
e as que as normas descrevem: D-05…D-17.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — O contrato de acompanhar, no 05 e nos schemas 🔲

No [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md):

- os comandos `transcript.follow { conversationId, afterMessageId }` e `transcript.unfollow { followId }`, o
  ack `transcript.following { followId, conversationId, activity }` e os eventos
  `transcript.appended { followId, conversationId, seq, events[], lastMessageId, activity, working }` e
  `transcript.reset { followId, conversationId, reason: 'rewritten' | 'gone' }`
  ([proposta §7](../../propostas/historico-ao-vivo-e-fiel.md#7-contrato));
- uma seção **Acompanhar um transcript**, no molde de [A pasta assistida](../../architecture/shared/05-websocket-protocol.md#a-pasta-assistida--workspace):
  sem lacuna entre a página e a assinatura, ack antes de tudo, reconexão é reassinar (sem replay), cadeia
  reescrita é reset, uma sondagem por conversa, o mesmo cercado de leitura, tetos, só a cadeia principal, e
  `liveHere` recusado ([proposta §5.3](../../propostas/historico-ao-vivo-e-fiel.md#53-regras-do-acompanhamento));
- os campos aditivos: `blockId` nos blocos de conteúdo ([D-06](decisions.md#f1--mapeamento-e-leituras)), `at`
  nos eventos do histórico, `title` em `tool.started` passando a ser preenchido ([D-05](decisions.md#f1--mapeamento-e-leituras)),
  e `mediaType`/`size` no bloco `image`; sem subir `v` ([D-03](decisions.md#f0--normas-e-contrato)).

Os schemas em `packages/contracts/schema/` (`commands/`, `acks/`, `events/`), os tipos em
`packages/contracts/src/protocol.ts`, e o `protocol.g.dart` do app regenerado. No
[catálogo de erros](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio):
`TRANSCRIPT_FOLLOW_LIMIT`, `TRANSCRIPT_FOLLOW_LIVE_HERE`, e o `415`/`413` das rotas da B-02 se ainda não houver
código para eles.

### B-02 — As rotas e os campos novos do transcript 🔲

Em [backend/03-modules §transcript](../../architecture/backend/03-modules.md):

- `GET /transcripts/:sessionId/messages` ganha `lastMessageId`, e os eventos, `at` e `blockId`;
- **nova** `GET /transcripts/:sessionId/tools/:toolUseId/result` → `{ text, truncated, bytes }`, com o teto da
  [D-08](decisions.md#f1--mapeamento-e-leituras);
- **nova** `GET /transcripts/:sessionId/images/:blockId` → o binário, com a regra da
  [D-10](decisions.md#f1--mapeamento-e-leituras);
- o **seguidor**: o que ele sonda, quando relê, como compartilha o tick, e o porquê de não haver `fs.watch`
  (S-09 do 04).

O schema da resposta da rota de saída em `packages/contracts/schema/responses/`.

### B-03 — As regras das telas, e a revisão da D-17 🔲

Em [web/03-ui-system](../../architecture/web/03-ui-system.md) e [mobile/04-ui](../../architecture/mobile/04-ui.md):

- **pensamento**: omitido é "Pensou", recolhido, e diz "o modelo não mostrou" ao abrir; resumido à vista,
  atenuado ([D-15](decisions.md#f5--fidelidade-no-web)); duração medida ao vivo, "até N s" no histórico
  ([D-14](decisions.md#f5--fidelidade-no-web));
- **autor por turno**, sem cabeçalho vazio ([D-16](decisions.md#f5--fidelidade-no-web));
- **ferramenta**: rótulo pelo `title`; IN/OUT do Bash; a saída completa sob demanda; card recolhível no app;
- **imagem do prompt**: marcador e abrir sob demanda ([D-09](decisions.md#f1--mapeamento-e-leituras));
- **leitor que acompanha**: seguir o fim, pílula "N novas", aviso de atividade vivo, "Trabalhando em outro
  cliente…" com ajuda ([D-12](decisions.md#f2--seguidor-no-backend)).

Na [D-17 do plano 08](../08-claude-panel/decisions.md#d-17--thinking), uma nota: "revista em 2026-10-04 pela
D-15 do plano 22 — o resumido fica à vista". Na [descoberta §10.7](../../discovery/01-descoberta-claude-agent-sdk.md#107--thinking-vem-omitido-por-padrão-display-summarized-o-traz-d-17),
o achado: o `timestamp` marca o fim do bloco, e a duração ao vivo não é gravada.

### B-04 — As chaves i18n e ARB, e os pares do mapa 🔲

Chaves novas em `en` e `pt-BR` (web) e `en` e `pt` (app): "trabalhando em outro cliente" e a ajuda; "N novas";
"Pensou por até N s"; IN, OUT, "saída completa não carregou", "saída cortada"; "imagem anexada", abrir,
falhas da imagem; as mensagens de `TRANSCRIPT_FOLLOW_LIMIT` e `TRANSCRIPT_FOLLOW_LIVE_HERE`.

No app, "Retomar" passa a "Continuar esta conversa" e "Concluída" a "Pronto", como o web
([D-04](decisions.md#f0--normas-e-contrato)). No [i18n-shared.json](../../../scripts/i18n-shared.json): os pares
`history.screen.resume` ↔ `historyResumeAction`, `session.toolStatus.*` ↔ `sessionToolStatus*`, e as chaves
novas que as duas pontas mostram ([proposta §4.9](../../propostas/historico-ao-vivo-e-fiel.md#49-outras-divergências-entre-web-e-mobile-e-a-relação-com-o-plano-10)).
Ver [shared/02-i18n](../../architecture/shared/02-i18n.md).

### B-05 — As fixtures gravadas 🔲

Das gravações que existem (`thinking-turn`, `thinking-summarized-turn`, `image-turn`, `queue-turn`,
`long-tool-turn`, `compact-turn`, `tool-turn`), conferir o que cada uma cobre da lista da S-07, e gravar o
que faltar com `pnpm fixtures:record` — nunca escrever uma entrada à mão
([01 · D-04](../01-live-session/decisions.md)). O que é provável faltar: uma resposta com **dois** pensamentos
omitidos, Bash com `description` e saída de várias centenas de linhas, e `tool_result` em lista de blocos.
Cada gravação nova entra no teste do adapter (`sdk-message.mapper.history.spec.ts`).

---

## Cenários cobertos

S-01…S-07.

---

## Critério de conclusão

```bash
pnpm verify
```
