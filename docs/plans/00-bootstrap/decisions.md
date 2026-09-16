# Plano 00 — Decisões em aberto e gaps

O plano está **concluído**, então este arquivo é sobretudo registro: as decisões que estavam em
aberto durante a execução, e o que foi decidido em cada uma.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

O formato de plano passou a exigir este arquivo depois que o bootstrap fechou; ele foi escrito
olhando para trás, a partir dos riscos do [plano](README.md#riscos-e-decisões-em-aberto) e das
decisões registradas no [progresso](progress.md#decisões-tomadas-durante-a-execução). O detalhe
de cada ciclo continua lá — aqui está só a escolha.

---

## Decisões do plano inteiro

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Prompt concorrente: rejeitar com `409` ou enfileirar | o que o SDK faz nativamente | — | 2026-09-13 — **enfileira**, como o SDK já faz e como a UI do Claude Code se comporta; `SESSION_ALREADY_RUNNING` saiu do catálogo de erros | ✅ |
| D-02 | Cobertura do Flutter mede só linhas | se o `lcov.info` do Dart carrega `BRDA`/`FN` | — | 2026-09-14 — **aceito**: o dado não existe em Dart. Registrado como R-06, com a matriz de cenários compensando o número | ✅ |
| D-03 | O e2e do mobile é portão obrigatório? | custo real de emulador mais build Gradle | — | 2026-09-14 — **não bloqueia merge**: a primeira execução inviabilizou a máquina. Roda sob demanda, com a receita de cgroup. R-07 | ✅ |
| D-04 | Linhas repetidas na configuração do Keycloak reprovando o portão de duplicação | se `infra/**` é código para o jscpd | — | 2026-09-13 — `infra/**` **excluído** do jscpd: é configuração declarativa de um produto de terceiro, não código nosso | ✅ |
| D-05 | Scripts em `.ts` ou `.mjs` | se um passo de build nos scripts que sobem o projeto é aceitável | — | 2026-09-13 — **`.mjs`**, tipados por JSDoc com `checkJs`: script que precisa de build quebra exatamente quando mais se precisa dele | ✅ |
| D-06 | O `allow` de projeto fura o `canUseTool` em diretório já confiado? | exige spike com `hasTrustDialogAccepted` marcado | — | **movida para o [plano 01 · D-11](../01-live-session/decisions.md)**, onde a primeira sessão real acontece | ⛔ |

---

## Ao decidir

Vale o mesmo dos demais planos: marque ✅, preencha o resultado, atualize o documento normativo
(ou abra uma [ADR](../../architecture/shared/00-decisions.md)) e rode `pnpm plan progress`.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Decisão que sobrevive ao fim do plano é **movida**, com o destino dito — não fica aberta num
  plano concluído.
