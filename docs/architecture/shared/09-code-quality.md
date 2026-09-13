# Qualidade de código — análise estática

**Obrigatória nos três módulos: backend, web e mobile.** Nenhum código entra sem passar.

Voltar para o [índice transversal](README.md).

---

## O princípio

**Regra que não é verificada por máquina não existe.** Tudo neste repositório que está escrito
como "sempre faça" ou "nunca faça" precisa de um verificador automático — senão vira folclore
que erode na primeira semana apertada.

Análise estática é o que transforma este conjunto de documentos em algo que se sustenta sem
depender de quem está revisando.

### Os quatro portões, em ordem de custo

```
1. Formatação      → automática, não se discute em review
2. Lint            → regra sintática e de arquitetura
3. Tipagem         → strict, sem escapatória
4. Quality gate    → complexidade, duplicação, cobertura, segurança
```

Rodam nesta ordem: o mais barato primeiro, para o feedback chegar rápido.

---

## Ferramentas por módulo

| Preocupação | Backend | Web | Mobile |
|---|---|---|---|
| Formatação | Prettier | Prettier | `dart format` |
| Lint | ESLint (flat config) | ESLint (flat config) | `dart analyze` + `custom_lint` |
| Tipagem | `tsc --noEmit` (strict) | `tsc --noEmit` (strict) | analyzer em modo strict |
| Arquitetura | `dependency-cruiser` | `eslint-plugin-boundaries` | `import_lint` |
| Complexidade | SonarQube | SonarQube | SonarQube (plugin Dart) |
| **Linhas repetidas** | SonarQube + `jscpd` | SonarQube + `jscpd` | SonarQube + `dart_code_metrics` |
| Dependência vulnerável | `pnpm audit` + `osv-scanner` | idem | `dart pub outdated` + `osv-scanner` |
| Segredo commitado | `gitleaks` | `gitleaks` | `gitleaks` |
| Padrão inseguro | `semgrep` | `semgrep` | `semgrep` |

**SonarQube é o portão agregador**, comum aos três. É onde complexidade, duplicação,
cobertura e *security hotspot* viram um único veredito por PR.

---

## Tipagem estrita — não negociável

### TypeScript (backend e web)

```jsonc
// tsconfig.base.json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,     // arr[0] é T | undefined — e é a verdade
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true,
  "verbatimModuleSyntax": true
}
```

- **`any` é proibido.** `@typescript-eslint/no-explicit-any` em `error`. Não sabe o tipo? É
  `unknown`, e você estreita.
- **`as` é suspeito.** Cast é afirmação sem prova. Use type guard ou schema (Zod).
- `@ts-ignore` **proibido**; `@ts-expect-error` permitido **com** comentário explicando e
  link para a issue. A diferença importa: `expect-error` falha quando o problema é corrigido,
  e o débito se resolve sozinho.

### Dart (mobile)

```yaml
# analysis_options.yaml
analyzer:
  language:
    strict-casts: true
    strict-inference: true
    strict-raw-types: true
  errors:
    invalid_annotation_target: ignore   # gerado por freezed
    missing_required_param: error
    missing_return: error
```

`dynamic` recebe o mesmo tratamento que `any`. Ver
[mobile/06-testing.md](../mobile/06-testing.md).

---

## Regras de arquitetura como lint

Cada regra estrutural desta documentação tem um verificador. **A violação quebra o build.**

### Backend — `dependency-cruiser`

| Regra | Proíbe | Documento |
|---|---|---|
| `domain-is-pure` | `@nestjs/*`, `drizzle-orm`, `@anthropic-ai/*` em `src/domain/` | [01](../backend/01-clean-architecture.md) |
| `application-is-framework-free` | `@nestjs/*` em `src/application/` | [01](../backend/01-clean-architecture.md) |
| `no-outward-dependency` | `domain/` → `application/`; `application/` → `adapter/` | [01](../backend/01-clean-architecture.md) |
| `no-cross-domain-internals` | caminho profundo de outro domínio, em vez do barril | [02](../backend/02-folder-structure.md) |
| `sdk-is-isolated` | `@anthropic-ai/*` fora de `adapter/outbound/claude/` | [04](../backend/04-claude-integration.md) |
| `identity-is-isolated` | SDK de provedor de identidade fora de `adapter/outbound/identity/` | [08](08-authentication.md) |
| `no-test-in-src` | `*.spec.ts` dentro de `src/` | [06](06-testing-strategy.md) |

