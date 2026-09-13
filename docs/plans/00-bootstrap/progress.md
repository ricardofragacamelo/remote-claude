# Plano 00 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Atualizado a cada ciclo de trabalho. Os **contadores** — barras, linha de cada fase, total e
contagem de cenários — saem de `pnpm plan progress`, lidos dos arquivos de fase e do
`scenarios.md`. O resto é escrito à mão.

---

## Estado atual

**Fase corrente:** [F0](F0-foundation.md) concluída; próxima é a [F1](F1-infrastructure.md)
**Última atualização:** 2026-09-13
**Bloqueios:** nenhum na F0. **Para a F1:** `pnpm doctor` reprova nesta máquina — o plugin
`docker compose` v2 não está instalado (o daemon responde, o plugin não). A F1 inteira depende
dele.

```
F0 ████████████████████ 100%   ✅ concluída
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-foundation.md) | B-01…B-06, B-48, B-49, B-52 | 9/9 | ✅ |
| [F1](F1-infrastructure.md) | B-07…B-10, B-50 | 0/5 | 🔲 |
| [F2](F2-contracts.md) | B-11…B-14 | 0/4 | 🔲 |
| [F3](F3-backend.md) | B-15…B-23, B-51 | 0/10 | 🔲 |
| [F4](F4-web.md) | B-24…B-30 | 0/7 | 🔲 |
| [F5](F5-mobile.md) | B-31…B-36 | 0/6 | 🔲 |
| [F6](F6-scripts-e2e.md) | B-37…B-40 | 0/4 | 🔲 |
| [F7](F7-gates-ci.md) | B-41…B-47 | 0/7 | 🔲 |
| **Total** | **B-01…B-52** | **9/52** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 79 | 71 | 0 | 8 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).
Registrar o vermelho é o que permite ver padrão — três ciclos seguidos caindo no mesmo portão
é sinal de problema de desenho, não de descuido.

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-13 | F0 | 1 — formatação | 6 arquivos fora do estilo do Prettier | `pnpm format` | verde no reinício |
| 2 | 2026-09-13 | F0 | 5 — duplicação | `run` e `runAttached` de `scripts/lib/exec.mjs` compartilhavam 9 linhas | extraído `invoke()`, a única diferença virou parâmetro | 0 clones |
| 3 | 2026-09-13 | F0 | 6 — unit | `.env.example` tinha comentário por bloco, não por variável — o teste de B-05 reprovou | comentário próprio para cada variável | 105 unit verdes |
| 4 | 2026-09-13 | F0 | 6 — unit | teste do CLI do `doctor` dependia da máquina (falta `docker compose` aqui) | passou a exigir **coerência** entre saída e código de saída, não um ambiente específico | 8 integração verdes |

Os ciclos 2 e 3 são o portão fazendo o que devia: o `jscpd` achou duplicação que eu não tinha
visto, e o teste do `.env.example` reprovou o próprio `.env.example` que eu tinha acabado de
escrever. O ciclo 4 é o oposto — o portão estava certo e o **teste** estava errado.

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente. Decisão
registrada só aqui é decisão que se perde.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-13 | Estado da task fica no **fim do título** da task, no arquivo da fase | `plan --progress` precisa de uma fonte da verdade por task; marcar onde o trabalho acontece e derivar o resto impede o diário de divergir do plano | [formato de plano](../README.md#o-que-cada-arquivo-contém), `scripts/lib/plan-progress.mjs` |
| 2026-09-13 | Saída de script passa por `scripts/lib/ui.mjs` (`process.stdout.write`), nunca `console` | mantém `no-console` ligado em **todo** o repositório, sem exceção no config — exceção no config exigiria ADR | `eslint.config.mjs`, todos os scripts |
| 2026-09-13 | `jscpd` com `threshold: 0` | [09](../../architecture/shared/09-code-quality.md#linhas-repetidas) pede "**zero** blocos duplicados acima do limiar"; 3 % é a métrica do Sonar, que ainda não existe. Exclusão declarada no config, nunca por comentário | `.jscpd.json` |
| 2026-09-13 | `secrets-scan.mjs` cai na imagem Docker quando não há `gitleaks` | Docker já é pré-requisito duro (R-05). A alternativa era o hook passar em silêncio em quem não tem o binário — portão que se pula sozinho não é portão | `.husky/pre-commit`, `README.md` |
| 2026-09-13 | Prettier **não** formata `*.md` | reflui tabela e edita amostra de código dentro do documento (chega a inserir vírgula em JSON de exemplo). O que guarda a documentação é o `docs:check` | `.prettierignore` |
| 2026-09-13 | Aliases ficam no `tsconfig.base.json` e cada workspace declara `"baseUrl": "."` | `paths` resolve contra o `baseUrl` de quem estende; sem isso os aliases apontariam para a raiz do repositório | `tsconfig.base.json`, `scripts/tsconfig.json` |
| 2026-09-13 | `pnpm doctor`: Node, pnpm e Docker reprovam; Flutter, `gitleaks` e porta ocupada avisam | nenhum dos três impede o repositório de funcionar, e porta fixa ocupada se resolve por variável. `--strict` transforma aviso em reprovação para o CI | `scripts/lib/prerequisites.mjs` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-13 | Metade **Dart** de S-68 (`print()`) e S-69 (`dynamic`) | não há módulo Flutter para o `dart analyze` reprovar; o cenário está marcado ✅ pela metade TS/JS, que é a que existe | [F5](F5-mobile.md) |
| 2026-09-13 | S-52 verificado contra código que **ainda não existe** | o teste varre `backend/src`, `web/src`, `packages` e `e2e` em busca de `process.env.X` — hoje não há leitura nenhuma. O extrator é testado contra fixtures, e o portão acusa na primeira variável não declarada | vigiar na [F3](F3-backend.md), com B-16 |
| 2026-09-13 | `pnpm verify` / `verify:full`, `lint:arch`, cobertura | são a entrega da [F7](F7-gates-ci.md); a F0 roda os portões pelos comandos individuais | [F7](F7-gates-ci.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | `allow` de projeto em diretório confiado | 🔲 aberto | verificar antes de produção |
| R-02 | `409` vs enfileirar prompt | 🔲 aberto | **decidir antes da F3** |
| R-03 | 90 % desde o primeiro commit | 🔲 monitorar | vigiar teste de fachada em review. Na F0, 113 testes cobrem lógica e contrato de saída, mas o **portão** de cobertura só existe na F7 (B-42) |
| R-04 | Dart gerado fora de sincronia | 🔲 aberto | mitigado por B-14 |
| R-05 | Docker obrigatório | ✅ aceito | sem alternativa |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque-a com ✅ no arquivo da fase, atualize os cenários cobertos
   em [scenarios.md](scenarios.md) e rode `pnpm plan progress` — os contadores daqui saem de lá.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso.
