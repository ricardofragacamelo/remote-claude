# Plano 22 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Nasceram na [proposta](../../propostas/historico-ao-vivo-e-fiel.md#11-decisões-em-aberto) como HV-01…HV-12 e
> foram renumeradas aqui (a coluna **Decisão** diz a origem). O usuário respondeu quatro em 2026-10-04, ao criar
> o plano: D-12, D-14, D-15 e D-16 com a recomendação, e **a D-09 contra ela** (abrir a imagem, e não só o
> marcador), o que acrescenta uma rota (B-12). As outras foram decididas pelo agente, com a recomendação da
> proposta, por serem técnicas ou seguirem uma regra que já existe — **exceto a D-17**, em que o agente diverge
> da proposta pelo motivo escrito na linha. O usuário pode rever qualquer uma.

---

## F0 — Normas e contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde o plano entra na sequência | os planos 10, 12, 15, 17, 20 e 21 estão em andamento; `--at` renumera todos os seguintes | escopo | **2026-10-04 — no fim, como 22** (agente). Depende só de 04, 08 e 10, e nenhum plano depende dele. Renumerar com outras sessões escrevendo nos planos seria pedir conflito | ✅ |
| D-02 | Mecanismo de acompanhamento (HV-01) | reconsulta no cliente, assinatura WS com sondagem no backend, ou `fs.watch` | B-01, B-16 | **2026-10-04 — assinatura WS com sondagem no backend** (agente, recomendação). `fs.watch` é proibido pela S-09 do 04; a reconsulta no cliente custa uma página por aba por tick ([proposta §5.1](../../propostas/historico-ao-vivo-e-fiel.md#51-opções-consideradas)). No molde do `workspace.watch` do 05 | ✅ |
| D-03 | Versão do protocolo (HV-12) | se comando novo exige subir `v` | B-01 | **2026-10-04 — aditivo, sem subir `v`** (agente). O [05 §Versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) só sobe `v` ao remover, renomear ou mudar semântica; comando novo que um servidor antigo não conhece é recusado como qualquer `type` desconhecido, e o cliente antigo ignora os eventos novos | ✅ |
| D-04 | Que texto vale onde web e app divergem ("Continuar esta conversa" × "Retomar"; "Pronto" × "Concluída") | — | B-04 | **2026-10-04 — o do web** (agente). É o que o usuário comparou com o VS Code, e o app segue o web desde o [10 · D-04](../10-mobile-chat-layout/decisions.md#f0--normas). Os pares entram no `i18n-shared.json` para não divergirem de novo | ✅ |

## F1 — Mapeamento e leituras

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | Quem compõe o título da ferramenta (HV-05) | backend preenche `title`, ou cliente lê `input.description` | B-07 | **2026-10-04 — o backend preenche `tool.started.title`** com `input.description` quando ela é texto não vazio (agente, recomendação). O contrato já previa o campo; os clientes deixam de conhecer campo do Bash. Sem `description`, `title` fica ausente e o cliente usa o rótulo de hoje | ✅ |
| D-06 | A forma do `blockId` | o Claude Code grava um bloco por entrada **do assistente**, mas a entrada do usuário com texto e imagem tem vários blocos | B-06 | **2026-10-04 — `<uuid>:<índice>` no histórico, `<messageId>:<índice>` ao vivo** (agente; a proposta dizia só `uuid`, que não distingue os blocos de um prompt com imagem). O id do histórico e o ao vivo de um mesmo bloco **não** coincidem: a junção do histórico com o vivo continua por `messageId` (R-07) | ✅ |
| D-07 | O `summary` da ferramenta (HV-06) | 200 caracteres pela cabeça (hoje), últimas N linhas, ou cabeça e cauda | B-08 | **2026-10-04 — texto (via `resultText`), as últimas 5 linhas, até 400 caracteres** (agente, recomendação). Corte marcado com `…` no começo. A saída completa é da rota (B-11) | ✅ |
| D-08 | Teto da rota de saída completa | a saída de um `Read` ou de um build pode ter megabytes | B-11 | **2026-10-04 — 256 KiB de texto; acima disso, os primeiros e os últimos 128 KiB**, com `truncated: true` e `bytes` com o tamanho total (agente). Cabeça e cauda porque o `Read` importa no começo e o teste no fim. Configurável por `RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES` | ✅ |
| D-09 | Ver a imagem de um prompt (HV-08) | só o marcador, ou abrir sob demanda | B-09, B-12, B-30, B-33 | **2026-10-04 — abrir sob demanda** (usuário; **diverge** da recomendação, que era só o marcador). O bloco segue sem os dados no stream e no histórico; a imagem é lida do transcript pela rota da B-12 quando a pessoa pede | ✅ |
| D-10 | Como a rota da imagem serve o conteúdo | a imagem é dado do usuário vindo do transcript; SVG executa script | B-12 | **2026-10-04 — binário com o `Content-Type` da imagem, só `image/png`, `image/jpeg`, `image/gif` e `image/webp`**, com `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` e `Cache-Control: private, no-store` (agente). Outro tipo é `415` com `code` + `messageKey`. Teto de 10 MiB (`RC_TRANSCRIPT_IMAGE_MAX_BYTES`); acima é `413`. O cliente busca com o token pela api e mostra por `blob:` (nunca token em URL) | ✅ |

## F2 — Seguidor no backend

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | Intervalos e tetos (HV-02) | o custo acima de 50 MB e com 4 conversas não foi medido | B-16, B-18 | **2026-10-04 — tick de 1 s com `activity = 'activeElsewhere'`, 10 s parada; 4 assinaturas por conexão, 16 conversas no total** (agente, recomendação), em `RC_TRANSCRIPT_FOLLOW_ACTIVE_MS`, `RC_TRANSCRIPT_FOLLOW_IDLE_MS`, `RC_TRANSCRIPT_FOLLOW_MAX_PER_CONNECTION` e `RC_TRANSCRIPT_FOLLOW_MAX`. A B-19 mede, e o resultado pode rever estes valores (o rastro fica aqui) | ✅ |
| D-12 | Mostrar "trabalhando em outro cliente" inferido (HV-10) | o transcript não grava o estado do turno | B-15, B-23, B-26 | **2026-10-04 — mostrar** (usuário, recomendação), com ajuda que diz que é inferência. Regra da [proposta §5.6](../../propostas/historico-ao-vivo-e-fiel.md#56-trabalhando-em-outro-cliente) | ✅ |
| D-13 | Subagente em execução em outro cliente (HV-09) | — | B-16 | **2026-10-04 — só ao abrir o card**, como no 08 · B-21 (agente, recomendação). O seguidor acompanha só a cadeia principal | ✅ |

## F3 — Acompanhar no web

Nenhuma decisão em aberto: o comportamento sai da [D-12](#f2--seguidor-no-backend) e das normas da B-03.

## F4 — Acompanhar no mobile

Nenhuma decisão em aberto: a confirmação antes do fork é a mesma do web (08 · F6), e o resto sai da
[D-12](#f2--seguidor-no-backend) e das normas da B-03.

## F5 — Fidelidade no web

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-14 | Duração do pensamento no histórico (HV-03) | o transcript grava o **fim** de cada bloco, e o intervalo inclui a latência até o primeiro token: é limite superior | B-27, B-31 | **2026-10-04 — "Pensou por até N s"** (usuário, recomendação). Ao vivo continua "Pensou por N s", medido. Sem `at` na entrada anterior, sem duração | ✅ |
| D-15 | Pensamento **resumido**: à vista ou recolhido (HV-04; revê a [08 · D-17](../08-claude-panel/decisions.md#d-17--thinking)) | — | B-03, B-27, B-31 | **2026-10-04 — à vista, em estilo atenuado**, como o VS Code (usuário, recomendação). O omitido continua recolhido, com "o modelo não mostrou" ao abrir; o `redacted`, idem. A B-03 registra a revisão na D-17 do 08 | ✅ |
| D-16 | Forma da linha do tempo (HV-07) | — | B-28 | **2026-10-04 — autor uma vez por turno**, sem cabeçalho de mensagem sem bloco visível (usuário, recomendação). Turno = da mensagem do usuário até a próxima. Marcadores como o VS Code ficam fora ([README](README.md#não-entra)) | ✅ |

## F6 — Fidelidade no mobile

Nenhuma decisão em aberto: as da F5 valem para o app (D-14, D-15, D-09), e o card recolhível segue o web.

## F7 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-17 | Como o e2e faz a conversa crescer (HV-11) | a proposta recomendou uma fixture num `CLAUDE_CONFIG_DIR` de teste lida pelo SDK real; mas o backend do e2e (`backend/test/e2e/scripted-main.ts`) **substitui** o `TRANSCRIPT_SDK` por um store roteirizado, e escrever o JSONL à mão seria depender do formato interno do Claude Code | B-34 | **2026-10-04 — a porta do e2e que já planta a conversa externa (`/e2e/conversations-elsewhere`) ganha "acrescentar entradas" e "reescrever a cadeia"**, com entradas de gravações reais (agente; **diverge** da proposta). O SDK real continua provado no teste de integração do adapter (`transcript-sdk.spec.ts`), que é onde o `getSessionMessages` real é exercitado | ✅ |

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
