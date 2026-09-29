# Plano 06 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F1 concluída; a próxima é a [F2](F2-open-folder.md)
**Última atualização:** 2026-09-29
**Bloqueios:** nenhum

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · ✅ concluída · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-05 | 5/5 | ✅ |
| [F1](F1-directory-browse.md) | B-06…B-12, B-40 | 8/8 | ✅ |
| [F2](F2-open-folder.md) | B-13…B-16 | 0/4 | 🔲 |
| [F3](F3-layout.md) | B-17…B-22 | 0/6 | 🔲 |
| [F4](F4-commands.md) | B-23…B-27 | 0/5 | 🔲 |
| [F5](F5-screens.md) | B-28…B-34 | 0/7 | 🔲 |
| [F6](F6-e2e.md) | B-35…B-39 | 0/5 | 🔲 |
| **Total** | **B-01…B-40** | **13/40** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 182 | 100 | 0 | 82 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 21 | 0 | 0 | 21 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 0 | 2026-09-28 | F0 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; o `web/README.md` mudou depois do disparo, então o ciclo seguinte recomeça do 1 |
| 1 | 2026-09-28 | F0 | 7 — cobertura (backend) | 2449/2449 asserções passam; uma suíte, `drizzle-session-origin.repository.spec.ts` (não tocada), falhou no **teardown**: o Docker recusou remover um container ainda rodando (`HTTP 409 … container is running`). Sozinha, 3 de 3 verdes — corrida do daemon sob a carga do `verify:full`, não da entrega | nenhuma no código; reinício honesto do portão 1 | reinício do portão 1 |
| 2 | 2026-09-28 | F0 | 10 — segurança (`osv-scanner`) | portões 1–9 verdes, e2e incluso; advisory publicado para `multer@2.3.0` (GHSA-3pph-fpjx-jg34, DoS por escrita órfã em upload abortado; corrigido na 2.4.0), transitivo de `@nestjs/platform-express` — não veio da entrega | o override `pnpm.overrides.multer` sobe de `>=2.3.0` para `>=2.4.0`; o advisory não foi ignorado | reinício do portão 1 |
| 3 | 2026-09-28 | F0 | nenhum | depois do `multer` 2.4.0 | — | **11 portões verdes** (`pnpm verify:full` saiu 0) |
| 4 | 2026-09-29 | F1 | 1 — formatação | 25 arquivos novos da F1 fora do Prettier | `prettier --write` só neles | reinício do portão 1 |
| 5 | 2026-09-29 | F1 | 2 — lint | `parseArguments` do `pnpm allowlist` com complexidade 14 (teto 10) | opções numa tabela (`Map`) e posicionais numa função própria; comportamento igual, testes intactos | reinício do portão 1 |
| 6 | 2026-09-29 | F1 | 5 — duplicação (limiar 0) | 7 clones: `close`/`forget` do repositório de pastas, a entidade de notificação com os getters da `Device`, `omitting`/`redact`, os dois jobs de varredura, as duas listagens de pastas e dois casos de uso de uma linha | `letGo` no repositório; entidade com parameter properties; `omitting` por cópia; base `SweepJob` (o `DeviceExpiryJob` passou a usá-la, logs iguais); `RevalidatedFolders` compartilhada pelas listagens | reinício do portão 1 |
| 7 | 2026-09-29 | F1 | nenhum | `pnpm verify` (1–7) | — | **portões 1–7 verdes**; 172 arquivos na barra de cobertura, 99,5 % das linhas |
| 8 | 2026-09-29 | F1 | 7 — cobertura (backend), no `verify:full` | 2761/2762 asserções passam; a que falhou é do plano 05 (`push.flow.spec`, S-51): "no frame arrived" depois de 15 s, sob a carga do `verify:full`. Sozinha, 3 de 3 verdes, e verde no ciclo 7 com o mesmo código — a corrida de carga já vista no plano 05 (ciclos 20 e 26 de lá), não da entrega | nenhuma no código; reinício honesto do portão 1 | reinício do portão 1 |
| 9 | 2026-09-29 | F1 | nenhum | `pnpm verify:full` (1–11) | — | **11 portões verdes** (`pnpm verify:full` saiu 0): integração 285 s, e2e 151 s, segurança e contratos limpos |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-26 | F3 (layout) dividida em três fases: F3 moldura e casca, F4 comandos e notificações, F5 telas separadas; o e2e passou a F6 | cada parte é um ciclo de validação próprio, com outra superfície de teste | fases F3…F6, `F4-e2e.md` renomeado para `F6-e2e.md` |
| 2026-09-26 | Paridade com o VS Code restrita à de arquivos (decisão do usuário) | "não precisamos de tudo do VS Code" | saíram editor de atalhos, vários temas, zen mode, layout configurável, menu completo (fica o Arquivo), walkthrough e a confiança da pasta (servia a planos removidos) |
| 2026-09-26 | Chat do Claude e arquivos/editor na mesma aba, lado a lado (decisão do usuário) | o chat não é tela própria | B-21, B-22, B-33, S-116, S-117, S-150 |
| 2026-09-28 | As 14 decisões em aberto fechadas pelo usuário, em perguntas uma a uma; dez seguem a recomendação | as fases dependiam delas para começar | [decisions.md](decisions.md) D-04…D-17 |
| 2026-09-28 | Rotas `/sessions/$id`, `/history` e `/history/$conversationId` removidas neste plano, sem deep link (D-07, contra a recomendação) | escolha de navegação do usuário, que aceitou o histórico fora do web até o plano 08 | B-05, B-33, B-39, S-06, S-150, S-163; specs `history-and-resume` e `commands-and-undo` migram na B-33; [plano 08](../08-claude-panel/decisions.md) ganhou a D-24 |
| 2026-09-28 | Histórico de notificações no servidor: 30 dias, teto de 200, "lida" sincronizada (D-17, contra a recomendação) | o usuário quer reencontrá-lo em outro dispositivo | nova B-40 na F1, B-03, B-04, B-26, S-131, S-132, S-167…S-178, S-182 |
| 2026-09-28 | Aba inativa: sessões e terminais continuam anexados (D-11, híbrido) | resolve a divergência com os planos 08 e 10 | B-20, S-108, S-181; D-11 do plano 08 fechada; nota do plano 10 · B-16 |
| 2026-09-28 | Recarga da allowlist só por `SIGHUP`; o watch do arquivo foi considerado e descartado (D-15) | manter a regra "recarga explícita" de backend/03 | B-11, S-62, S-179, S-180 |
| 2026-09-28 | S-03 → B-16, S-05 → B-20 e a metade "removidas" do S-06 → S-150 (D-18, decisão do usuário) | dependem da boas-vindas, das abas no servidor e da remoção das rotas, que são de fases seguintes; remover as rotas já quebraria o e2e que só migra na B-33 | F0, F2, F3, F5, S-03, S-05, S-06, S-150 |
| 2026-09-28 | O `i18n:check` passa a reprovar `messageKey` que o backend envia e o catálogo do web não traduz (S-01) | a checagem de órfãs lia o backend só como uso; a chave enviada e nunca declarada chegava à tela crua — e havia uma: `session.error.invalidTransition`, agora traduzida | `scripts/lib/i18n.mjs`, `scripts/i18n-check.mjs` |
| 2026-09-28 | A rota de versões do "Sobre" é `GET /diag/versions`, no módulo `diag` | a B-03 deixava o módulo ao documento; `diag` já é o do ping, e `/health` não tem autenticação | [backend/03 · diag](../../architecture/backend/03-modules.md#diag), B-12 |
| 2026-09-28 | DTOs Zod das rotas do `workspace` e tipos do web escritos na F0; os de versões e notificações nascem com os seus módulos (B-12, B-40) | o contrato do `workspace` é o que o S-02 testa; os outros dois ainda não têm módulo onde morar | `workspace.dto.ts`, `features/workspace/types/workspace.ts` |
| 2026-09-29 | O "catálogo de chaves" das notificações é uma lista fechada no domínio, chave → parâmetros ([D-19](decisions.md#d-19--o-catálogo-de-chaves-das-notificações), **a confirmar pelo usuário**) | nenhum documento dizia qual catálogo; o do web não é legível pelo backend | `domain/notification`, traduções novas no web (`notification.*`), B-26 acrescenta as suas |
| 2026-09-29 | O próprio app grava o pid em `RC_PID_FILE` (variável nova) e o Nest deixa de escutar `SIGHUP` no shutdown ([D-20](decisions.md#d-20--como-o-pnpm-allowlist-acha-o-processo-do-app)) | o `pnpm dev` roda o backend sob `tsx watch`: o pid disparado é o do watcher; e o `enableShutdownHooks()` sem lista fecharia a aplicação no sinal | `.env.example`, `bootstrap.ts`, `LifecycleModule`, `stack.mjs`; o `.env` local ganhou a linha |
| 2026-09-29 | Teto de 20 recentes não fixados; tirar dos recentes uma pasta aberta mantém a aba; `rootLabel` do recente vira `string \| null` ([D-21](decisions.md#d-21--o-teto-de-recentes-e-o-recente-de-uma-aba-aberta)) | a B-09 não dava o número, e recente e aba são a mesma linha | `folder-rules.ts`, `workspace.dto.ts`, backend/03 |
| 2026-09-29 | O teto de 1000 da listagem fica (D-05, medido) | o maior diretório real, `node_modules/.pnpm` deste monorepo, tem 977 subpastas | nenhuma mudança |
| 2026-09-29 | Node mínimo sobe de 22 para **22.18** | o `pnpm allowlist` importa o schema de `packages/config/src/*.ts` direto, e o Node só tira os tipos sem flag a partir daí (D-09) | `package.json` (`engines`), `pnpm doctor`, README |
| 2026-09-29 | `CONFLICT: 409` entra no catálogo do código | o documento já tinha a linha desde a F0; no código ela faltava e o `CONFLICT` sairia como 500 | `error-catalogue.ts` |
| 2026-09-29 | Web: tipos de versões e de notificações **não** nascem na F1 | sem consumidor no web até a B-26/B-32, seriam arquivos órfãos; os DTOs do backend são o contrato | F4, F5 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | Redesenho da Auditoria e das Regras | têm plano próprio | planos [12](../12-audit-explained/README.md) e [13](../13-rules-management/README.md) |
| 2026-09-26 | Profundidade de Dispositivos e de Logs e diagnóstico | têm plano próprio | planos [15](../15-devices/README.md) e [16](../16-logs-and-diagnostics/README.md) |
| 2026-09-26 | Seção "Claude" das Configurações | configuração do Claude é tela própria | plano [11](../11-claude-settings/README.md) |
| 2026-09-26 | Editor de atalhos, vários temas, zen mode, layout configurável, menu completo, walkthrough | decisão do usuário: paridade é a de arquivos | fora do produto |
| 2026-09-28 | Ler, continuar e desfazer conversa antiga pelo web (hoje em `/history`), e os cenários de e2e do web que só entravam por lá | decisão do usuário (D-07): as rotas antigas saem sem deep link | plano [08](../08-claude-panel/README.md), view Sessões; o app continua com o histórico |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Listagem de pastas vira um mapa da máquina | 🔲 aberto | mitigação nas B-06…B-08, D-03, D-04 |
| R-02 | Cópia local da allowlist afrouxa a fronteira | 🔲 aberto | mitigação na B-10, D-09 |
| R-03 | Estado vazando entre abas de pasta | 🔲 aberto | mitigação nas B-20, B-33 |
| R-04 | Plano grande — sete fases | 🔲 aberto | escopo cortado pela decisão do usuário; corte extra se registra aqui |
| R-05 | Abas inativas consomem memória e anexos | 🔲 aberto | D-11 decidida (sessões e terminais anexados, teto 8); falta medir a memória por aba |
| R-06 | Atalhos que o navegador não entrega | 🔲 aberto | D-16 decidida; falta medir nos três navegadores |
| R-07 | Deep links de hoje quebrados pela moldura | 🔲 aberto | S-06, S-91, S-163; os de sessão e histórico saem por decisão (D-07) |
| R-08 | Planos 11–13 e 14–16 dependem dos registros deste | 🔲 aberto | registros documentados na F0 ([web/03 · Os registros](../../architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam)); testados na F3–F5 |

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
