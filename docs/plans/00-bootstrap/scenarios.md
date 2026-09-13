# Plano 00 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Monorepo e contratos — B-01, B-11…B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | schema alterado sem regenerar TS → `contracts:check` falha | err | unit | — | B-14 | ⬜ |
| S-02 | schema alterado sem regenerar Dart → `contracts:check` falha | err | unit | — | B-14 | ⬜ |
| S-03 | frame válido passa pelo guard gerado | eq | unit | — | B-12 | ⬜ |
| S-04 | frame com campo desconhecido é aceito (forward-compat) | eq | unit | — | B-12 | ⬜ |

## Idioma e i18n — B-27, B-34, B-45

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | chave presente em `en` e ausente em `pt-BR` → `i18n:check` falha | err | unit | — | B-45 | ⬜ |
| S-06 | chave órfã (declarada, nunca usada) → falha | err | unit | — | B-45 | ⬜ |
| S-07 | literal apresentável no JSX → lint falha | err | unit | — | B-41 | ⬜ |
| S-08 | params divergentes entre idiomas (`{path}` só em `en`) → falha | err | unit | — | B-45 | ⬜ |

## Logging — B-17, B-28, B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-09 | requisição HTTP emite `http.request` **e** `http.response` com mesmo `traceId` | eq | integração | — | B-17 | ⬜ |
| S-10 | resposta carrega `durationMs` | eq | integração | — | B-17 | ⬜ |
| S-11 | `traceId` ausente no request → backend gera e devolve em `x-trace-id` | err | integração | — | B-17 | ⬜ |
| S-12 | `Authorization` e token nunca aparecem no log | err | unit | — | B-17 | ⬜ |
| S-13 | payload acima de 8 KB é truncado com `truncated: true` | fron | unit | — | B-17 | ⬜ |

## Erros e HTTP — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-14 | erro de domínio vira o status correto, com `code`/`messageKey`/`traceId` | eq | integração | — | B-18 | ⬜ |
| S-15 | corpo de erro **não** contém `stack` nem caminho do servidor | err | integração | — | B-18 | ⬜ |
| S-16 | payload malformado → `400 INVALID_INPUT` | err | integração | `INVALID_INPUT` | B-18 | ⬜ |
| S-17 | validação lista **todos** os campos inválidos em `details[]` | eq | integração | `INVALID_INPUT` | B-18 | ⬜ |
| S-18 | erro inesperado → `500`, sem vazar a mensagem interna | err | integração | `INTERNAL_ERROR` | B-18 | ⬜ |
| S-19 | nenhuma rota devolve `200` com erro no corpo | eq | e2e | — | B-18 | ⬜ |

## Contrato WebSocket — B-11, B-22, B-26, B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-20 | handshake válido → `connection.ready` com `connectionId` | eq | integração | — | B-22 | ⬜ |
| S-21 | sem `connection.authenticate` em 5 s → fecha `4401` | fron | integração | — | B-22 | ⬜ |
| S-22 | token inválido → fecha `4401`, socket não permanece aberto | err | integração | — | B-22 | ⬜ |
| S-23 | `v` incompatível → fecha `4426` com `supportedVersions` | err | integração | — | B-22 | ⬜ |
| S-24 | frame violando o schema → `error`, **sem** derrubar o socket | err | integração | — | B-22 | ⬜ |
| S-25 | `seq` estritamente monotônico sob publicação concorrente | conc | integração | — | B-23 | ⬜ |
| S-26 | cliente descarta evento com `seq <= lastSeq` — sem duplicar | idem | unit | — | B-26 | ⬜ |
| S-27 | reconexão com `resumeFromSeq` válido → replay sem lacuna | est | e2e | — | B-26 | ⬜ |
| S-28 | `resumeFromSeq` anterior ao buffer → `gap: true`, cliente recarrega | fron | e2e | — | B-26 | ⬜ |

## Autenticação OIDC — B-20, B-29, B-36

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-29 | token válido do Keycloak é aceito | eq | integração | — | B-20 | ⬜ |
| S-30 | assinatura inválida → `401` | err | unit | `UNAUTHENTICATED` | B-20 | ⬜ |
| S-31 | `aud` errado → `401` | err | unit | `UNAUTHENTICATED` | B-20 | ⬜ |
| S-32 | `iss` errado → `401` | err | unit | `UNAUTHENTICATED` | B-20 | ⬜ |
| S-33 | token expirado → `401 TOKEN_EXPIRED` | fron | unit | `TOKEN_EXPIRED` | B-20 | ⬜ |
| S-34 | `alg: none` é **rejeitado** | err | unit | `UNAUTHENTICATED` | B-20 | ⬜ |
| S-35 | `kid` desconhecido → recarrega JWKS uma vez, depois rejeita | err | integração | `UNAUTHENTICATED` | B-20 | ⬜ |
| S-36 | resposta `401` não revela **qual** validação falhou | err | integração | — | B-20 | ⬜ |
| S-37 | login PKCE completo com `state` validado | eq | e2e | — | B-29 | ⬜ |

## Clean Architecture — B-15, B-23, B-41

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-38 | import de `@nestjs/*` em `domain/` → build falha | err | unit | — | B-41 | ⬜ |
| S-39 | import de `@nestjs/*` em `application/` → build falha | err | unit | — | B-41 | ⬜ |
| S-40 | `domain/` importando `application/` → build falha | err | unit | — | B-41 | ⬜ |
| S-41 | use case instanciável com `new`, sem container do Nest | eq | unit | — | B-15 | ⬜ |

