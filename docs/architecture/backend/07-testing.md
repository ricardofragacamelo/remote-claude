# Testes do backend

Leia primeiro a [estratégia geral](../shared/06-testing-strategy.md) — as regras comuns
(nomes, AAA, sem `sleep`, sem ordem) estão lá e valem aqui.

Voltar para o [índice do backend](README.md).

---

## Onde mora

```
backend/
├── src/                          nenhum arquivo de teste aqui. Nunca.
└── test/
    ├── unit/                     espelha src/
    │   ├── domain/workspace/value-objects/workspace-path.value-object.spec.ts
    │   └── application/session/start-session.use-case.spec.ts
    ├── integration/
    │   └── adapter/outbound/persistence/session/drizzle-session.repository.spec.ts
    └── support/
        ├── builders/             aSession(), aPermissionRequest()
        ├── fakes/                FakeClaudeSessionPort, FixedClock
        ├── containers/           helper de testcontainers (Postgres)
        └── sdk-script/           roteiros de SDKMessage para o fake do Agent SDK
```

Stack: **Vitest** (mais rápido que Jest em TS, e o mesmo runner do web — uma ferramenta a
menos para o time aprender).

---

## O que testar em cada camada

| Camada | Nível que cobre | Foco |
|---|---|---|
| `domain/` | unit | invariantes, regras, erros |
| `application/` | unit | orquestração, com portas fakeadas |
| `adapter/outbound/persistence` | integração | SQL real contra Postgres real |
| `adapter/outbound/claude` | integração | mapper e bridge contra SDK fake |
| `adapter/inbound/http` | integração | controller + validação + exception filter |
| `adapter/inbound/ws` | integração | socket real, handshake, replay |
| `infrastructure/` | — | wiring puro: excluído da medição |