### Web — `eslint-plugin-boundaries`

| Regra | Proíbe | Documento |
|---|---|---|
| `no-api-in-components` | `@/shared/api` ou `*/services/*` dentro de `components/` | [01](../web/01-architecture.md) |
| `no-react-in-services` | `react` dentro de `services/` | [01](../web/01-architecture.md) |
| `no-cross-feature-internals` | caminho profundo entre features | [02](../web/02-folder-structure.md) |
| `shared-cannot-import-features` | `shared/` importando `features/` | [02](../web/02-folder-structure.md) |

### Mobile — `import_lint`

| Regra | Proíbe |
|---|---|
| `domain-is-pure` | `flutter/*`, `dio`, `riverpod` em `domain/` |
| `presentation-cannot-reach-data` | `presentation/` importando `data/` direto, sem passar pelo domínio |
| `no-cross-feature-internals` | caminho profundo entre features |

### Regras comuns às três

| Regra | Por quê |
|---|---|
| Sem `console.log` / `print()` | [logging](03-logging.md) |
| Sem texto literal apresentável na UI | [i18n](02-i18n.md) |
| Sem import de framework em camada de domínio | Dependency Rule |
| Sem `TODO` sem link de issue | TODO órfão vira dívida invisível |
| Sem dependência cíclica | ciclo torna o módulo intestável isoladamente |

---

## Quality gate

Roda por PR e **bloqueia o merge**. Os limites valem para os três módulos:

