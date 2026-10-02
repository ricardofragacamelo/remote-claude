# F1 — Moldura da sessão

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md).
**Entrega:** a tela de sessão em três faixas, com a conversa na ordem real e o composer acima do teclado,
em tela pequena e com fonte grande; os estados em faixas de uma linha; a sessão encerrada que retoma pelo
envio; e o rascunho, em que a sessão nasce no primeiro prompt. Os controles da `AppBar` e a fila de
permissão do topo ainda ficam onde estão. Saem na F2, na F3 e na F4.

**Decisões que precisam estar fechadas para começar:** D-05
([decisions.md](decisions.md#f1--moldura-da-sessão)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-05 — A conversa na ordem real 🔲

Hoje o [`Conversation`](../../../mobile/lib/features/session/domain/entities/conversation.dart) guarda
`messages` e `tools` em listas separadas, e a
[`ConversationView`](../../../mobile/lib/features/session/presentation/widgets/conversation_view.dart)
desenha uma e depois a outra: uma tool que rodou entre duas respostas aparece depois das duas. A conversa
passa a ser **uma lista ordenada de entradas** (mensagem, thinking, tool, resumo do turno, linha de
sistema), na ordem do `seq`, como o web. É Dart puro, em `domain/`, e as três regras do stream continuam
valendo para ela ([mobile/03](../../architecture/mobile/03-state-and-data.md#as-três-regras-do-stream)):
`seq` repetido é descartado, `gap` recarrega, e o replay não duplica.

O [`session_event_mapper`](../../../mobile/lib/features/session/data/mappers/session_event_mapper.dart)
deixa de descartar o thinking: um fragmento com `blockType: thinking` vira entrada própria, **nunca**
texto da resposta. O texto de subagent continua fora do app, e um `blockType` que o app não conhece é
ignorado com log em `debug`. Os testes do stream migram junto (R-05).

### B-06 — `SessionPage` em três faixas 🔲

A `AppBar`, a conversa e o composer. A conversa é o **único** scroll: um `ListView.builder` com
`reverse: true`, que acompanha o fim só quando a pessoa já está no fim
([mobile/04](../../architecture/mobile/04-ui.md#transcript-e-stream)). O composer fica ancorado embaixo,
dentro da `SafeArea` e acima do teclado (`viewInsets`, `resizeToAvoidBottomInset`), e a `AppBar` não sai
da tela quando o teclado abre (R-02).

O `ConstrainedBox` de meia altura acima da conversa ainda guarda a fila de permissão nesta fase, mas
**recolhido** numa linha ("*n* pedidos esperando"), que expande sob demanda. Ele some na
[B-20](F4-inline.md), quando o card vai para o lugar da tool.

### B-07 — Os estados em faixas, e a sessão encerrada que retoma 🔲

`StateStrip`: cada estado numa linha, sem empurrar o composer:

- desconectado, reconectando ou segurado pelo servidor (`throttled`): no topo da conversa, com o motivo
  (a `ConnectionLine` de hoje), e some sem mexer na caixa;
- histórico carregando, histórico que falhou ("tentar de novo") e replay parcial: no topo da conversa;
- o aparelho pendente ou revogado (`DeviceStatusBanner`) e o push que não alcança (`PushReachBanner`):
  uma linha cada, que abre a explicação inteira numa folha;
- **encerrada:** acima da caixa, com o motivo (os seis de `SessionCloseReason`). Pela
  [09 · D-05](../09-chat-layout/decisions.md#f1--moldura-do-painel), a caixa **continua ativa**: enviar
  retoma a conversa pelo `resume_controller` (o fluxo do 04) e manda o prompt. A faixa diz que enviar
  retoma, porque retomar abre um subprocesso que conta no teto. Com o teto cheio, a recusa aparece acima
  da caixa, e o texto fica.

### B-08 — O rascunho no app 🔲

Pela [D-05](decisions.md#f1--moldura-da-sessão): tocar numa pasta abre o **rascunho**, sem sessão. O
`SessionStarterController` deixa de mandar `session.start` no toque. O rascunho usa a mesma moldura da
B-06: as dicas no lugar da conversa vazia e a caixa ancorada. Os chips de modelo, modo e esforço vêm do
`GET /catalog?workspacePath=` (08 · D-13) e ficam na [B-11](F2-composer.md). O primeiro envio manda
`session.start` com o que foi escolhido e o prompt, e a tela passa à sessão quando o `session.started`
chega (a S-75 do plano 04 continua). Até o envio, nenhum subprocesso existe. Sair do rascunho não deixa
nada aberto.

### B-09 — Tela pequena, fonte grande, rotação e background 🔲

- **360×640 e 360×400** (o teclado aberto): a caixa está inteira na tela, e a conversa continua com área
  visível;
- **a caixa cresce** até 40 % da altura que sobra (09 · D-04) e depois rola por dentro;
- **fonte em 200 %**: a `AppBar`, as faixas e o composer não cortam. A faixa longa termina em reticências
  e abre inteira num toque. O comando do card de permissão nunca corta
  ([mobile/04](../../architecture/mobile/04-ui.md#responsividade));
- **rotação** e **background**: girar a tela ou mandar o app para trás e voltar não perde o texto
  escrito, a rolagem nem o rascunho. O socket reconecta e faz replay
  ([mobile/03](../../architecture/mobile/03-state-and-data.md#ciclo-de-vida-do-app--o-que-é-específico-do-mobile)).

---

## Cenários cobertos

S-06…S-26.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile
pnpm verify
```
