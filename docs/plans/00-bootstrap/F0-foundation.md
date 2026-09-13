# F0 — Fundação do monorepo

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** repositório que já reprova o que precisa reprovar, antes de existir código de produto.

---

## Por que esta fase vem primeiro

Regra que não é verificada por máquina não existe. Se o tooling entrar depois do código, ele
entra encontrando violação — e a saída fácil passa a ser afrouxar a regra. Montar os portões
antes de haver o que reprovar é o que os torna sustentáveis.

---

## Tarefas

### B-01 — Workspace pnpm ✅

`pnpm-workspace.yaml` com `packages/*`, `backend`, `web`, `e2e`. O `mobile/` fica de fora
([ADR-007](../../architecture/shared/00-decisions.md#adr-007--pnpm-workspaces-com-o-flutter-fora)).

`package.json` da raiz contém **apenas** scripts de orquestração e devDependencies de tooling.
Dependência de runtime na raiz é erro: some da árvore do workspace que de fato a usa.

### B-02 — TypeScript base ✅

`tsconfig.base.json` com o strict de
[09](../../architecture/shared/09-code-quality.md#tipagem-estrita--não-negociável), incluindo
`noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`. Path aliases de
[backend/02](../../architecture/backend/02-folder-structure.md#path-aliases) e
[web/02](../../architecture/web/02-folder-structure.md#path-aliases).

`scripts/tsconfig.json` separado, com `checkJs: true` e `allowJs: true` — tipa os `.mjs` por
JSDoc sem exigir build.

### B-03 — Formatação e lint ✅

Prettier e ESLint flat config, **únicos na raiz**, herdados pelos workspaces. Sem override por
pasta: divergência de estilo entre módulos gera diff de ruído.

Regras que já entram aqui: `no-console`, `no-explicit-any`, proibição de `@ts-ignore`,
`eslint-comments/require-description`.

### B-04 — Git hooks ✅

`husky` + `lint-staged`:

| Hook | Roda |
|---|---|
| pre-commit | formatação, lint e `gitleaks` **nos arquivos tocados** |
| pre-push | `typecheck` + unit + `jscpd` |

Pre-commit não roda a suíte inteira — hook lento é hook que o time aprende a pular com
`--no-verify`.

### B-05 — Configuração de ambiente ✅

`.env.example` versionado, com **toda** variável e um comentário do que faz. `.env` real nunca
versionado.

Nenhuma variável para credencial do Claude: ela é herdada de `~/.claude/`
([descoberta §2](../../discovery/01-descoberta-claude-agent-sdk.md)).

### B-06 — Catálogo de comandos no `README.md` ✅

Seção **Comandos** no `README.md` da raiz: todos os comandos disponíveis, com explicação,
pré-requisitos e o que cada um deixa de pé ou derruba.

Fica no `README.md`, não num arquivo à parte: é a primeira coisa que alguém abre ao chegar no
repositório — pelo GitHub, inclusive —, e catálogo em arquivo separado é catálogo que
ninguém encontra e ninguém atualiza.

### B-48 — `scripts/doctor.mjs` ✅

Verifica pré-requisitos antes de qualquer coisa: versão do node, pnpm, docker rodando,
flutter, e portas fixas livres. Saída diz **o que** falta e **como** resolver.

É o primeiro comando de quem clona o repositório — e o que evita que um erro de ambiente seja
depurado como se fosse erro de código.

### B-49 — `scripts/docs-check.mjs` ✅

Valida o grafo da documentação: link interno quebrado, âncora inexistente, e documento que
não aparece no índice da sua área.

Existe porque nenhum outro portão pega isso, e porque a documentação **é** a interface do
agente com o projeto: um índice desatualizado torna o roteamento inútil em silêncio.

### B-52 — `scripts/plan.mjs` ✅

`pnpm plan new <nome>` cria a pasta no
[formato normativo](../README.md#formato-obrigatório) — `README.md`, `scenarios.md`,
`progress.md` e os arquivos de fase. `--progress` recalcula os contadores do `progress.md` a
partir dos arquivos de fase, em vez de mantê-los à mão.

---

## Cenários cobertos

S-52 (`.env.example` completo), S-74 (`doctor` detecta pré-requisito faltando), S-75 (`docs-check` pega link quebrado), S-64 (teste em `src/` reprova), S-68 (`console.log` reprova),
S-69 (`any` reprova), S-70 (supressão sem justificativa reprova), S-78 (`plan new` gera o formato normativo).

S-68 e S-69 têm uma **metade em Dart** (`print()`, `dynamic`) que só existe quando o módulo
mobile existir — ela fecha na [F5](F5-mobile.md), com `dart analyze`. Ver o registro em
[progress.md](progress.md).

---

## Critério de conclusão

```bash
pnpm lint && pnpm typecheck && pnpm format:check
```

E — o teste real desta fase — **um commit propositalmente violador é reprovado pelo hook**:
arquivo com `console.log`, com `any`, e um `.spec.ts` dentro de `src/`.
