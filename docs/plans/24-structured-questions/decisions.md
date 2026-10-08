# Plano 24 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

Os IDs D-01…D-24 são os da [proposta §14](../../propostas/perguntas-estruturadas.md#14-decisões-em-aberto),
para que o rastro de lá continue valendo. As decididas no planejamento (2026-10-08) seguem a
recomendação da proposta, conferida contra o código; as que mudam o que o usuário vê ou um
comportamento existente ficam 🔲 para o usuário.

---

## F0 — Normas e contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Plano próprio, ou fase do workflow (WF-A) ou do M0 de múltiplos motores? | — | o plano | 2026-10-08, **pedido do usuário**: plano próprio, já na forma canônica. A proposta sugeria o número 22, antes do 19; o 22 e o 23 já existem e foram criados no fim da lista, sem renumerar. Este segue o mesmo caminho: **24** | ✅ |
| D-02 | Quem normaliza as perguntas: o backend ou cada cliente lendo o `input`? | — | B-02, B-04 | 2026-10-08: **o backend**, numa `interaction`. O cliente nunca lê o input do SDK ([ADR-006](../../architecture/shared/00-decisions.md)). É o mesmo princípio dos alcances do plano 23: o servidor calcula, o cliente escolhe | ✅ |
| D-03 | Resposta no fio: por id ou o mapa texto → string do SDK? Veredito com `answers` ou com `updatedInput` genérico? | — | B-02, B-09 | 2026-10-08: **por id**, com a lista de rótulos e o `other` em campo separado; o veredito ganha `answers`, e o runner traduz. A porta continua sem conhecer o SDK, e as colisões da string unida (rótulo com `", "`, opção chamada "Other", texto repetido) não existem no fio | ✅ |
| D-05 | Preview: entra? Em que formato? | — | B-14, B-18 | 2026-10-08: **entra, em markdown**, com o `previewFormat` do SDK no default. No web, o `ChatMarkdown` seguro em caixa monoespaçada; no app, ver [D-21](#f4--mobile) | ✅ |
| D-06 | Notas por pergunta (`annotations.notes`)? | — | — | 2026-10-08: **não**. A extensão também não manda; volta junto com o modo estendido | ✅ |
| D-12 | Onde guardar as respostas | — | B-08 | 2026-10-08: **`permission_requests.answers jsonb null`** (migration nova) e a linha de decisão da trilha. A linha `recorded` (PreToolUse) continua com o input original | ✅ |
| D-13 | Histórico: de onde vêm as respostas | — | B-21 | 2026-10-08: **do nosso banco, pelo `toolUseId`**. Sessão respondida fora do produto mostra as perguntas e o `summary` em texto. O texto do `tool_result` não é fonte: é formato não documentado ([proposta §5.3](../../propostas/perguntas-estruturadas.md#53-o-que-o-cli-devolve-ao-claude-tool_result)) | ✅ |
| D-14 | `permission.resolved` carrega `answers`? | — | B-02, B-08 | 2026-10-08: **sim**, para o outro cliente e para a linha ao vivo; também no replay do `session.attach` e no `GET` de estado | ✅ |
| D-17 | Responder depois, com a sessão caída (o "replay" da extensão) | — | — | 2026-10-08: **fora**. Volta com o estacionamento de sessão da [proposta de workflow](../../propostas/workflow-de-sessoes.md) | ✅ |
| D-18 | Ligar o modo estendido do CLI (`extendedQuestions`)? | — | — | 2026-10-08: **não**. Não está nos tipos públicos do SDK 0.3.277; reavaliar quando entrar | ✅ |
| D-22 | Texto do push de uma pergunta | — | B-03, B-10 | 2026-10-08: chaves **`push.question.title`** e **`push.question.body`**, sem conteúdo do Claude ([workflow §14](../../propostas/workflow-de-sessoes.md)) | ✅ |

## F1 — Backend

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Toda pergunta é obrigatória? | se o usuário quer poder enviar com perguntas em branco | B-05, B-14, B-18 | recomendação: **sim**, como na extensão. Sem o modo estendido, o Claude não é instruído a lidar com resposta parcial | 🔲 |
| D-07 | Prazo de uma pergunta, e a mensagem ao Claude no vencimento | se 10 min é o número certo para quem responde pelo celular | B-06, B-09 | recomendação: **`RC_QUESTION_TIMEOUT_MS` = 10 min**, com as mesmas extensões de hoje (3 × 120 s); no vencimento, `deny` com `PERMISSION_REQUEST_EXPIRED` e a mensagem "The user did not answer in time. Do not assume an answer; ask again or stop." | 🔲 |
| D-08 | Regra de allow para `HUMAN_ONLY_TOOLS`: ignorada na leitura e recusada na API; deny mantido. Vale também para `ExitPlanMode`? | o `ExitPlanMode` tem o mesmo problema (uma regra de allow aprova planos sem ninguém ver), mas incluí-lo muda um comportamento que existe | B-07 | recomendação: **sim para os dois**, usando a constante inteira, e registrar a mudança. Um deny continua valendo: é um jeito legítimo de dizer "não me pergunte nada nesta pasta" | 🔲 |
| D-09 | Sugestões de escopo e alcances numa pergunta | — | B-06 | 2026-10-08: **`suggestions: []` e `reaches: []`**; `scope` e `reach` na resposta são ignorados (vale `once`). O schema já aceita lista vazia (sem `minItems`), conferido. Os `reaches` são novidade do plano 23, que a proposta não conhecia | ✅ |
| D-10 | `riskHint` e `defaultToNo` | — | B-06 | 2026-10-08: **`read`** (`isReadOnly()` é `true` no CLI; também tira a confirmação em dois passos do app) e **`false`** | ✅ |
| D-16 | Input malformado | — | B-04, B-05 | 2026-10-08: **`malformed: true`, card só de recusa** com explicação; `allow` recusado no backend. Nunca há `allow` sem respostas | ✅ |
| D-25 | Uma lista nova de "ferramentas interativas", como na proposta, ou a `HUMAN_ONLY_TOOLS` do plano 23? | — | B-07 | 2026-10-08: **`HUMAN_ONLY_TOOLS`**. É a mesma ideia ("não é permissão, é o Claude pedindo uma resposta"), já no domínio. Duas listas divergiriam | ✅ |
| D-26 | Regras de allow para `AskUserQuestion` já gravadas | quantas existem no banco de desenvolvimento não muda a decisão | B-07 | 2026-10-08: **ignoradas na leitura**, com log `debug`, sem migração de dados. Como aparecem na tela de regras é do [plano 15](../15-rules-management/README.md), que ainda não começou a tela | ✅ |

## F2 — Fixtures

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-19 | Fake SDK: passar a honrar o veredito ou registrar o que recebeu? | — | B-12 | 2026-10-08: **registrar**, e regravar as fixtures com respostas. A prova de que a resposta chega fica no unit do runner e na integração que lê o registro; honrar o veredito exigiria um segundo modelo de comportamento do CLI dentro do fake | ✅ |

## F3 — Web

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-15 | Recusar: botão explícito ou só ✕/Esc? Motivo obrigatório? | — | B-14, B-18 | recomendação: **botão "Não responder"**, mais Esc no web; motivo opcional, e a chave padrão de recusa quando vazio. A extensão não tem botão, só ✕/Esc, o que no celular não existe | 🔲 |
| D-20 | Inputs nativos ou `radio-group`/`checkbox` do shadcn (Radix, dependência nova)? | — | B-14 | 2026-10-08: **nativos, estilizados**, como no `PlanApprovalCard`, `SettingChoice` e `ExportDialog` | ✅ |
| D-23 | Destacar a opção que termina em "(Recommended)" | — | B-14, B-18 | 2026-10-08: **destacar**, sem pré-selecionar e sem alterar o rótulo (a resposta precisa dele exato). Reversível e sem efeito no contrato | ✅ |
| D-24 | Avanço automático na escolha única | — | B-14, B-18 | 2026-10-08: **sim**, nos dois clientes, como na extensão — os planos 09 e 10 fixaram o molde do plugin do VS Code. No app, o Voltar fica sempre à vista | ✅ |

## F4 — Mobile

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | A biometria (`approvalLock`) vale para responder uma pergunta? | o lock hoje vale para todo `allow`; quem o ligou pode esperar que valha para tudo | B-17 | recomendação: **não**: responder não autoriza execução | 🔲 |
| D-21 | Dependência de markdown no app para o preview? | — | B-18 | 2026-10-08: **não agora**; `SelectableText` monoespaçado. O plano 22 também deixou o markdown do app de fora | ✅ |

## F5 — Histórico

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-27 | O enriquecimento vale também para o seguidor do plano 22 (sessão conduzida noutro cliente)? | — | B-21 | 2026-10-08: **sim, pelo mesmo caminho**: o seguidor lê o mesmo transcript e passa pelo mesmo enriquecedor. Sessão de outro cliente não tem linha nossa, e mostra o `summary` (D-13) | ✅ |

## F6 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: os cenários de e2e saem da F2 (fixtures) e das decisões acima | — | — | — | — |
