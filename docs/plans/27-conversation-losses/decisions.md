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
| D-02 | **Evento WS desconhecido no cliente:** ignorar (contrato atual, [05 · Versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos), S-80 do plano 26) ou mostrar uma linha (R3) | **conflito entre documentos**: o 05 manda ignorar, a R3 pede mostrar. Recomendação da discovery: **mostrar**, uma linha por tipo por sessão, com a lista de calados da F1 antes; o 05 muda junto (B-24). Se a escolha for ignorar, o U-06 sai da B-20 e a F1 fica só como classificação | B-20, B-24 | 2026-11-01 · **mostra**: uma linha por tipo por sessão, com a lista de calados da F1 vigorando antes da regra nova (R-05). O 05-websocket-protocol.md muda na B-24, não antes — é a entrega declarada daquela task. Decisão do usuário | ✅ |
| D-08 | Zoom da imagem no diálogo do web | recomendação: fora deste plano, registrado como diferença conhecida (o app tem zoom, o web não), e o anexo de imagem da B-22 herda a diferença | — | 2026-11-01 · **entra no escopo**: o usuário pediu zoom no diálogo de imagem do web, junto com o anexo de imagem da B-22/F6, em vez de registrar como diferença conhecida. README (Entra/Não entra) e F6-clients.md (B-22) atualizados | ✅ |
| D-11 | O que a B-46 do plano 13 exigia e só este plano entrega | — | — | 2026-10-09 · **as duas partes saíram da B-46 e do S-214 do 13** (a skill de usuário com a mensagem que o CLI acrescenta, e a tool MCP com imagem no resultado). As fixtures continuam no 13, e a B-28 daqui as confere na paridade. Decisão do usuário, já aplicada no plano 13 | ✅ |
| D-14 | O plano sobre o núcleo neutro do plano 28: ordem, vocabulário e forma das tasks | — | — | 2026-10-10 · ajuste às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico), pedido do usuário: o plano passa a depender também do 28 concluído, na ordem 26 · F1 → 28 → 26 · F2…F7 → 13 → 27 (README, F0); a **B-07** fica com o ID, mas não cria mais o teste: o vocabulário é o `scripts/engine-vocabulary.json` e o portão é o `neutral:check` do 28, que absorveu a task (a D-03 de lá), e aqui só entram as entradas e os testes dos `kind` e campos novos; os caminhos do adapter passam a `adapter/outbound/engines/claude/` (README, B-08, B-15, B-16); as rotas de transcript, a `/transcripts/:engine/:id/…` (B-15); a **B-21** desenha as instruções injetadas pelo `injected.kind`, e não pelo card do `Skill`; a **B-19** não decide pelo `origin.native`; a **B-24** entra no `render-parity.json` chaveado pelo `kind`; a D-10 ganha a nota do critério de capacidade. Cenários reescritos: S-16, S-17, S-59, S-91 e a justificativa da B-07 e da B-16 (`AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`) | ✅ |

