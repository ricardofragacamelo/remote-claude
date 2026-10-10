# Plano 27 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

As D-01…D-11 vêm da [discovery 09 §12](../../discovery/09-perdas-do-backend-na-conversa.md#12-decisões-em-aberto),
com os mesmos IDs, e a recomendação de lá está na coluna **Gap** enquanto a decisão está aberta. Da
D-12 em diante, nasceram neste plano.

---

## Normas

Valem para o plano inteiro.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | A antiga F6 do plano 26 vem para este plano, e em que ordem | — | — | 2026-10-09 · **vem**: saiu do 26 ([Não entra](../26-mobile-conversation-parity/README.md#não-entra)), com as B-22…B-26 e a B-30 de lá vagas. Ordem 26 → 13 → 27, decidida pelo usuário: este plano começa com os dois concluídos. As D-04, D-05 e D-06 do 26 ficam cobertas pelas D-04 e D-05 daqui. Herdados do 26: os cenários S-72…S-76, S-80 e S-81 de lá, vagos naquele plano e reescritos na matriz daqui, e as entradas do `render-parity.json` que dependiam da fase (B-24) | ✅ |
| D-02 | **Evento WS desconhecido no cliente:** ignorar (contrato atual, [05 · Versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos), S-80 do plano 26) ou mostrar uma linha (R3) | **conflito entre documentos**: o 05 manda ignorar, a R3 pede mostrar. Recomendação da discovery: **mostrar**, uma linha por tipo por sessão, com a lista de calados da F1 antes; o 05 muda junto (B-24). Se a escolha for ignorar, o U-06 sai da B-20 e a F1 fica só como classificação | B-20, B-24 | — | 🔲 |
| D-08 | Zoom da imagem no diálogo do web | recomendação: fora deste plano, registrado como diferença conhecida (o app tem zoom, o web não), e o anexo de imagem da B-22 herda a diferença | — | — | 🔲 |
| D-11 | O que a B-46 do plano 13 exigia e só este plano entrega | — | — | 2026-10-09 · **as duas partes saíram da B-46 e do S-214 do 13** (a skill de usuário com a mensagem que o CLI acrescenta, e a tool MCP com imagem no resultado). As fixtures continuam no 13, e a B-28 daqui as confere na paridade. Decisão do usuário, já aplicada no plano 13 | ✅ |
| D-14 | O plano sobre o núcleo neutro do plano 28: ordem, vocabulário e forma das tasks | — | — | 2026-10-10 · ajuste às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico), pedido do usuário: o plano passa a depender também do 28 concluído, na ordem 26 · F1 → 28 → 26 · F2…F7 → 13 → 27 (README, F0); a **B-07** fica com o ID, mas não cria mais o teste: o vocabulário é o `scripts/engine-vocabulary.json` e o portão é o `neutral:check` do 28, que absorveu a task (a D-03 de lá), e aqui só entram as entradas e os testes dos `kind` e campos novos; os caminhos do adapter passam a `adapter/outbound/engines/claude/` (README, B-08, B-15, B-16); as rotas de transcript, a `/transcripts/:engine/:id/…` (B-15); a **B-21** desenha as instruções injetadas pelo `injected.kind`, e não pelo card do `Skill`; a **B-19** não decide pelo `origin.native`; a **B-24** entra no `render-parity.json` chaveado pelo `kind`; a D-10 ganha a nota do critério de capacidade. Cenários reescritos: S-16, S-17, S-59, S-91 e a justificativa da B-07 e da B-16 (`AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`) | ✅ |

## F0 — Spike

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | O que medir no spike | recomendação: as dez sondas da [B-01](F0-spike.md#b-01--spike-as-medições-da-d-05-): `includeSystemMessages` (custo e subtipos do JSONL), o `systemMessage` de hook, a troca por sobrecarga, o `rate_limit_info`, o volume do `api_retry`, o `conversation_reset` depois do `/clear`, o `worker_shutting_down`, os uuids da retirada, o bloco fora do `tool_result` e a cadeia depois do `/compact` | B-01 | — | 🔲 |
| D-09 | Fixture da recusa com modelo reserva, que não se provoca de propósito | recomendação: **escrita à mão e marcada**, porque o caminho da retirada precisa de teste. A alternativa é ficar sem fixture, com a exclusão registrada, e a B-12 sem prova | B-02, B-12 | — | 🔲 |

## F1 — Conhecidos e calados

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: a classificação vale qualquer que seja a D-02 | — | — | — | — |

## F2 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Destino de cada variante e os nomes do contrato | recomendação: a tabela do [§4](../../discovery/09-perdas-do-backend-na-conversa.md#4-inventário-as-39-variantes-do-sdkmessage) e o rascunho do [§8](../../discovery/09-perdas-do-backend-na-conversa.md#8-contrato), ajustados pelo que a B-01 medir. Inclui a sintética (`injected`) | B-05, B-06, B-08 | — | 🔲 |
| D-06 | A retirada da resposta recusada | a medição da B-01 (sonda 8): se os `retracted_message_uuids` batem com o que os clientes guardam. Recomendação: evento próprio `message.retracted` se baterem; se não, o aviso sem retirada e a exclusão registrada | B-06, B-12, B-23 | — | 🔲 |
| D-10 | Os `kind` canônicos e o `injected`/`attachments` | recomendação: a tabela do §8.2, revista contra a [matriz de capacidades da 03](../../discovery/03-multiplos-motores-de-agente.md#53-matriz-de-capacidades): cada `kind` faz sentido para pelo menos um motor além do Claude, ou é genérico (`agent.info`, `unknown`). **Nota de 2026-10-10 ([D-14](#normas)):** o critério virou o do contrato inteiro no [plano 28](../28-agent-neutral-core/README.md), junto com o de capacidade (capacidade declarada, nunca suposta). Os `kind` que trazem conceito do Claude — `memory.recalled`, `conversation.reset`, `hook.failed`, `extension.failed` — têm de passar por ele antes de entrar no schema: cada um ou serve a outro motor e fica atrás de uma capacidade anunciada, ou vira um `kind` genérico (`agent.info`), ou sai | B-05, B-06 | — | 🔲 |
| D-13 | O teto do `text` de um aviso | recomendação: **2 000 caracteres**, o mesmo para todo `kind`, como `maxLength` do schema; o backend corta e marca `truncated`. O comando cuja saída passa disso (`/context` longo) mostra o começo. Falta conferir o tamanho real da saída de `/cost` e `/context` na B-01 | B-05, B-09 | — | 🔲 |

## F3 — Avisos no backend

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | O que a linha `unknown` mostra | recomendação: o nome da variante e, quando existir, o texto de um campo conhecido do nível de cima, cortado. Nunca o JSON (R-02) | B-13, B-20 | — | 🔲 |
| D-07 | O eco `<local-command-stdout>` e o `local_command_output` juntos | recomendação: um aviso só por saída; o `local_command_output` vence, e o eco só vale sozinho (no histórico, por exemplo) | B-11 | — | 🔲 |

## F4 — Mídia no resultado de tool

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: a forma dos anexos é a D-10, da F2 | — | — | — | — |

## F5 — Histórico

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o que ler sai da medição da D-05 | — | — | — | — |

## F6 — Web e app

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | Onde mora o contador de linhas `unknown` iguais em sequência ("×3") | recomendação: **no cliente**, nos dois com a mesma regra. Cada ocorrência é um evento com o seu `noticeId` no backend, e o replay e o histórico reproduzem cada uma; juntar no backend criaria um evento que muda depois de emitido | B-20 | — | 🔲 |

## F7 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
