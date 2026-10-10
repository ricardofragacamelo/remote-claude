# F6 — Web e app

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-history.md) (e com ela as F2…F4), e das decisões [D-02](decisions.md#normas),
[D-03](decisions.md#f3--avisos-no-backend) e [D-12](decisions.md#f6--web-e-app).
**Entrega:** cada elemento novo da conversa com o seu par web/app: o mesmo tipo de entrada no
redutor, a mesma chave de i18n (par no `i18n-shared.json`), o mesmo estado padrão, e a entrada no
`render-parity.json` do plano 26 já como `ok`. Todo desconhecido do
[§7.0 da discovery](../../discovery/09-perdas-do-backend-na-conversa.md#70-onde-o-desconhecido-some-hoje)
(U-05…U-11) aparece na conversa. O 05 com a regra nova.

---

## Por quê

O backend corrige a perda uma vez só (princípio 2); os clientes só desenham. E desenham **juntos**:
cada task desta fase entrega o web e o app na mesma mudança, porque elemento novo no web sem par no
app reprova o `render:check` do plano 26 (R2). As peças que cada ponta usa estão no
[§9 da discovery](../../discovery/09-perdas-do-backend-na-conversa.md#9-a-mesma-implementação-no-web-e-no-app),
com arquivo e linha.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-19 — A linha de aviso 🔲

O `session.notice` ganha leitor nas duas pontas e vira uma entrada da linha do tempo: `notice` no
`TimelineEntry` do web e `NoticeLine` no `conversation_entry.dart` do app, com o id `notice:<noticeId>`,
nunca pelo `seq`. A linha é `NoticeRow` (sobre o `SystemRow` do `TurnRow.tsx`) e `NoticeLine` (sobre o
`_Line` de `conversation_lines.dart`).

- `level` `info` dobrado; `warning` e `error` em destaque, com as cores dos tokens de tema e do
  `ColorScheme`;
- `command.output` abre no markdown seguro (o `Markdown` do web, o `SafeMarkdown` do plano 26 no app);
  o resto, texto puro; HTML nunca vira elemento;
- aviso de dentro de um subagent aparece sob o subagent (o aninhamento da F5 do plano 26);
- o cliente desenha pelo `kind`, nunca pelo `origin.engine` nem pelo `origin.native`, a regra do
  contrato inteiro desde o [plano 28](../28-agent-neutral-core/README.md);
- as chaves `sessions.notice.*` (web) e `sessionNotice*` (app) nascem pareadas
  ([shared/02-i18n](../../architecture/shared/02-i18n.md)).

Cenários S-72…S-77.

### B-20 — O desconhecido na tela 🔲

Uma linha genérica **só**, nos dois clientes, com um `reason` (`unknownEvent`, `unknownValue`,
`malformed`, `unknownBlock`, `unknownNotice`) e as mesmas chaves pareadas:

- **U-05** bloco de conteúdo de tipo desconhecido: um `BlockKind` `unknown` no web, e o `_finished` do
  app guarda os blocos na ordem, com o desconhecido; o texto vai junto, se houver;
- **U-08** `blockType` desconhecido no `message.delta`: um bloco à parte, nunca lido como `text`;
- **U-06** evento WS desconhecido que não está na lista de calados da F1: uma linha por tipo por sessão,
  e o `seq` avança ([D-02](decisions.md#normas)); o evento calado continua sem linha;
- **U-07** valor de enum desconhecido num evento conhecido: o evento é aplicado com o valor neutro (o
  card fica no estado anterior), e a linha diz qual valor não foi entendido. No app, o evento deixa de
  virar `UnreadEvent` inteiro;
- **U-09** evento conhecido sem um campo obrigatório: `warn` no log do cliente **e** a linha;
- **U-10** o histórico do app para de descartar o que hoje é `UnreadEvent`;
- **U-11** `kind` de aviso desconhecido: a linha `unknown`, com o `text` se houver, e o mesmo para o
  `kind: 'unknown'` que o backend emite (B-13).

Linhas iguais em sequência viram uma só com contador ("×3"), no cliente
([D-12](decisions.md#f6--web-e-app)). O que a linha mostra é o da [D-03](decisions.md#f3--avisos-no-backend).
Cenários S-78…S-87.

### B-21 — A compactação e o que o agente injetou 🔲

- O `CompactedRow` do web e o `CompactedLine` do app ganham o "ver resumo" dobrado, com o resumo
  (`injected.contextSummary`) em markdown ao abrir;
- nenhuma mensagem com `injected` é desenhada como balão "Você": o `/compact` deixa de mostrar os dois
  balões fantasmas;
- a entrada da compactação passa a usar o `compactionId`, no lugar de `seq ?? frame.id` (web) e de
  `compaction:$seq` (app);
- as instruções que o agente injetou (`injected.kind: 'instructions'`, o corpo de skill no Claude)
  viram a linha dobrada "*x* carregada", com o `name` do `injected`, sob o card da tool dona (o
  `parentToolUseId`). O cliente escolhe a linha pelo `injected.kind`, e nunca pelo nome da tool; a chave
  é neutra, com o `{name}`;
- o `/comando args` aparece como o prompt digitado.

Cenários S-88…S-92.

### B-22 — A mídia e o `denied` no card da tool 🔲

- O `ImageMarker` dentro do `ToolRow` (web) e do `ToolCard` (app), buscando pela rota da B-15 com o
  `usePromptImage` e o `PromptImageController`; imagem que não carrega mostra o texto alternativo, como
  a do prompt. O zoom do app vem junto; o do web não ([D-08](decisions.md#normas));
- o anexo `link` aparece como **texto**, e vira link só com `http`, `https` ou `mailto`, com a
  confirmação de link (a do leitor do plano 25 no app). `javascript:` e `data:` nunca viram link;
- o anexo `unknown` cai na linha genérica da B-20;
- a tool `denied` mostra o motivo nas duas pontas (`sessions.toolRow.denied` e o par do app).

Cenários S-93…S-96.

### B-23 — O turno com erro e a retirada 🔲

- O `TurnRow` (web) e o `TurnLine` (app) num estado de erro quando o `turn.completed.outcome` não é
  `completed`, e o aviso `turn.failed` abaixo;
- o `message.retracted` remove as mensagens pelos ids, ao vivo, no replay e no histórico. A retirada
  é idempotente e ignora id desconhecido; a que chega antes da mensagem que retira impede que ela
  apareça (R-06). Só entra se a [D-06](decisions.md#f2--contrato) confirmar o evento;
- um aviso que chega entre os deltas de uma resposta não quebra a resposta em duas.

Cenários S-97…S-101.

### B-24 — A regra nova do contrato e a paridade 🔲

- O [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)
  troca "cliente ignora o que não conhece" por "ignora sem quebrar e, se for da conversa, mostra a linha
  genérica", com a lista de calados da F1. O S-80 do plano 26 ganha a nota de que a regra mudou aqui;
- cada elemento das B-19…B-23 entra no `render-parity.json` como `ok`, com o widget test do app que
  desenha a mesma fixture. O mapa é o que a [F2 do plano 28](../28-agent-neutral-core/F2-canonical-tools.md)
  rechaveou pelo `kind`;
- o [web/03-ui-system](../../architecture/web/03-ui-system.md) e o
  [mobile/04-ui](../../architecture/mobile/04-ui.md) descrevem a linha de aviso e a linha genérica.

Cenário S-102.

---

## Cenários cobertos

S-72…S-102.

---

## Critério de conclusão

```bash
pnpm verify
```
