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
permissão negada, cada `catch` de `CLAUDE_UNAVAILABLE`, cada ramo de timeout e cada
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

A única suíte que fala com o Claude real é `e2e/smoke-live/` — nightly, fora do PR. É ela que
avisa quando o SDK muda o contrato.

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

Isto não é burocracia: são exatamente as regras que erodem primeiro sob pressa.
