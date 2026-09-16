/**
 * The normative shape of a plan, as prose.
 *
 * The format in docs/plans/README.md has three fixed files, one file per phase and ID
 * conventions. Reproducing that by hand on every new plan is pure repetition, and it is exactly
 * where the format starts to drift — hence this template.
 *
 * The generated text is documentation, so it is written in pt-BR like the rest of `docs/`;
 * identifiers and file names stay in English.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @typedef {object} PlanSpec
 * @property {string} number two-digit plan number, e.g. `01`
 * @property {string} slug kebab-case name, e.g. `claude-integration`
 * @property {readonly string[]} phases kebab-case phase names, in order
 */

/**
 * @typedef {object} GeneratedFile
 * @property {string} name file name inside the plan directory
 * @property {string} content
 */

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidSlug(value) {
  return SLUG.test(value);
}

/**
 * `session-streaming` → `Session streaming`
 *
 * @param {string} slug
 * @returns {string}
 */
export function titleize(slug) {
  const words = slug.split('-').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * @param {PlanSpec} spec
 * @returns {string}
 */
function phaseIndexRows(spec) {
  return spec.phases
    .map(
      (phase, index) =>
        `| F${index} | [${titleize(phase)}](F${index}-${phase}.md) | *(a entrega desta fase)* | *(B-nn…B-nn)* | 🔲 |`,
    )
    .join('\n');
}

/**
 * @param {PlanSpec} spec
 * @returns {string}
 */
function planReadme(spec) {
  const name = titleize(spec.slug);

  return `# Plano ${spec.number} — ${name}

**Objetivo:** *(uma frase)*

**Critério de conclusão — é um comando, não uma opinião:**

\`\`\`bash
pnpm verify:full     # sai com código 0
\`\`\`

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

*(a justificativa da abordagem — por que assim, e não de outro jeito)*

---

## Escopo

### Entra

| | |
|---|---|
| *(entrega)* | F0 |

### Não entra

Deliberadamente fora — cada um vira plano próprio:

- *(o que ficou de fora, e por quê)*

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
${phaseIndexRows(spec)}

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| *(requisito)* | B-01 | *(documento)* | S-01 |

Detalhe de cada \`S-nn\` em [scenarios.md](scenarios.md).

---

## Árvore resultante

\`\`\`
*(o que existe no repositório ao fim do plano)*
\`\`\`

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | *(assunto)* | **aberto** |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: \`pnpm verify\`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
`;
}

/**
 * @param {PlanSpec} spec
 * @returns {string}
 */
function scenarios(spec) {
  return `# Plano ${spec.number} — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** \`eq\` equivalência · \`fron\` fronteira · \`err\` erro · \`est\` transição de estado ·
\`conc\` concorrência · \`idem\` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## *(agrupamento)* — B-01

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | *(cenário)* | eq | unit | — | B-01 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| *(requisito)* | *(dimensão)* | *(motivo)* |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo \`err\` cita o \`code\` do [catálogo](../../architecture/shared/04-errors-and-http.md).
`;
}

/**
 * @param {PlanSpec} spec
 * @returns {string}
 */
function decisions(spec) {
  const sections = spec.phases
    .map((phase, index) => {
      const rows =
        index === 0
          ? `| D-01 | *(a pergunta a responder)* | *(o que falta saber antes)* | B-01 | — | 🔲 |`
          : `| — | *(nenhuma decisão em aberto — confirme ao planejar a fase)* | — | — | — | — |`;

      return `## F${index} — ${titleize(phase)}

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
${rows}
`;
    })
    .join('\n');

  return `# Plano ${spec.number} — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

${sections}
---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode \`pnpm plan progress\`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- \`D-nn\` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
`;
}

/**
 * @param {PlanSpec} spec
 * @returns {string}
 */
function progress(spec) {
  const bars = spec.phases
    .map((_, index) => `F${index} ${'░'.repeat(20)}   0%   🔲 não iniciada`)
    .join('\n');

  const rows = spec.phases
    .map((phase, index) => `| [F${index}](F${index}-${phase}.md) | — | 0/0 | 🔲 |`)
    .join('\n');

  return `# Plano ${spec.number} — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por \`pnpm plan progress\`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** —
**Bloqueios:** nenhum

\`\`\`
${bars}
\`\`\`

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
${rows}
| **Total** | **—** | **0/0** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 0 | 0 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 0 | 0 | 0 | 0 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | *(sem ciclos ainda)* |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| — | — | — | — |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| — | — | — | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | *(risco)* | 🔲 aberto | — |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode \`pnpm plan progress\`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com \`pnpm verify\` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
`;
}

/**
 * @param {PlanSpec} spec
 * @param {number} index
 * @returns {string}
 */
function phaseFile(spec, index) {
  const phase = spec.phases[index] ?? '';
  const previous = index === 0 ? null : `F${index - 1}-${spec.phases[index - 1] ?? ''}.md`;
  // IDs are sequential across the whole plan and never restart per phase — docs/plans/README.md.
  const firstTask = `B-${String(index + 1).padStart(2, '0')}`;

  return `# F${index} — ${titleize(phase)}

Plano: [${spec.number} — ${titleize(spec.slug)}](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** ${previous === null ? 'nada. É a primeira fase.' : `[F${index - 1}](${previous}).`}
**Entrega:** *(o que existe ao fim da fase)*

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que \`pnpm plan progress\` tira os contadores.

### ${firstTask} — *(título)* 🔲

*(o que e por quê — o suficiente para implementar. Detalhe normativo vive em
docs/architecture; aponte para lá, não duplique.)*

---

## Cenários cobertos

S-01.

---

## Critério de conclusão

\`\`\`bash
pnpm verify
\`\`\`
`;
}

/**
 * Every file of a new plan, in the normative format: four fixed files, one per phase.
 *
 * @param {PlanSpec} spec
 * @returns {GeneratedFile[]}
 */
export function buildPlanFiles(spec) {
  return [
    { name: 'README.md', content: planReadme(spec) },
    { name: 'scenarios.md', content: scenarios(spec) },
    { name: 'decisions.md', content: decisions(spec) },
    { name: 'progress.md', content: progress(spec) },
    ...spec.phases.map((phase, index) => ({
      name: `F${index}-${phase}.md`,
      content: phaseFile(spec, index),
    })),
  ];
}

/**
 * Adds the new plan to the index in docs/plans/README.md. A plan nobody indexes is a plan
 * `docs:check` reports as an orphan on the very next run.
 *
 * @param {string} indexContent
 * @param {PlanSpec} spec
 * @returns {string}
 */
export function withPlanIndexed(indexContent, spec) {
  const row = `| ${spec.number} | [${titleize(spec.slug)}](${spec.number}-${spec.slug}/README.md) | 🔲 não iniciado | \`pnpm verify:full\` sai com código 0 |`;

  return withRowAppended(indexContent, /^\|\s*\d{2}\s*\|/, row, 'docs/plans/README.md');
}

/**
 * Adds the new plan to the general progress in `docs/plans/progress.md`.
 *
 * A plan that only updates its own diary leaves the project-wide answer wrong, and a counter
 * nobody can trust is a counter nobody reads. The row goes in empty; `pnpm plan progress`
 * fills it in the same run.
 *
 * @param {string} progressContent
 * @param {PlanSpec} spec
 * @returns {string}
 */
export function withPlanInOverallProgress(progressContent, spec) {
  const row =
    `| [${spec.number} — ${titleize(spec.slug)}](${spec.number}-${spec.slug}/README.md) ` +
    `| 0/0 | 0/0 | 0/0 | 🔲 |`;

  return withRowAppended(progressContent, /^\|\s*\[\d{2}\s*—/u, row, 'docs/plans/progress.md');
}

/**
 * Inserts a row right after the last one that matches — the tables of both documents are
 * ordered by plan number, and a new plan is always the last.
 *
 * @param {string} content
 * @param {RegExp} rowPattern what an existing row looks like
 * @param {string} row
 * @param {string} what the document, for the error message
 * @returns {string}
 */
function withRowAppended(content, rowPattern, row, what) {
  const lines = content.split('\n');

  let lastRow = -1;
  for (const [index, text] of lines.entries()) {
    if (rowPattern.test(text)) {
      lastRow = index;
    }
  }

  if (lastRow === -1) {
    throw new Error(`${what} has no plan table to append to`);
  }

  lines.splice(lastRow + 1, 0, row);
  return lines.join('\n');
}
