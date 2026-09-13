# F7 — Portões e CI

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** todas as anteriores.
**Entrega:** `pnpm verify:full` sai com código 0 — o critério de conclusão do plano.

---

## Tarefas

### B-41 — Regras de arquitetura como lint

Toda regra estrutural da documentação ganha verificador. As tabelas completas estão em
[09](../../architecture/shared/09-code-quality.md#regras-de-arquitetura-como-lint).

| Módulo | Ferramenta | Regras |
|---|---|---|
| Backend | `dependency-cruiser` | `domain-is-pure`, `application-is-framework-free`, `no-outward-dependency`, `no-cross-domain-internals`, `sdk-is-isolated`, `identity-is-isolated`, `no-test-in-src` |
| Web | `eslint-plugin-boundaries` | `no-api-in-components`, `no-react-in-services`, `no-cross-feature-internals`, `shared-cannot-import-features` |
| Mobile | `import_lint` | `domain-is-pure`, `presentation-cannot-reach-data`, `no-cross-feature-internals` |

`sdk-is-isolated` e `identity-is-isolated` já entram aqui, mesmo sem o Agent SDK no bootstrap:
a regra precisa existir **antes** do código que ela protege, senão nasce já violada.

### B-42 — Cobertura

**90 % em statements, branches, functions e lines — `perFile`.** Não existe média que
compense: um arquivo em 70 % não é salvo por outro em 99 %.

Medida sobre unit + integração somados. E2E não conta.

Exclusões **declaradas no config, com justificativa**: gerado (`packages/contracts/src`,
`*.g.dart`, `*.freezed.dart`, `l10n/`), `main.ts`, `*.module.ts`, `*.d.ts`, barris.

`branches` é a dimensão que reprova. É trivial ter 95 % de linhas e 60 % de branches: basta
nunca testar o caminho de erro.

### B-43 — Duplicação

`jscpd` (TS) e `dart_code_metrics` (Dart), mais o CPD do Sonar. Limiar de bloco: 30 tokens /
5 linhas. Teto: **≤ 3 %** em código novo.

Fora da medição: código gerado, fixtures de teste, wiring. Duplicação **entre pontas** (web e
mobile) não conta — é tradução, não cópia.

### B-44 — Segurança estática

| Checagem | Pega |
|---|---|
| `gitleaks` | segredo commitado (pre-commit **e** CI) |
| `osv-scanner` / `pnpm audit` | dependência vulnerável nos três módulos |
| `semgrep` | path traversal, injeção de comando, JWT com `alg` do token, SQL concatenado |

Mais as **regras próprias do produto**, que existem porque o furo acontece em silêncio:

- `query()` sem `settingSources: ['project']` — omitir carrega o escopo `user` e desliga o
  `canUseTool` sem erro nem aviso ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse));
- `query()` sem `hooks.PreToolUse` — sem ele não há trilha de auditoria;
- `allowDangerouslySkipPermissions` fora de `false`;
- `permissionMode: 'bypassPermissions'` como default.

### B-45 — `i18n:check`

Paridade de chaves `en` ↔ `pt-BR`, ausência de órfã, e params casando entre idiomas.

### B-46 — `verify` e `verify:full`

Os portões de [11](../../architecture/shared/11-validation-protocol.md#estágio-2--os-portões),
**na ordem barato → caro**, parando no primeiro vermelho.

```bash
pnpm verify        # portões 1-7   — ciclo rápido, durante a implementação
pnpm verify:full   # portões 1-11  — o que define "pronto"
```

Existe um comando só de propósito: checklist que exige lembrar de sete comandos é checklist
executado pela metade.

### B-47 — CI

Os portões de [06](../../architecture/shared/06-testing-strategy.md#portões-de-ci). Docker
disponível (testcontainers e compose não têm alternativa — risco R-05, aceito).

`smoke-live` **não** roda em PR: nightly e sob demanda.

---

## Cenários cobertos

S-63, S-64 (cobertura e teste em `src/`), S-65…S-70 (estática), S-71…S-73 (protocolo).

---

## Critério de conclusão — e do plano inteiro

```bash
pnpm verify:full     # código 0
```

Mais a prova de que os portões mordem: uma alteração que derrube a cobertura de um arquivo
abaixo de 90 % **reprova**, e o vermelho reinicia o ciclo do primeiro portão.