| Métrica | Limite | Por quê |
|---|---|---|
| Cobertura em código novo | **≥ 90 %**, nas 4 dimensões | [cobertura](06-testing-strategy.md#cobertura) |
| **Duplicação (linhas repetidas)** | **≤ 3 %** | ver [Linhas repetidas](#linhas-repetidas) |
| Complexidade ciclomática | ≤ 10 por função | acima disso não se testa nem se lê |
| Profundidade de aninhamento | ≤ 4 | |
| Tamanho de função | ≤ 50 linhas | |
| Parâmetros | ≤ 4 | mais que isso, é um objeto |
| Issue `blocker` / `critical` | **0** | |
| Security hotspot não revisado | **0** | |
| Vulnerabilidade `high`/`critical` em dependência | **0** | |
| Segredo detectado | **0** | |

### "Código novo" é o recorte certo

O portão mede o que o PR **mudou**, não o repositório inteiro. Exigir 90 % do legado
inteiro num projeto em andamento produz um de dois resultados: ninguém entrega, ou alguém
desliga o portão. Medindo o delta, a qualidade sobe monotonicamente e o portão continua vivo.

Como o projeto começa do zero, na prática isso significa que **tudo** é código novo.

---

## Linhas repetidas

Detecção de código duplicado é portão próprio, nos **três** módulos. Limite: **≤ 3 % de linhas
duplicadas em código novo**, e **zero** blocos duplicados acima do limiar.

### Por que isso é levado a sério aqui

Bloco copiado é bug copiado. Quando o mesmo trecho existe em três lugares, a correção
acontece em um e os outros dois seguem errados em silêncio — e ninguém descobre até o
comportamento divergir em produção.

Neste sistema em particular, a duplicação mais perigosa é a de **regra de permissão e de
validação de workspace**. Uma checagem replicada e corrigida pela metade é uma porta aberta.

### Configuração

| Módulo | Detector | Limiar de bloco |
|---|---|---|
| Backend | SonarQube (CPD) + `jscpd` | 30 tokens / 5 linhas |
| Web | SonarQube (CPD) + `jscpd` | 30 tokens / 5 linhas |
| Mobile | SonarQube (plugin Dart) + `dart_code_metrics` | 30 tokens / 5 linhas |

`jscpd` roda também em pre-push, com saída rápida — é mais barato descobrir antes do PR.

A detecção é **cross-file e cross-módulo dentro de cada ponta**: copiar de `features/session`
para `features/permission` é exatamente o caso que precisa ser pego.

### Duplicação que é permitida

Nem toda repetição é duplicação. Estas ficam fora da medição:

- **Código gerado** — tipos de `packages/contracts`, `*.g.dart`, `*.freezed.dart`, migrations.
- **Fixtures e builders de teste** — repetição explícita em teste costuma ser mais legível que
  a abstração que a elimina.
- **Estrutura de wiring** (`*.module.ts`) — é declaração repetitiva por natureza.
- **Duplicação entre pontas.** Web e mobile implementam a mesma tela em linguagens diferentes;
  isso não é duplicação, é tradução. O que precisa ser único é o **contrato**, e ele já é —
  ver [07-repository-layout.md](07-repository-layout.md).

Exclusão é declarada no config, com justificativa. Nunca por comentário espalhado no código.

### Quando o detector acusa

Na ordem, o que tentar:

1. **É a mesma regra?** Extraia para o domínio (backend) ou para `shared/` (web/mobile).
2. **É a mesma forma, com regras diferentes?** Não abstraia. Duas coisas que se parecem hoje
   e mudam por razões diferentes amanhã precisam continuar separadas — a abstração
   prematura custa mais que a duplicação.
3. **É estrutura repetitiva inerente?** Avalie gerar em vez de escrever.

A regra 2 é a que mais se esquece: o portão existe para provocar a pergunta, não para
obrigar a extrair.

---

## Segurança estática

Este backend executa comando arbitrário na máquina do usuário. As checagens abaixo não são
formalidade:

| Checagem | Alvo |
|---|---|
| `gitleaks` | segredo commitado — roda em **pre-commit** e no CI |
| `pnpm audit` / `osv-scanner` | dependência vulnerável nos três módulos |
| `semgrep` | path traversal, injeção de comando, uso inseguro de `child_process`, JWT com `alg` do token, SQL concatenado |
| Regra própria | `allowDangerouslySkipPermissions` fora de `false`; `permissionMode: 'bypassPermissions'` como default |
| **Regra própria** | **`query()` sem `settingSources: []`** — omitir carrega as settings da máquina e desliga o `canUseTool` em silêncio. Ver [ADR-011](00-decisions.md#adr-011--settingsources--obrigatório-e-auditoria-ancorada-no-hook-pretooluse) |
| Regra própria | `hooks.PreToolUse` ausente na fábrica de `Options` — sem ele não há trilha de auditoria |

As três últimas são específicas deste produto, e duas delas existem porque um spike mostrou
que o furo acontece **em silêncio**: nem `settingSources` omitido nem hook ausente produzem
erro ou aviso — apenas desligam a proteção. Ver
[backend/04](../backend/04-claude-integration.md#a-armadilha-do-settingsources).

Atualização de dependência é automatizada (Renovade/Dependabot), com agrupamento e
atualização de segurança em prioridade.

---

## Onde cada portão roda

| Momento | Roda | Por quê |
|---|---|---|
| **Pre-commit** (`husky` + `lint-staged`) | formatação, lint e `gitleaks` nos arquivos tocados | segundos, pega 80 % |
| **Pre-push** | typecheck + unit + `jscpd` | evita CI vermelho por descuido |
| **CI, todo push** | lint, typecheck, unit, cobertura, regras de arquitetura, i18n | |
| **CI, todo PR** | tudo acima + integração + e2e + SonarQube + segurança | |
| **Nightly** | `osv-scanner` completo, `semgrep` completo, `smoke-live` | checagem cara, fora do caminho crítico |

Pre-commit **não** roda a suíte inteira. Hook lento é hook que o time aprende a pular com
`--no-verify`.

---

## Formatação não se discute

Prettier e `dart format` decidem. Estilo de formatação **nunca** é comentário de review —
se chegou ao review, o hook falhou.

Configuração única na raiz, herdada pelos workspaces. Sem override por pasta: divergência de
estilo entre módulos gera diff de ruído em quem transita entre eles.

---

## Suprimir uma regra

Suprimir é permitido; suprimir em silêncio, não.

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK 0.3.x não tipa
// esta variante; ver #142
```

Regras:

- **Sempre na linha**, nunca no arquivo ou na pasta.
- **Sempre com justificativa** depois de `--`, e link para a issue quando for temporário.
- Supressão sem comentário é reprovada por lint (`eslint-comments/require-description`).
- Desativar uma regra **no config** é decisão de arquitetura: precisa de
  [ADR](00-decisions.md).

O objetivo não é zero supressão — é que toda supressão seja uma decisão consciente e
rastreável.
