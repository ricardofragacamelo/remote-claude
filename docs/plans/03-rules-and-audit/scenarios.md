# Plano 03 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Regras de permissão — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | regra `project` resolve pedido igual em **outra** sessão do mesmo projeto | eq | integração | — | B-03 | ⬜ |
| S-02 | regra `always` resolve em qualquer projeto | eq | integração | — | B-03 | ⬜ |
| S-03 | regra `session` não sobrevive ao fim da sessão | est | integração | — | B-01 | ⬜ |
| S-04 | regra que resolve **não** emite `permission.requested` nem dispara push | eq | integração | — | B-03 | ⬜ |
| S-05 | pedido que não casa com a regra continua perguntando | fron | unit | — | B-01 | ⬜ |
| S-06 | regra para `Bash(git status)` **não** libera `Bash(git push --force)` | fron | unit | — | B-01 | ⬜ |
| S-07 | `deny` vence `allow` no mesmo escopo | eq | unit | — | B-06 | ⬜ |
| S-08 | `deny` das settings de projeto continua sendo aplicado | eq | integração | — | B-06 | ⬜ |
| S-09 | revogar faz o próximo pedido perguntar, **em sessão já de pé** | est | integração | — | B-05 | ⬜ |
| S-10 | criar a mesma regra duas vezes não duplica linha | idem | integração | — | B-02 | ⬜ |
| S-11 | dois pedidos simultâneos com a regra recém-criada resolvem os dois | conc | integração | — | B-03 | ⬜ |
| S-12 | regra expirada não resolve nada | fron | unit | — | B-01 | ⬜ |
| S-13 | criação e revogação de regra entram em `audit` | eq | integração | — | B-05 | ⬜ |
| S-14 | regra de outro usuário não resolve o meu pedido — ele continua perguntando | err | integração | — | B-01 | ⬜ |
| S-47 | padrão fora da gramática é recusado na criação | err | unit | `PERMISSION_RULE_PATTERN_INVALID` | B-01 | ⬜ |
| S-48 | `Bash(git status:*)` casa `git status --short` e **não** casa `git statusx` | fron | unit | — | B-01 | ⬜ |
| S-49 | validade acima do teto configurado é recusada na criação | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-02 | ⬜ |

## Telas de regra — B-07…B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | a lista mostra escopo, tool, padrão, autor, data e validade | eq | integração | — | B-07 | ⬜ |
| S-16 | revogar na tela remove a linha e a próxima execução pergunta | est | integração | — | B-07 | ⬜ |
| S-17 | escolher `always` exibe o alcance com todas as letras, sem eufemismo | eq | integração | — | B-08 | ⬜ |
| S-18 | sem nenhuma regra, a tela mostra o estado vazio | fron | integração | — | B-07 | ⬜ |
| S-19 | duplo clique em revogar revoga **uma** vez | idem | integração | — | B-07 | ⬜ |
| S-20 | regra criada em outro dispositivo aparece ao recarregar a lista | conc | integração | — | B-09 | ⬜ |
| S-21 | falha ao revogar mostra erro traduzido e mantém a linha | err | integração | `INTERNAL_ERROR` | B-09 | ⬜ |
| S-22 | literal apresentável nas telas novas → `lint` e `i18n:check` falham | err | unit | — | B-10 | ⬜ |

## Consulta da trilha — B-11…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | filtro por sessão devolve só aquela sessão | eq | integração | — | B-11 | ⬜ |
| S-24 | filtro por período inclui a borda inicial e exclui a final | fron | integração | — | B-11 | ⬜ |
| S-25 | paginação por cursor não repete nem pula linha com escrita concorrente | conc | integração | — | B-11 | ⬜ |
| S-26 | consultar a trilha de outro usuário | err | integração | `NOT_FOUND` | B-12 | ⬜ |
| S-27 | a consulta nunca devolve conteúdo de arquivo lido pela tool `Read` | err | unit | — | B-12 | ⬜ |
| S-28 | filtro amplo usa índice, não varredura completa | fron | integração | — | B-14 | ⬜ |
| S-29 | a mesma consulta, repetida, devolve a mesma página | idem | integração | — | B-11 | ⬜ |
| S-30 | registro auto-resolvido aparece com `auto: true` e o id da regra | eq | integração | — | B-15 | ⬜ |
| S-31 | o `traceId` liga a entrada da trilha ao log e ao evento | eq | integração | — | B-15 | ⬜ |
| S-32 | a tela da trilha trata carregando, erro, vazio e conteúdo | eq | integração | — | B-13 | ⬜ |
| S-50 | da entrada com `auto: true` se chega à regra — inclusive à já revogada, com o estado explicado | est | integração | — | B-15 | ⬜ |

## Retenção — B-16…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | retenção configurada abaixo de 90 dias impede o processo de subir | err | unit | — | B-16 | ⬜ |
| S-34 | a purga apaga o que está fora da janela | eq | integração | — | B-17 | ⬜ |
| S-35 | a purga **não** apaga nada dentro da janela | fron | integração | — | B-17 | ⬜ |
| S-36 | registro exatamente no 90º dia é mantido | fron | integração | — | B-17 | ⬜ |
| S-37 | purga interrompida e reexecutada não apaga duas vezes nem perde lote | idem | integração | — | B-17 | ⬜ |
| S-38 | purga concorrente com escrita não bloqueia a trilha | conc | integração | — | B-17 | ⬜ |
| S-39 | a própria purga vira registro, com janela e contagem | eq | integração | — | B-19 | ⬜ |
| S-40 | purga que falha sai com código ≠ 0 e diz o que não apagou | err | e2e | — | B-18 | ⬜ |
| S-51 | job e comando manual simultâneos: uma purga roda, a outra sai com 0 sem apagar nada | conc | integração | — | B-17 | ⬜ |
| S-52 | `DELETE` direto dentro da janela é recusado **pelo banco**, com o papel da aplicação | err | integração | — | B-17 | ⬜ |

## E2E — B-20…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-41 | aprovar com `always` → o pedido seguinte não pergunta e a tool executa | eq | e2e | — | B-21 | ⬜ |
| S-42 | revogar → o pedido seguinte pergunta de novo, na sessão que já estava aberta | est | e2e | — | B-21 | ⬜ |
| S-43 | a trilha mostra a execução auto-resolvida e a regra que a resolveu | eq | e2e | — | B-22 | ⬜ |
| S-44 | regra criada no celular vale para a sessão aberta no web | conc | e2e | — | B-20 | ⬜ |
| S-45 | abrir a trilha de outro usuário pela porta do usuário | err | e2e | `NOT_FOUND` | B-23 | ⬜ |
| S-46 | revogar a mesma regra nas duas pontas ao mesmo tempo é idempotente | idem | e2e | — | B-23 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Consulta da trilha (B-11…B-15) | `est` | é leitura sobre tabela append-only: não há transição a exercitar. O estado que existe é o do `PermissionRequest`, coberto no [plano 01](../01-live-session/scenarios.md) |
| Retenção (B-16…B-19) | `est` | a purga não tem máquina de estados — ela roda, apaga por janela e registra. O que poderia transitar é o lote, coberto pela idempotência em S-37 |
| E2E (B-20…B-23) | `fron` | as fronteiras que importam aqui são as da janela de retenção, exatas e baratas em integração (S-35, S-36). Repeti-las em e2e custaria minutos para provar o mesmo |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
