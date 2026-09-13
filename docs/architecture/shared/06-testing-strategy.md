# Estratégia de testes

Duas regras estruturais, antes de qualquer outra coisa:

1. **Teste nunca fica ao lado do fonte.** Sem `*.spec.ts` vizinho do `.ts`.
2. **Tudo que é construído gera os três níveis: unit, integração e e2e.** Não são níveis
   alternativos, e não é "quando couber". Ver [Todo entregável gera os três níveis](#todo-entregável-gera-os-três-níveis).
3. **Enumere o máximo de cenários possível** — não só o caminho feliz. Ver
   [Como enumerar cenários](#como-enumerar-cenários).
4. **Cobertura mínima de 90 % em todas as dimensões**, nas três pontas. Ver [Cobertura](#cobertura).
5. **A tarefa só está pronta quando toda a validação passa.** Ver
   [Definition of Done](10-definition-of-done.md).

Voltar para o [índice transversal](README.md).

---

## Onde o teste mora

| Ponta | Fonte | Testes |
|---|---|---|
| Backend | `backend/src/` | `backend/test/unit/` · `backend/test/integration/` |
| Web | `web/src/` | `web/test/unit/` · `web/test/integration/` |
| Mobile | `mobile/lib/` | `mobile/test/unit/` · `mobile/test/widget/` · `mobile/integration_test/` |
| E2E | — | `e2e/` (raiz do repositório) |

A árvore de testes **espelha** a do fonte:

```
backend/src/application/session/start-session.use-case.ts
backend/test/unit/application/session/start-session.use-case.spec.ts
```

**Por quê separado:** o requisito veio do projeto, e tem uma consequência boa — a suíte de
unit consegue rodar contra a API pública do módulo sem acesso privilegiado ao interior dele.
Teste que só passa porque está na mesma pasta está testando implementação, não comportamento.

> Exceção de toolchain: no Flutter, `mobile/test/` e `mobile/integration_test/` já são
> separados de `lib/` por convenção da própria linguagem. Nada a fazer além de manter a
> subdivisão `unit/` e `widget/`.

---

## Todo entregável gera os três níveis

Qualquer coisa construída — endpoint, evento WS, tela, use case, regra de domínio, adapter —
sai acompanhada de **unit, integração e e2e**. Não existe "esse é simples demais para testar",
nem "o e2e a gente faz depois". Depois não chega.

| Você construiu | Unit | Integração | E2E |
|---|---|---|---|
| Regra de domínio | a regra e todos os ramos de erro | — (não tem I/O) | o fluxo que a exercita |
| Use case | orquestração, com portas fakeadas | com adapters reais | o fluxo do usuário |
| Endpoint HTTP | validação e mapeamento de erro | controller + filter + banco real | a chamada pela porta do usuário |
| Evento / comando WS | mapper e redutor | gateway com socket real | o fluxo interativo completo |
| Repositório | mapper domínio ↔ row | SQL contra Postgres real | coberto pelo fluxo acima |
| Hook / componente web | lógica e estados | com MSW e store reais | o clique do usuário |
| Tela Flutter | notifier | widget + providers reais | `integration_test` |

Quando um nível genuinamente não se aplica (regra pura não tem integração), isso é **declarado
no PR**, não omitido em silêncio.

---

## Como enumerar cenários

"Máximo de cenários possível" não é convite a escrever teste aleatório até cansar. É um
método. Para cada unidade, percorra as seis dimensões abaixo — nesta ordem:

### 1. Partições de equivalência
Entradas que o código trata do mesmo jeito. Um teste por partição, não um por valor.

### 2. Valores de fronteira
Onde o bug mora. Zero, um, limite exato, limite ± 1, vazio, máximo, estouro.
`seq` no limite do ring buffer; prompt no tamanho máximo; timeout no instante exato.

### 3. Caminhos de erro — todos
**É aqui que a dimensão `branches` da cobertura reprova.** Cada `throw`, cada `catch`, cada
retorno de erro precisa ser alcançado por um teste. Neste sistema o caminho de erro é o que
não pode falhar: permissão negada, timeout, workspace fora da allowlist, socket caído,
`CLAUDE_UNAVAILABLE`.

### 4. Transições de estado
Para tudo que tem máquina de estados (sessão, permission request, connection): teste cada
transição **válida** e pelo menos uma **inválida** por estado. `interrupt` em sessão já
fechada; `permission.resolve` em request expirado.

### 5. Concorrência e ordem
O que acontece quando duas coisas chegam juntas, ou fora de ordem.
Dois clientes resolvendo a mesma permissão; dois prompts simultâneos; evento com `seq`
repetido no replay; resposta chegando depois do timeout.

### 6. Idempotência e repetição
O que acontece quando a mesma coisa chega duas vezes. É obrigatório para tudo que envolve
`requestId`, `seq` ou retry — ver
[o contrato](05-websocket-protocol.md#o-fluxo-de-permissão).

> **Regra prática:** se a sua lista de cenários tem só caminho feliz e um erro genérico, você
> parou na dimensão 1. Faltam cinco.

---

## Os três níveis

### Unit — rápido, isolado, sem I/O

Testa uma unidade com **todas** as dependências externas substituídas por duplo.

| | |
|---|---|
| **Alvo principal** | `domain/` e `application/` (backend); hooks e funções puras (web); use cases e notifiers (mobile) |
| **Pode tocar** | nada externo: sem rede, sem disco, sem banco, sem timer real |
| **Deve rodar em** | < 10 ms por teste |

A cobertura mínima é global e está definida em [Cobertura](#cobertura).

### Integração — componentes reais conversando

Testa a junção, com as dependências **de verdade** dentro do processo ou em container.

| | |
|---|---|
| **Alvo** | repositórios contra Postgres real, controllers com o container do Nest de pé, gateway WS com socket real, adapter do Agent SDK |
| **Banco** | **Postgres 18 via testcontainers**. Nunca SQLite, nunca mock. Ver [ADR-004](00-decisions.md#adr-004--testcontainers-para-testes-de-integração) |
| **Agent SDK** | fake controlável que emite `SDKMessage` roteirizados — não gasta cota nem depende de rede |
| **Isolamento** | cada teste em transação com rollback, ou schema dedicado. Nunca compartilhe estado entre testes |

Por quê Postgres real: banco em memória mente sobre transação, constraint, tipo, colação e
concorrência. Um teste que passa no SQLite e quebra no Postgres é pior que teste nenhum.

### E2E — o sistema inteiro, pela porta do usuário

Fica em `e2e/`, na raiz.

| Alvo | Ferramenta | O que sobe |
|---|---|---|
| API + WebSocket | Playwright (API mode) | backend real + Postgres (testcontainers) + Agent SDK fake |
| Web | Playwright | tudo acima + web buildado |
| Mobile | `integration_test` do Flutter, em `mobile/` | app real contra backend real |

> O e2e de mobile não cabe em `e2e/`: exige emulador e toolchain Dart. Fica em
> `mobile/integration_test/`, mas os **cenários** são escritos em `e2e/scenarios/` e
> compartilhados, para que web e mobile testem o mesmo comportamento.

**E2E não usa o Claude de verdade.** O Agent SDK é substituído por um fake roteirizado.
Teste e2e precisa ser determinístico; o Claude não é — e cada execução custa dinheiro.

Existe **uma** suíte separada, `e2e/smoke-live/`, que roda contra o Claude real. Não roda em
PR: roda sob demanda e no nightly. É o que detecta quebra de contrato do SDK.

---

## Cenários e2e obrigatórios

Estes cobrem os caminhos que, se quebrarem, tornam o produto inútil:

1. Autenticar → listar workspaces → abrir sessão → enviar prompt → receber resposta completa.
2. **Permissão pelo web:** Claude pede tool → web mostra → usuário aprova → tool executa.
3. **Permissão pelo mobile:** mesmo fluxo, com o web só observando o `permission.resolved`.
4. **Corrida de permissão:** web e mobile respondem juntos → primeira vence, segunda recebe `ack`.
5. **Timeout de permissão:** ninguém responde → `deny` automático → sessão continua coerente.
6. **Reconexão com replay:** derruba o socket no meio do turno → reconecta com
   `resumeFromSeq` → nenhum evento perdido, nenhum duplicado.
7. **Reconexão com gap:** fora por tempo suficiente para estourar o ring buffer → cliente
   detecta `gap: true` e recarrega o transcript.
8. **Interrupt:** tool longa em execução → `session.interrupt` → para e a sessão volta a `idle`.
9. **Workspace negado:** tentar abrir caminho fora da allowlist → `403 WORKSPACE_NOT_ALLOWED`.
10. **Multi-cliente:** web e mobile na mesma sessão → ambos veem o mesmo stream, na mesma ordem.

---

## Cobertura

**Mínimo de 90 % em todas as dimensões, nas três pontas.** Dimensão significa cada uma das
quatro métricas — abaixo de 90 % em qualquer uma delas, o build falha:

| Dimensão | O que mede |
|---|---|
| `statements` | comandos executados |
| `branches` | **cada lado de cada `if`, `?:`, `&&`, `switch`, `??`** |
| `functions` | funções invocadas |
| `lines` | linhas executadas |

`branches` é a que realmente importa e a que costuma reprovar. É fácil ter 95 % de linhas e
60 % de branches: basta nunca testar o caminho de erro. Neste sistema, o caminho de erro é
exatamente o que não pode falhar — permissão negada, timeout, workspace fora da allowlist,
socket caído.

### Configuração

O portão é por projeto **e** global. Não existe média que compense: um módulo em 70 % não é
salvo por outro em 99 %.

```jsonc
// vitest.config.ts — backend e web
coverage: {
  provider: 'v8',
  thresholds: {
    statements: 90, branches: 90, functions: 90, lines: 90,
    perFile: true,          // o portão vale POR ARQUIVO, não só no agregado
  },
}
```

No Flutter, o equivalente é `flutter test --coverage` com verificação do `lcov.info` no CI,
nas mesmas quatro dimensões.

### A cobertura é medida sobre unit + integração juntos

Rodar só unit e exigir 90 % empurra o código para teste artificial de adapter. O portão
considera as duas suítes somadas — cada camada é coberta pelo nível que faz sentido para ela
(ver a tabela em cada `*-testing.md` de ponta). E2E **não** conta para a cobertura: ele valida
comportamento de ponta a ponta, não linha executada.

### O que fica fora da medição

Excluir é decisão explícita e justificada no config — não use `/* istanbul ignore */` espalhado
pelo código:

- Arquivos gerados (tipos de `packages/contracts`, código Dart gerado, `*.g.dart`).
- `main.ts` / `bootstrap` — coberto pelo e2e.
- Wiring puro de framework (`*.module.ts`) — sem lógica para cobrir.
- Arquivos de definição de tipo (`*.d.ts`), barris (`index.ts`), constantes.
- `mobile/lib/l10n/` gerado.

Qualquer outra exclusão precisa de comentário dizendo **por que** aquele arquivo não pode ser
testado. Na prática, "não dá para testar" quase sempre significa "está acoplado demais" — e a
resposta certa é refatorar, não excluir.

### Cobertura não é qualidade

90 % é piso, não meta. Teste que executa a linha sem afirmar nada sobre o resultado sobe a
métrica e não protege ninguém. O portão existe para impedir código não testado de entrar, não
para provar que o código está correto — isso quem faz são os [cenários obrigatórios](#cenários-e2e-obrigatórios)
e os cenários de cada ponta.

---

## Regras que valem nos três níveis

- **Nome descreve comportamento, não implementação.**
  `denies permission when the request has expired` ✅
  `should call resolve()` ❌
- **Arrange / Act / Assert** explícito, com linha em branco entre os blocos.
- **Uma razão para falhar por teste.** Vários `expect` sobre o mesmo ato, tudo bem;
  vários atos, não.
- **Sem `sleep`.** Espere condição (`waitFor`), nunca tempo. Teste com `sleep` é flaky por
  construção. Timer é sempre falso (fake timers).
- **Sem ordem entre testes.** Cada um monta e derruba o próprio estado.
- **Sem teste `skip` no main.** Ou conserta, ou apaga, ou vira issue com link no código.
- **Teste flaky é bug P1.** Quarentena por no máximo uma sprint, depois conserta ou remove.
- **Fixture é dado mínimo.** Use builders com default (`aSession().withStatus('running')`),
  não JSON gigante colado.
- **Nunca teste contra o Claude real** fora de `e2e/smoke-live/`.

---

## O que NÃO precisa de teste

Escrever teste onde não há risco só cria custo de manutenção:

- Getter/setter e DTO sem lógica.
- Wiring de framework (`@Module`, providers) — o teste de integração já cobre.
- Estilo e layout visual — use snapshot só quando a regressão visual for real risco.
- Biblioteca de terceiro. Teste o **seu** uso dela, não ela.

---

## Portões de CI

| Portão | Roda quando | Falha bloqueia merge |
|---|---|---|
| Lint + typecheck | todo push | sim |
| Unit (3 pontas) | todo push | sim |
| Cobertura ≥ 90 % em 4 dimensões, por arquivo | todo push | sim |
| Integração (testcontainers) | todo PR | sim |
| E2E web + API | todo PR | sim |
| E2E mobile | PR que toca `mobile/` | sim |
| Paridade de chaves i18n | todo push | sim |
| Contrato WS ↔ Dart gerado | todo push | sim |
| `smoke-live` contra o Claude real | nightly + manual | não (abre issue) |
