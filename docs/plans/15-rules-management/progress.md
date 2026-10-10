# Plano 15 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** a B-08 (🔄) está pausada até a [F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md) ([28 · D-12](../28-agent-neutral-core/decisions.md)), e o resto do plano espera o [plano 28](../28-agent-neutral-core/README.md) concluído ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)); a F0 não começa com as decisões D-01…D-13 abertas, e a F2 precisa da moldura, da navegação e da paleta do [plano 06](../06-workbench/README.md)

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔄 em andamento
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-07 | 0/7 | 🔲 |
| [F1](F1-rules-backend.md) | B-08…B-19 | 0/12 | 🔄 |
| [F2](F2-rules-screen.md) | B-20…B-26 | 0/7 | 🔲 |
| [F3](F3-rule-authoring.md) | B-27…B-32 | 0/6 | 🔲 |
| [F4](F4-e2e.md) | B-33…B-36 | 0/4 | 🔲 |
| **Total** | **B-01…B-36** | **0/36** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 226 | 218 | 0 | 8 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 20 | 18 | 0 | 2 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-27 | F1 · B-08 (antecipada) | 7 — cobertura, na raiz | `test/integration/scripts/run-e2e-local.spec.mjs` estourou o `afterAll` (10 min) contra o Docker, enquanto outra execução de e2e disputava o mesmo Docker; a cobertura dos workspaces nem rodou, por estar encadeada depois | nenhuma no código — sem relação com a mudança; a cobertura do backend rodou sozinha: 2432 testes, 100 % de funções, 99,72 % de linhas, 90 % por arquivo | portões 1–6 verdes; **portões 8–11 e `pnpm test:e2e:live` não rodaram, por decisão do usuário** — a task fica 🔄 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-26 | A parte de **casamento** da B-08 foi antecipada, com o plano ainda esperando o 05: `allow` de prefixo não responde comando encadeado, `deny` casa por segmento, e a lista de operadores ficou única (`shell-syntax.ts`), lida também pelo classificador de risco — que passou a separar no `&` simples (`ls & rm -rf x` era lido como leitura) | o furo liberava `git status && curl … \| sh` com uma regra de `git status`; pedido do usuário | [D-07](decisions.md) ✅; [backend/04 · A regra fala a gramática do Claude](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa); S-07…S-12, S-20, S-21 ✅; o resto da B-08 (`ruleBreadth`, `patternCovers`, `describeReach`) segue 🔲 |
| 2026-10-10 | O plano nasce sobre o núcleo neutro do [plano 28](../28-agent-neutral-core/README.md): a B-08 pausa até a F5 de lá e retoma atrás do `RuleDialect`; a gramática do Claude (largura, contenção, alcance, ressalvas, modelos) mora no dialeto do adapter; a regra leva `engine`; o contrato fala `kind`/`subject`, modos canônicos e `{agent}` ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)). 2026-10-10 (revisão dos gaps do 28): a gramática passa a ser a **canônica, já** — a regra é escrita por `kind` (`shell(git status:*)`, `file.edit(src/**)`, `web.fetch(domain:…)`, `mcp(srv:tool)`), o domínio é dono do parser, do casamento, do alcance, da largura, da contenção e da descrição, e o `RuleDialect` só traduz; `engine` é nulo na regra canônica; a B-08 retoma sobre ela; os modelos e o arquivo de exportação são canônicos; as regras desligadas pela migração do 28 têm estado `disabled` e aparecem na tela para recriar; as rotas novas nascem em `packages/contracts/schema/http/` | pedido do usuário: ajustar os planos não executados às diretivas de isolamento, de regras e de canonicidade do 28; a [28 · D-12](../28-agent-neutral-core/decisions.md) pausa a B-08, que aprofunda exatamente o que a F5 de lá move | README (dependência, garantias, árvore, R-03); B-01…B-03, B-06, B-07, B-08 (só a nota de pausa), B-09…B-11, B-14…B-18, B-21, B-22, B-26…B-28, B-31, B-32, B-35; D-08, D-09, D-12, D-15, D-16, D-17; S-44, S-61, S-96, S-105, S-106, S-132, S-161, S-162, S-186, S-197, S-219, S-223. Na revisão: [28 · D-09, D-11, D-18](../28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto) contra a recomendação que o ajuste supôs; README (dependência, rastreio, "não entra", árvore); B-02, B-03, B-06, B-07, B-08 (só a nota de pausa), B-09, B-10, B-12…B-15, B-17, B-18, B-20…B-22, B-26, B-27, B-32, B-33, B-35; D-08, D-09, D-16, D-17, D-19, D-20; S-01, S-02, S-13…S-16, S-18, S-19, S-31, S-33, S-41, S-105, S-107, S-111, S-117, S-118, S-136, S-138, S-162, S-186, S-223; nascem S-224…S-226 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | gramática de caminho (`Edit(src/**)`) | outra linguagem de padrão e outra superfície de ataque ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)) | candidata a plano futuro, sem número; desde 2026-10-10, a forma de caminho da gramática canônica (`file.edit(src/**)`) é da [F5 do plano 28](../28-agent-neutral-core/F5-permission-dialect.md), e este plano só a usa |
| 2026-09-26 | step-up para criar regra | mecanismo ainda inexistente ([D-03](decisions.md#d-03--segundo-passo-e-step-up-ao-criar-pela-tela)) | planos [05](../05-hardening-operations/README.md) e [12](../12-integrated-terminal/README.md) |
| 2026-09-26 | modelos sugeridos a partir dos scripts do projeto | depende da detecção de tarefas ([D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram)) | [plano 12](../12-integrated-terminal/README.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Criar pela tela facilita escrever regra larga | 🔲 aberto | depende da [D-09](decisions.md#d-09--o-que-é-largo-demais) |
| R-02 | Endurecer o casamento muda o comportamento de regras que já existem | 🔲 aberto | depende da [D-07](decisions.md#d-07--comando-composto-e-o-prefixo); registrar aqui a data em que a mudança entrar |
| R-03 | O teste de comando não enxerga o que o CLI decide antes de nós | 🔲 aberto | ressalvas na resposta (S-106) |
| R-04 | O uso é janelado pela retenção de 90 dias | 🔲 aberto | depende da [D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação) |
| R-05 | Importar traz regras em massa de outra máquina ou pessoa | 🔲 aberto | depende da [D-17](decisions.md#d-17--exportar-e-importar) |
| R-06 | Corrida entre revogar e estender ressuscita uma regra | 🔲 aberto | escrita condicional (S-74, S-75) |
| R-07 | Teste e simulação viram oráculo caro | 🔲 aberto | tetos e os limites do [plano 05](../05-hardening-operations/README.md) |
| R-08 | Dependência do plano 06 para a moldura, a navegação e o seletor de pasta | 🔲 aberto | F0 e F1 não dependem dele |

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