## F0 — Spike

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | O que medir no spike | recomendação: as dez sondas da [B-01](F0-spike.md#b-01--spike-as-medições-da-d-05-): `includeSystemMessages` (custo e subtipos do JSONL), o `systemMessage` de hook, a troca por sobrecarga, o `rate_limit_info`, o volume do `api_retry`, o `conversation_reset` depois do `/clear`, o `worker_shutting_down`, os uuids da retirada, o bloco fora do `tool_result` e a cadeia depois do `/compact` | B-01 | 2026-11-01 · **as dez sondas, como escritas** em F0-spike.md, sem alteração. Decisão do usuário. Medidas e registradas em [discovery 01 §13](../../discovery/01-descoberta-claude-agent-sdk.md#13--sétima-rodada-de-spikes-2026-11-01) | ✅ |
| D-09 | Fixture da recusa com modelo reserva, que não se provoca de propósito | recomendação: **escrita à mão e marcada**, porque o caminho da retirada precisa de teste. A alternativa é ficar sem fixture, com a exclusão registrada, e a B-12 sem prova | B-02, B-12 | 2026-11-01 · **escrita à mão e marcada**: o teste de forma das gravadas a reconhece como tal e não a confunde com uma gravação real. Decisão do usuário | ✅ |

## F1 — Conhecidos e calados

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: a classificação vale qualquer que seja a D-02 | — | — | — | — |

## F2 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Destino de cada variante e os nomes do contrato | recomendação: a tabela do [§4](../../discovery/09-perdas-do-backend-na-conversa.md#4-inventário-as-39-variantes-do-sdkmessage) e o rascunho do [§8](../../discovery/09-perdas-do-backend-na-conversa.md#8-contrato), ajustados pelo que a B-01 medir. Inclui a sintética (`injected`) | B-05, B-06, B-08 | 2026-11-01 · **tabela da discovery + ajuste pela B-01**: parte das tabelas §4/§8 como estão, e só se afasta delas onde o spike (D-05) medir um comportamento real diferente do documentado. Decisão do usuário | ✅ |
| D-06 | A retirada da resposta recusada | a medição da B-01 (sonda 8): se os `retracted_message_uuids` batem com o que os clientes guardam. Recomendação: evento próprio `message.retracted` se baterem; se não, o aviso sem retirada e a exclusão registrada | B-06, B-12, B-23 | 2026-11-01 · **condicional à medição**: se a sonda 8 confirmar que os uuids batem, entra o `message.retracted` (B-06, B-12, B-23); se não baterem, fica só o aviso, sem retirada, com a exclusão registrada aqui — nunca um mapeamento de id por tentativa (risco R-06). Decisão do usuário. **A medição não confirmou nem refutou** (B-01, sonda 8): a recusa com modelo de reserva não se provoca de propósito, e o `sdk.d.ts` só documenta a forma dos `retracted_message_uuids` ("um uuid por bloco"), sem uma retirada real para comparar com o `blockId`. Sem confirmação, vale o ramo "não bateram": **`message.retracted` não entra nesta F2** — registrado como [escopo adiado](progress.md#escopo-reduzido-ou-adiado). B-12 e B-23 ficam sem o evento de retirada; a `refusal-fallback-turn` (B-02, escrita à mão) continua disponível para quando uma retirada real for observada (`smoke-live`, B-27) e a decisão puder ser revista | ✅ |
| D-10 | Os `kind` canônicos e o `injected`/`attachments` | recomendação: a tabela do §8.2, revista contra a [matriz de capacidades da 03](../../discovery/03-multiplos-motores-de-agente.md#53-matriz-de-capacidades): cada `kind` faz sentido para pelo menos um motor além do Claude, ou é genérico (`agent.info`, `unknown`). **Nota de 2026-10-10 ([D-14](#normas)):** o critério virou o do contrato inteiro no [plano 28](../28-agent-neutral-core/README.md), junto com o de capacidade (capacidade declarada, nunca suposta). Os `kind` que trazem conceito do Claude — `memory.recalled`, `conversation.reset`, `hook.failed`, `extension.failed` — têm de passar por ele antes de entrar no schema: cada um ou serve a outro motor e fica atrás de uma capacidade anunciada, ou vira um `kind` genérico (`agent.info`), ou sai | B-05, B-06 | 2026-11-01 · **tabela §8.2 + portão de capacidade do plano 28**: cada `kind` que traz conceito do Claude passa pelo critério antes de entrar no schema, como a nota de 2026-10-10 já descrevia. Decisão do usuário. **Aplicado na F2 (B-05):** nenhuma das quatro — `memory.recalled`, `conversation.reset`, `hook.failed`, `extension.failed` — tinha uma capacidade declarada em `EngineCapabilities` (não existe `hooks`, `memory`, `extensions` nem `conversationReset` ali), e abrir uma capacidade nova fica fora do escopo "sem comportamento" da F2. As quatro saem como `kind` próprio e **caem em `agent.info`** — o texto e o `subject` continuam dizendo do que se trata, só a classificação por `kind` fica mais rasa. `command.output` (capacidade `slashCommands`/nenhuma) e `compaction.failed` (capacidade `compaction`, já existente) passaram pelo critério sem mudança. A tabela final, com 12 `kind`: `command.output`, `agent.info`, `agent.notification`, `agent.stopping`, `model.switched`, `model.refused`, `request.retrying`, `usage.limited`, `turn.failed`, `compaction.failed`, `auth.failed`, `unknown` — em `packages/contracts/schema/events/session-notice.schema.json` | ✅ |
| D-13 | O teto do `text` de um aviso | recomendação: **2 000 caracteres**, o mesmo para todo `kind`, como `maxLength` do schema; o backend corta e marca `truncated`. O comando cuja saída passa disso (`/context` longo) mostra o começo. Falta conferir o tamanho real da saída de `/cost` e `/context` na B-01 | B-05, B-09 | 2026-11-01 · **4 000 caracteres**, o mesmo para todo `kind`, acima da recomendação de 2 000 da discovery — o usuário preferiu um teto mais folgado para reduzir truncamento em `/cost`/`/context`. Mesmo mecanismo: `maxLength` no schema, corte com `truncated: true`. Mantém o risco R-02 em vista (texto mais longo retido no replay); revisão de segurança no fim do plano confere o teto | ✅ |

## F3 — Avisos no backend

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | O que a linha `unknown` mostra | recomendação: o nome da variante e, quando existir, o texto de um campo conhecido do nível de cima, cortado. Nunca o JSON (R-02) | B-13, B-20 | 2026-11-01 · **nome da variante + texto de campo conhecido, cortado pelo teto da D-13**; nunca o JSON. Decisão do usuário | ✅ |
| D-07 | O eco `<local-command-stdout>` e o `local_command_output` juntos | recomendação: um aviso só por saída; o `local_command_output` vence, e o eco só vale sozinho (no histórico, por exemplo) | B-11 | 2026-11-01 · **mostra os dois**, contra a recomendação de um só: quando o eco e o `local_command_output` existirem para a mesma saída, a B-11 emite um `session.notice` para cada um, mesmo duplicando conteúdo. Decisão do usuário | ✅ |

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
| D-12 | Onde mora o contador de linhas `unknown` iguais em sequência ("×3") | recomendação: **no cliente**, nos dois com a mesma regra. Cada ocorrência é um evento com o seu `noticeId` no backend, e o replay e o histórico reproduzem cada uma; juntar no backend criaria um evento que muda depois de emitido | B-20 | 2026-11-01 · **no cliente**, mesma regra no web e no app; o backend emite um evento por ocorrência, com `noticeId` próprio. Decisão do usuário | ✅ |

## F7 — Persistência de avisos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão própria em aberto: a fase nasce inteira da D-15, decidida durante a execução da E2E (hoje [F8](#f8--e2e)) — ver lá | — | — | — | — |

## F8 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-15 | A R-10 (os avisos de hook somem ao reabrir a conversa pelo histórico, no app): reduzir o escopo da S-104/B-26 (aceitar como "só ao vivo") ou o backend passar a persistir o aviso por conta própria | a R-10 foi investigada a fundo e a causa raiz está medida, não é um bug de código: o `system:informational`/`system:hook_response` do hook não deixa rastro nenhum no transcript do Claude (mesma medição da F5/B-17, estendida); a dúvida era só de escopo — aceitar a perda ou corrigi-la com uma fonte de verdade própria | B-26, F7 | 2026-11-03 · **persistência própria** (opção 2): o backend guarda o `session.notice` fora do transcript do Claude, numa tabela própria, e o devolve mesclado numa releitura fria do histórico — nunca reduz o que a S-104/B-26 exige. Virou uma fase nova deste plano, com as B-29…B-31 — nasceu como **F8**, mas foi renumerada para **F7** ([F7-notice-persistence.md](F7-notice-persistence.md)) porque a E2E é sempre a última fase ([progress.md](progress.md#decisões-tomadas-durante-a-execução)). Decisão do usuário | ✅ |

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