**Cobertura mínima: 90 % em statements, branches, functions e lines — por arquivo.** Vale para
todo o `src/`, medido sobre unit + integração somados. A regra completa, o que fica fora da
medição e o porquê estão em
[Cobertura](../shared/06-testing-strategy.md#cobertura).

O ponto de atenção aqui é **branches**. É trivial passar de 90 % de linhas cobrindo só o
caminho feliz; neste backend o caminho de erro é o que não pode falhar. Cada `if` de
permissão negada, cada `catch` de `AGENT_UNAVAILABLE`, cada ramo de timeout e cada
`default` de mapper precisa de teste — é justamente o que a dimensão `branches` cobra.

---

## Unit — sem container do Nest

O ponto de `application/` não importar `@nestjs/*` é este:

```ts
// test/unit/application/session/start-session.use-case.spec.ts
const useCase = new StartSessionUseCase(fakeClaude, fakeSessions, fixedClock)
```

Sem `Test.createTestingModule`, sem decorator, sem container. Se você precisou montar o
módulo do Nest para testar um use case, há dependência de framework onde não devia.

**Fake, não mock.** Prefira uma implementação de mentira da porta (`InMemorySessionRepository`)
a um mock com expectativa de chamada. Mock verifica *como* foi feito e quebra em refactor;
fake verifica *o que* aconteceu.

`Clock` e `IdGenerator` são portas em `domain/shared/` justamente para serem fixados no teste.
Nunca chame `new Date()` ou `crypto.randomUUID()` direto no domínio.

---

## Integração — Postgres real

```ts
// test/support/containers/postgres.ts
const container = await new PostgreSqlContainer('postgres:18-alpine').start()
```

- Um container por **suíte**, não por teste (subir custa segundos).
- Migrations rodam uma vez, no setup.
- Isolamento por teste: transação com rollback ao final.
- Nunca SQLite, nunca mock de repositório em teste de integração — ver
  [ADR-004](../shared/00-decisions.md#adr-004--testcontainers-para-testes-de-integração).

Exige Docker no dev e no CI. É o custo aceito para não descobrir em produção que o
comportamento do Postgres difere do banco de mentira.

---

## O fake do Agent SDK

O SDK **nunca** é chamado de verdade em teste automatizado: custa dinheiro, depende de rede,
e não é determinístico.

`test/support/sdk-script/` contém roteiros — sequências de `SDKMessage` que o fake emite:

```ts
const script = sdkScript()
  .init({ sessionId: 'sess_1' })
  .assistantText('Vou listar os arquivos')
  .toolUse('Bash', { command: 'ls -la' })     // dispara canUseTool
  .awaitPermission()                           // trava até a decisão chegar
  .toolResult('file-a\nfile-b')
  .result({ costUsd: 0.01, durationMs: 1200 })
```

Isso permite testar de forma determinística o que mais importa e é mais difícil de reproduzir:
permissão concedida, negada, expirada por timeout, **reentregue após reconexão**, e resolvida
em corrida por dois clientes.

A única suíte que fala com o Claude real é `e2e/smoke-live/` — sob demanda, fora do PR e sem agendamento (`pnpm test:e2e:live:report` abre issue quando ela falha). É ela que
avisa quando o SDK muda o contrato.

---

## A dimensão motor — a suíte de contrato da porta (plano 28, B-43)

Desde o plano 28, a matriz de teste de uma sessão ganhou uma dimensão a mais: **motor**. Todo
comportamento de `AgentSessionHandle`/`AgentEnginePort` que não é específico do Claude — uma sessão
abre, um prompt enfileira enquanto outro roda, uma chamada de ferramenta passa pela
`SessionPermissionGate` antes de rodar, `interrupt()` encerra um turno preso, `close()` é idempotente
— é rodado **duas vezes**: contra o adapter do Claude (sobre o fake do SDK gravado,
`backend/test/fakes/agent-sdk/`) e contra um segundo motor construído só para teste
(`backend/test/fakes/engine/`), com outras ferramentas nativas (`write_file`, `run_shell`,
`ask_user`) e menos capacidades (sem esforço, sem compactação, sem plano, sem contexto, sem custo em
US$) — `TEST_CAPABILITIES` documenta, capacidade por capacidade, por que cada uma está ligada ou
desligada.

**Por quê dois motores, e não um fake mais elaborado do Claude.** Um teste que só o Claude passa
prova, na melhor das hipóteses, que o adapter do Claude está certo — nunca que a abstração do port
aguenta um motor diferente. A ausência de palavra do portão de neutralidade (`pnpm neutral:check`)
prova que o núcleo não *fala* de um motor; só um segundo motor, de verdade, prova que ele não
*depende* de um (discovery 03, §7.7).

A suíte vive em `backend/test/integration/port-contract/`:

- `engine-port-contract.spec.ts` — a bateria universal, parametrizada por motor
  (`describe.each(['claude', 'test'])`), sobre o gateway real;
- `concurrent-engines.spec.ts` — S-122: uma sessão do Claude e uma do motor de teste, na mesma
  pasta, ao mesmo tempo, não se misturam.

**O que entra na bateria universal, e o que fica só do Claude** está documentado no comentário de
topo de `engine-port-contract.spec.ts`, cenário a cenário, com a suíte de hoje de onde cada um veio
e por que generaliza (ou não). A leitura obrigatória antes de adicionar um cenário novo ali.

**Uma descoberta de design, não um corte de escopo:** retomar uma conversa (`resume`) é decidido por
`ResumableConversationSource`, que pergunta ao **transcript store do motor** pela conversa antes de
qualquer coisa ser aberta — isso não é controlado pela flag de capacidade `resume` (que só o
`EngineCapabilities` declara): roda independentemente dela. O motor de teste não tem transcript store
(`history: false`, B-43 não constrói um) — por isso `TEST_CAPABILITIES.resume` é `false`, e
`session-resume.spec.ts` continua inteiramente específico do Claude. Um motor real futuro (Codex,
Copilot) que queira `resume: true` precisa de um transcript store próprio, do mesmo jeito que
`AgentSdkTranscriptAdapter` é o do Claude.

**Como um motor real futuro se encaixa.** O molde é o mesmo que o motor de teste já segue:

1. um adapter de `AgentEnginePort` em `src/adapter/outbound/engines/<motor>/`, com sua própria tabela
   de classificação de ferramentas (`CanonicalTool`/`ToolKind`) e seu próprio `EngineCapabilities`;
2. um `EngineSecurityContract` que realmente se sustenta — não apenas declarado;
3. a composição em `src/infrastructure/modules/engines/` registra o novo adapter nas mesmas
   registries que o Claude usa (`EngineRegistry`, `TranscriptStoreRegistry`, `ToolClassifiers`,
   `RuleDialects`) — nunca um `if (engine === 'codex')` espalhado pelo núcleo;
4. a suíte de contrato da porta ganha uma terceira entrada no `describe.each`, e roda a mesma bateria
   sem reescrevê-la — é exatamente o que provar o motor de teste contra ela já demonstrou que
   funciona.

**S-121 — o motor de teste nunca entra em produção**, estruturalmente: ele vive só em
`backend/test/fakes/engine/`, e a regra `no-test-engine-in-production` de
`dependency-cruiser.config.mjs` quebra o `lint:arch` se qualquer arquivo de `src/` importar dali —
provado por `test/unit/architecture/dependency-rule.spec.ts`. A composição de produção
(`engineSessionProviders`, `claude.providers.ts`) só registra o adapter do Claude, então nomear
`test` em `RC_ENGINES_ENABLED`/`RC_ENGINE_DEFAULT` é tão desconhecido ali quanto nomear `codex`
— `test/unit/infrastructure/modules/engines.spec.ts` prova os dois pelo mesmo mecanismo.

Só a composição de teste wira o motor de teste — `backend/test/fakes/engine/compose.ts`, usado
apenas quando uma suíte pede explicitamente (nunca em `test-app.ts` por padrão).

---

## Cenários obrigatórios do backend

Além dos [cenários e2e](../shared/06-testing-strategy.md#cenários-e2e-obrigatórios):

1. `WorkspacePath.create` rejeita: caminho relativo, `..` que escapa, symlink que escapa,
   caminho fora da allowlist. **Unit, sem I/O.**
2. `canUseTool` chamado duas vezes com o mesmo `requestId` resolve **uma** vez.
3. Permissão sem resposta dentro do timeout → `deny`, e a sessão segue coerente.
4. Duas connections resolvem o mesmo request → a primeira vence, a segunda recebe `ack`.
5. Regra persistida (`scope: project`) auto-resolve sem emitir `permission.requested`.
6. `seq` é estritamente monotônico por sessão, sob publicação concorrente.
7. `resumeFromSeq` anterior ao buffer devolve `gap: true`.
8. Socket morto durante `publish` não trava o loop do Agent SDK.
9. `query.close()` roda mesmo quando o loop lança — sem processo órfão.
10. Erro de domínio vira o status HTTP correto, com `code`, `messageKey` e `traceId`, e **sem**
    `stack` nem caminho de servidor no corpo.
11. Falha de escrita de auditoria **bloqueia** a autorização.
12. Variante desconhecida de `SDKMessage` é descartada com `warn` — a sessão sobrevive.

---

## Testes de arquitetura

A Dependency Rule é verificada por `dependency-cruiser`, e a violação **quebra o build**:

| Regra | Proíbe |
|---|---|
| `domain-is-pure` | `@nestjs/*`, `drizzle-orm`, `@anthropic-ai/*` em `domain/` |
| `application-is-framework-free` | `@nestjs/*` em `application/` |
| `no-outward-dependency` | `domain/` → `application/`; `application/` → `adapter/` |
| `no-cross-domain-internals` | importar caminho profundo de outro domínio em vez do barril |
| `sdk-is-isolated` | `@anthropic-ai/*` fora de `adapter/outbound/claude/` |
| `no-test-in-src` | qualquer `*.spec.ts` dentro de `src/` |
| `no-test-engine-in-production` | `src/` importando `backend/test/fakes/engine/` (plano 28, B-43, S-121) |

Isto não é burocracia: são exatamente as regras que erodem primeiro sob pressa.