## Cadeia do front — B-24, B-26, B-30, B-41

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-42 | componente importando `api.ts` ou service → lint falha | err | unit | — | B-41 | ⬜ |
| S-43 | service importando `react` → lint falha | err | unit | — | B-41 | ⬜ |
| S-44 | tela trata os quatro estados (loading, erro, vazio, conteúdo) | eq | integração | — | B-30 | ⬜ |
| S-45 | erro do backend vira mensagem traduzida com `traceId` visível | err | integração | — | B-30 | ⬜ |

## Persistência — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | migration aplica em base limpa (Postgres real, testcontainers) | eq | integração | — | B-19 | ⬜ |
| S-47 | duas instâncias subindo juntas não corrompem o schema (advisory lock) | conc | integração | — | B-19 | ⬜ |
| S-48 | repositório devolve **entity**, nunca row do Drizzle | eq | integração | — | B-19 | ⬜ |
| S-49 | timestamps gravados em `timestamptz`, lidos em UTC | eq | integração | — | B-19 | ⬜ |

## Configuração — B-05, B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-50 | variável obrigatória ausente → processo **não sobe** | err | integração | — | B-16 | ⬜ |
| S-51 | variável com tipo inválido → **não sobe**, com mensagem acionável | err | integração | — | B-16 | ⬜ |
| S-52 | `.env.example` cobre toda variável lida pelo código | eq | unit | — | B-05 | ⬜ |

## Stack e scripts — B-07…B-10, B-37

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-53 | `start-local` sobe tudo e imprime as URLs | eq | e2e | — | B-10 | ⬜ |
| S-54 | Ctrl+C no `start-local` encerra web → backend → compose, **sem processo órfão** | est | e2e | — | B-10 | ⬜ |
| S-55 | `start-local` preserva volumes (`stop`, não `down`) | est | e2e | — | B-10 | ⬜ |
| S-56 | `run-e2e-local` aloca portas livres e não colide com o `start-local` de pé | conc | e2e | — | B-37 | ⬜ |
| S-57 | `run-e2e-local` sai com o **código dos testes**, não com 0 fixo | err | e2e | — | B-37 | ⬜ |
| S-58 | `run-e2e-local` remove volumes e o `.env` efêmero ao final | est | e2e | — | B-37 | ⬜ |
| S-59 | projeto compose órfão de execução anterior é purgado no início | idem | e2e | — | B-37 | ⬜ |
| S-60 | serviço que não sobe no prazo → erro claro e cleanup, sem pendurar | fron | e2e | — | B-09 | ⬜ |

## Testes e cobertura — B-38…B-40, B-42

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-61 | e2e vertical: login → WS → comando → evento renderizado | eq | e2e | — | B-39 | ⬜ |
| S-62 | mesmo cenário no app Flutter | eq | e2e | — | B-40 | ⬜ |
| S-63 | arquivo abaixo de 90 % em qualquer dimensão → `verify` falha | fron | unit | — | B-42 | ⬜ |
| S-64 | `*.spec.ts` dentro de `src/` → lint falha | err | unit | — | B-41 | ⬜ |

## Análise estática — B-41, B-43, B-44

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-65 | bloco duplicado acima do limiar → `jscpd` falha | fron | unit | — | B-43 | ⬜ |
| S-66 | código gerado **não** conta como duplicação | eq | unit | — | B-43 | ⬜ |
| S-67 | segredo commitado → `gitleaks` falha | err | unit | — | B-44 | ⬜ |
| S-68 | `console.log` / `print()` em qualquer módulo → lint falha | err | unit | — | B-41 | ⬜ |
| S-69 | `any` / `dynamic` → typecheck falha | err | unit | — | B-02 | ⬜ |
| S-70 | supressão de regra sem justificativa → lint falha | err | unit | — | B-03 | ⬜ |

## Protocolo de validação — B-46, B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-71 | `verify` roda os portões na ordem barato → caro e para no primeiro vermelho | eq | e2e | — | B-46 | ⬜ |
| S-72 | `verify` sai com código ≠ 0 quando qualquer portão falha | err | e2e | — | B-46 | ⬜ |
| S-73 | `verify:full` cobre os 11 portões | eq | e2e | — | B-46 | ⬜ |

## Scripts de apoio — B-48…B-52

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-74 | `doctor` detecta pré-requisito faltando e diz como resolver | err | e2e | — | B-48 | ⬜ |
| S-75 | `docs-check` reprova link interno quebrado, âncora inexistente e documento fora do índice | err | unit | — | B-49 | ⬜ |
| S-76 | `clean` remove volume órfão que o `compose ls` não enxerga | idem | e2e | — | B-50 | ⬜ |
| S-77 | `db reset` é idempotente — rodar duas vezes deixa o mesmo estado | idem | integração | — | B-51 | ⬜ |
| S-78 | `plan new` gera as 3 seções fixas mais um arquivo por fase | eq | unit | — | B-52 | ⬜ |
| S-79 | todo script sai com código ≠ 0 quando falha | err | e2e | — | B-46 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Configuração (S-50…S-52) | `conc`, `idem` | leitura de env no boot é single-shot, sem concorrência nem repetição |
| Clean Architecture (S-38…S-41) | `conc`, `idem` | são regras estáticas de build; não há execução concorrente a testar |
| Cadeia do front (S-42…S-45) | `idem` | idempotência do stream está coberta em S-26 |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
