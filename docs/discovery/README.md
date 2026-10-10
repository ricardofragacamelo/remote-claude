# Discoveries — índice

Uma **discovery** é o insumo de um plano: fixa o **quê** e o **porquê**, com a evidência medida,
e lista o que falta decidir. Ela **não** é um plano — não tem tarefas com ID nem critério de
conclusão por comando. Quando vira plano, as decisões em aberto passam para o `decisions.md`
dele, e o andamento passa a ser lido no [progresso geral dos planos](../plans/progress.md).

Este arquivo diz **quais** discoveries existem e **em que pé** cada uma está. O estado detalhado
fica no cabeçalho de cada documento; o da implementação, no plano que a absorveu.

---

## Panorama

**Última atualização:** 2026-10-10

| # | Discovery | Criada em | Plano | Implementação |
|---|---|---|---|---|
| 01 | [Como o backend fala com o Claude local (Agent SDK)](01-descoberta-claude-agent-sdk.md) | 2026-09-13 | [ADR-001](../architecture/shared/00-decisions.md#adr-001--claude-agent-sdk-não-cli-direto-nem-managed-agents) · planos [00](../plans/00-bootstrap/README.md)…[05](../plans/05-hardening-operations/README.md) | ✅ implementada |
| 02 | [Workflow de sessões](02-workflow-de-sessoes.md) | 2026-10-03 | — | 🔲 rascunho, sem plano |
| 03 | [Múltiplos motores de agente](03-multiplos-motores-de-agente.md) | 2026-10-03 | — | 🔲 rascunho, sem plano |
| 04 | [Histórico ao vivo e fiel ao Claude Code](04-historico-ao-vivo-e-fiel.md) | 2026-10-04 | [22 — Histórico ao vivo](../plans/22-live-history/README.md) | ✅ implementada |
| 05 | [Perguntas estruturadas (`AskUserQuestion`)](05-perguntas-estruturadas.md) | 2026-10-04 | [24 — Perguntas estruturadas](../plans/24-structured-questions/README.md) | 🔄 em andamento — F0…F2 (backend e fixtures) prontas; web, mobile, histórico e e2e por fazer |
| 06 | [O remote-claude como app desktop (Tauri)](06-app-desktop-tauri.md) | 2026-10-08 | — | 🔲 discovery, sem plano |
| 07 | [Navegar e ler os arquivos da pasta pelo app](07-navegador-de-arquivos-no-app.md) | 2026-10-08 | [25 — Navegador de arquivos no app](../plans/25-mobile-file-browser/README.md) | 🔲 plano criado, não iniciado |
| 08 | [Paridade da conversa no app: o plano 13 e o markdown](08-paridade-da-conversa-no-app.md) | 2026-10-09 | [26 — Paridade da conversa no app](../plans/26-mobile-conversation-parity/README.md) | 🔲 plano criado, não iniciado |
| 09 | [O que o backend perde da conversa, e a mensagem desconhecida na tela](09-perdas-do-backend-na-conversa.md) | 2026-10-09 | [27 — Perdas da conversa](../plans/27-conversation-losses/README.md) | 🔲 plano criado, não iniciado |
| 10 | [Núcleo canônico e agentes de código isolados nas três pontas](10-nucleo-canonico-e-agentes-isolados.md) | 2026-10-10 | [28 — Núcleo neutro de agente](../plans/28-agent-neutral-core/README.md) | 🔲 plano criado, não iniciado |

Legenda: 🔲 não implementada · 🔄 em andamento · ✅ implementada

---

## Por discovery

### 01 — Agent SDK

A base do projeto. Escolheu o Claude Agent SDK em vez do CLI direto ou de Managed Agents
(ADR-001) e mediu o comportamento que os planos 00…05 tornaram código: streaming, `canUseTool`,
retomada de sessão, custo de recurso por sessão. Achados pontuais continuam citados por planos
posteriores (08, 13). Um risco segue **aberto**: o `allow` de projeto que fura o `canUseTool`
([plano 00 · R-01](../plans/00-bootstrap/README.md)).

### 02 — Workflow de sessões

Executar um trabalho inteiro em etapas, encadeando sessões de forma autônoma, com notificação,
decisões humanas pela UI e acompanhamento visual. O workflow e a sua execução são arquivos
legíveis por humano. O fatiamento sugerido em planos está no §21, e as decisões em aberto no §22.
Pré-requisito parcial: a 05 (a fase A do §21 inclui "`AskUserQuestion` respondida pela UI").

### 03 — Múltiplos motores de agente

O que muda para trocar o Claude por outro motor (Copilot, Codex, Gemini CLI) e para suportar
vários por sessão. Conclusão: o SDK está isolado, mas o Claude **como produto** não está — o
trabalho maior é tornar neutros a porta, o contrato WS, o banco e as telas. Fatiamento no §17,
decisões no §18; o §10 lista os ajustes que a 02 terá de absorver.

### 04 — Histórico ao vivo

Tudo o que o Claude Code mostra de uma conversa chega ao web e ao mobile, ao vivo, mesmo quando
ela é conduzida em outro cliente. Virou o plano 22 em 2026-10-04, **concluído**; as decisões do
§11 foram decididas lá, com IDs novos.

### 05 — Perguntas estruturadas

As perguntas do `AskUserQuestion` aparecem como perguntas, não como JSON, e são respondidas pela
UI. Virou o plano 24 em 2026-10-08, com as decisões do §14 com os mesmos IDs. Já usa a forma
canônica da 03 (§6.4).

### 06 — App desktop (Tauri)

Empacotar backend, banco e interface num app desktop com Tauri. O achado principal é o login
dentro da janela (§8). Conflita com o [plano 19 — Distribuição](../plans/19-distribution/README.md)
(§12); decisões no §13 e fatiamento no §16.

### 07 — Arquivos no app

Navegar pela pasta, de dentro da sessão, por uma barra lateral à direita, e ler markdown (com Mermaid
desenhado), PDF, texto e imagem com zoom, sem editar e sem enviar, só baixar. O backend já tem tudo desde o plano 07, então o
trabalho é só no app. Reabre a exclusão dos planos 07 e 21. Achado colateral: um pedido de permissão
não notifica quando há uma tela empilhada sobre a sessão, o que já acontece com o histórico (§4.3).
Virou o plano 25 em 2026-10-08, com as decisões do §16 com os mesmos IDs e o fatiamento do §19
em oito fases (o spike é a F0, e o markdown e o PDF ficaram em fases separadas).


### 08 — Paridade da conversa no app

Respondeu se o plano 13 muda o que aparece na conversa (sim: o conteúdo, não o contrato) e mediu o que o app
perde do que o web desenha — texto de subagent descartado, markdown cru, rótulo de tool, diff, ANSI, tokens — e
o que o backend descarta para as duas pontas. Pela regra do usuário ("no conteúdo e no formato"), propõe um mapa
de paridade conferido por máquina. Virou o plano 26 em 2026-10-09, rodado antes da F2 do plano 13.

### 09 — Perdas do backend na conversa

O que **nenhuma** das duas pontas mostra, porque o backend descarta antes do WS. Aprofunda a F6 do
plano 26, e a medição corrigiu as premissas dela (§2): 22 das 39 variantes do SDK só viram `warn`, o
`/compact` põe dois balões "Você" fantasmas na tela, e o histórico nem pede as mensagens `system`.
Acrescenta duas regras do usuário: a mensagem desconhecida aparece na conversa, não só no log (§7), e
todo evento novo é canônico, para servir a outro motor de agente (§8.1). O plano 26 fica com a
paridade do que já existe; esta vira um plano próprio, que complementa o que falta nas duas pontas (D-01).
Virou o [plano 27 — Perdas da conversa](../plans/27-conversation-losses/README.md) em 2026-10-10, que
roda depois do 26 e do 13; as decisões abertas daqui estão no `decisions.md` dele, com os mesmos IDs.

### 10 — Núcleo canônico e agentes isolados

Prepara o produto para vários agentes de código. Mede de novo o acoplamento ao Claude nas três
pontas: o SDK está isolado, mas o vocabulário vazou para o domínio de permissão, para o contrato e
para os dois clientes. Web e app interpretam ferramentas do Claude em 10 pares de lógica duplicada.
A proposta leva a interpretação para o adapter, com mensagens canônicas no molde do plano 27
(`kind`, `origin`, `messageKey`). O que é de um motor só fica num anel `engines/<motor>/` em cada
ponta, conferido por lint e por um portão de neutralidade com catraca. Detalha o M0 da 03 e lista as
mudanças de AGENTS, ADR e documentação (§8), o impacto nos planos (§9) e a ordem (§10). A
recomendação era rodar entre a F1 e a F2 do 26, o que mudava a ordem 26 → 13 → 27. Virou o
[plano 28](../plans/28-agent-neutral-core/README.md) em 2026-10-10, com a ordem decidida pelo usuário
(D-01) e escrita no [índice dos planos](../plans/README.md#ordem-de-execução).

---

## Ao criar ou promover uma discovery

- **Nova discovery:** o próximo número livre, nome em português, e uma linha nesta tabela.
- **Virou plano:** preencha a coluna **Plano** aqui e o campo **Estado** no cabeçalho do documento.
- **Plano concluído:** marque ✅ aqui quando o plano estiver ✅ no [progresso geral](../plans/progress.md).
