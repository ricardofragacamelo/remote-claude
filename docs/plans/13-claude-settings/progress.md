# Plano 13 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F2 — parada em 2026-10-09 antes da primeira task, à espera do [plano 26](../26-mobile-conversation-parity/README.md) (F0 e F1 concluídas)
**Última atualização:** 2026-10-09
**Bloqueios:** a F2 só começa com o [plano 26 — Paridade da conversa no app](../26-mobile-conversation-parity/README.md) concluído ([D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)), decisão do usuário. Antes: nenhum. A B-01 mediu o que as decisões condicionais esperavam ([descoberta §11](../../discovery/01-descoberta-claude-agent-sdk.md#11--quinta-rodada-de-spikes-2026-10-09)), e a ADR-018 registra o resultado

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-09 | 9/9 | ✅ |
| [F1](F1-models-and-modes.md) | B-10…B-17 | 8/8 | ✅ |
| [F2](F2-mcp-servers.md) | B-18…B-30, B-47 | 0/14 | 🔲 |
| [F3](F3-project-config.md) | B-31…B-40 | 0/10 | 🔲 |
| [F4](F4-e2e.md) | B-41…B-46 | 0/6 | 🔲 |
| **Total** | **B-01…B-47** | **17/47** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 215 | 152 | 0 | 63 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 30 | 0 | 0 | 30 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-09 | F0 | 1 · formatação | o spec do spike fora do prettier | `prettier --write` no spec | reinício do portão 1 |
| 2 | 2026-10-09 | F0 | 6 · unit | a lista de frames do `contracts-guards` sem os três novos; o `env-example` acusou a leitura de `FIXTURE_*` pelo servidor de fixture | lista atualizada; o servidor de fixture passou a ser configurado por argumento (`--name`, `--started`, `--secret-variable`) | reinício do portão 1 |
| 3 | 2026-10-09 | F0 | 2 · lint | chave de i18n do web com quatro segmentos (`claudeSettings.section.<id>.x`) — a regra exige três | renomeadas para `claudeSettings.<id>.x` | reinício do portão 1 |
| 4 | 2026-10-09 | F0 | 6 · unit | `report-smoke-live` e `tunnel` dos testes de scripts estouraram o prazo com a máquina em carga (load ~7) | nenhuma no código: passam isolados; rodado de novo com a máquina livre | reinício do portão 1 |
| 5 | 2026-10-09 | F0 | 6 · unit | o teste da S-13 esperava o nome da constraint na mensagem; o Drizzle embrulha o erro | asserção sobre `cause.constraint` | reinício do portão 1 |
| 6 | 2026-10-09 | F0 | 7 · cobertura | funções de `claude-config.schema.ts` em 88,9 % (as callbacks do schema não rodam sem migração pelo Drizzle) | teste unitário do schema que as exerce (bytea, FK em cascata, `NULLS NOT DISTINCT`) — 100 % | reinício do portão 1 |
| 7 | 2026-10-09 | F0 | — | — | — | ✅ `pnpm verify` saiu com 0 — F0 concluída |
| 8 | 2026-10-09 | F1 | 7 · cobertura | o `initialization.json` gravado levava o diretório da máquina (`user_output_styles_dir`), e a S-89 dos fixtures recusa; e, medido à parte, arquivos novos abaixo de 90 % por arquivo (controller sem `GET /claude/models` sem pasta, `FolderAccess` sem usuário sem raiz, a consulta efêmera sem o hook que nega, o repositório com um `?? ''` inalcançável, e no web o retry, o refresh, salvar e limpar a pasta, o esforço recusado) | o gravador passa o `initialization` pelo `anonymised()` (e `--normalise` no gravado); testes de integração e unitários para cada caminho; o ramo inalcançável sai do código | reinício do portão 1 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-09 | [D-23](decisions.md#d-23--modo-próprio-de-subagent-volta-a-perguntar): o hook `PreToolUse` da trilha responde `ask` quando a chamada roda num modo mais largo que o da sessão | a B-01 mediu o subagent de projeto com `permissionMode: acceptEdits` escrevendo sem o `canUseTool`; com o `ask`, a escrita volta a perguntar | `session-runner.ts`, `domain/session/services/mode-widening.ts`, ADR-018, backend/04; S-198 deixa de ser risco aberto |
| 2026-10-09 | [D-24](decisions.md#d-24--shell-inline-desligado-pela-camada-de-flag): o shell inline é desligado pela camada de flag (`settings`), não por `managedSettings` | medido: `managedSettings` não segura o bloco `!`; a flag segura as três origens | B-08 (a allowlist do montador ganha `disableSkillShellExecution`, `managedSettings` vira proibido), B-35, ADR-011 (emenda) |
| 2026-10-09 | [D-25](decisions.md#d-25--a-expansão-de-var-é-nossa): `${VAR}` é expandido pelo backend | medido: `setMcpServers()` entrega o literal | B-21, B-24 |
| 2026-10-09 | [D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): a F2 espera o [plano 26](../26-mobile-conversation-parity/README.md), e a B-46 exige a paridade da conversa no app | o app descarta texto de subagent e mostra markdown e nome de tool MCP crus; este plano multiplica os dois. O usuário parou a execução na F2 | README (dependência, Não entra, R-10, rastreio), F2 (Depende de), F4 (B-46, S-214) |
| 2026-10-09 | [D-32](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): o app ganha o chip só de leitura do status de MCP da sessão | decisão do usuário ao fechar as decisões do plano 26 (26 · D-07) | B-22, README (Não entra, rastreio), S-215 |
| 2026-10-09 | [D-26](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): atalhos dos comandos da tela são `keys` da palette | o editor de atalhos saiu do plano 06 | B-17, B-30, B-40 |
| 2026-10-09 | [D-27](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): a tela entra pela entrada `claude` da navegação global; as Configurações do app ganham um link no rodapé, não uma seção | o plano 06 não criou a seção "Claude" que a D-09 converteria | B-09, B-16, testes que reservavam `/claude` |
| 2026-10-09 | [D-30](decisions.md#decididas-durante-a-execução-b-01-2026-10-09): o painel e a tela leem a **mesma fonte** (a sessão viva responde primeiro ao catálogo), não a mesma rota | o painel precisa do modelo corrente da sessão, que só `GET /sessions/:id/models` tem | B-16, S-56 (teste de integração compara as duas rotas) |
| 2026-10-09 | A regra `claude-config-never-reaches-session` estreitada: recusa a **aplicação** do `session`, não os tipos puros do domínio dele, e não vale para os adaptadores de saída do `claude-config` | o domínio do `claude-config` usa modelo, modo e esforço do domínio do `session`; o ciclo que a regra evita é entre módulos Nest | `dependency-cruiser.config.mjs`, backend/03; a fixture da S-14 continua quebrando a regra |
| 2026-10-09 | Atalhos `Mod+K M` e `Mod+K T` (não `Mod+K Mod+T`) | o navegador reserva Ctrl+T; os outros acordes do produto são `Mod+K <letra>` | B-17, S-59 |
| 2026-09-28 | As 21 decisões em aberto respondidas pelo usuário; 20 seguem a recomendação. **A [D-15](decisions.md#d-15--plugins-do-claude) muda o plano**: plugins de marketplace entram, baixados pelo backend para diretório próprio, só de marketplace declarado no arquivo da allowlist, fixados no commit e atualizados só por decisão — pela mesma porta do plugin local, sem `claude plugin install` e sem ampliar `settingSources` | decisão do usuário, contra a recomendação da D-15 | nasce a B-47 (F2), com S-200…S-213 e os códigos `PLUGIN_MARKETPLACE_NOT_ALLOWED` e `PLUGIN_SOURCE_UNAVAILABLE`; mudam B-02, B-06, B-27, B-29, B-30, o escopo do plano e o R-01 |
| 2026-09-26 | [D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema) — carregar skills do projeto, do usuário e do sistema, pelo plugin local sintético, sem ampliar `settingSources` | decisão do usuário, tomada ao planejar | B-02 (emenda à ADR-011), B-34, B-35, S-154…S-174, S-194, S-197; abriu a D-21 e a D-22 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-09 | Da B-46 (e do S-214), conferir na paridade do plano 26 a mensagem que o CLI acrescenta à skill de usuário e a imagem no resultado da tool MCP. As fixtures continuam aqui | são perdas do backend, que só o plano da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) corrige, e a ordem é 26 → 13 → esse plano: a paridade daqui gravaria o erro de hoje como esperado | o plano da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) (D-11 de lá) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Servidor MCP e plugin são código arbitrário, subindo com a sessão | 🔲 aberto | mitigação por desenho na F2; com a D-15, inclui plugin de marketplace baixado da rede (B-47) |
| R-02 | Segredo de MCP vazando pelo argv, log, trilha, resposta ou erro do servidor | 🔲 aberto | confirmado no `/proc` pela B-01; a entrega passa a ser `setMcpServers()`, e o `realQueryFactory` recusa `mcpServers` não vazio |
| R-03 | Hooks de projeto e `permissionMode` de subagent de projeto agindo sem aprovação | 🔲 aberto | medido na B-01: o hook de projeto **roda** sem aprovação (aberto, a tela dirá); o subagent foi fechado pela D-23 |
| R-04 | Shell inline (`!`) de skill e slash command fora da aprovação | ✅ mitigado | medido: roda fora da aprovação com `allowed-tools`; desligado em toda sessão pela flag (D-24) |
| R-05 | Superfície do SDK `0.3.x` mudando sem aviso | 🔲 aberto | `smoke-live` na B-46 |
| R-06 | Sonda efêmera disputando a capacidade de sessões | 🔲 aberto | D-05 |
| R-07 | Regra `allow` de `mcp__<nome>` autorizando outro programa | 🔲 aberto | D-12 |
| R-08 | Subprocesso do CLI com o ambiente inteiro do backend | 🔲 aberto | B-20; mesma função que o plano 12 precisa |
| R-09 | Divergir dos planos 06 e 08 | 🔲 aberto | D-09, D-14 |
| R-10 | A conversa do app perdendo o que este plano traz para ela | 🔲 aberto | D-31: plano 26 antes da F2; paridade na B-46 |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
