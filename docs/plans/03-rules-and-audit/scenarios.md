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
| S-01 | regra `project` resolve pedido igual em **outra** sessão do mesmo projeto | eq | integração | — | B-03 | ✅ |
| S-02 | regra `always` resolve em qualquer projeto | eq | integração | — | B-03 | ✅ |
| S-03 | regra `session` não sobrevive ao fim da sessão | est | integração | — | B-01 | ✅ |
| S-04 | regra que resolve **não** emite `permission.requested` nem dispara push | eq | integração | — | B-03 | ✅ |
| S-05 | pedido que não casa com a regra continua perguntando | fron | unit | — | B-01 | ✅ |
| S-06 | regra para `Bash(git status)` **não** libera `Bash(git push --force)` | fron | unit | — | B-01 | ✅ |
| S-07 | `deny` vence `allow` no mesmo escopo | eq | unit | — | B-06 | ✅ |
| S-08 | `deny` das settings de projeto continua sendo aplicado — nenhuma regra nossa o desfaz: sem `updatedPermissions`, com `settingSources: ['project']` (o `deny` do CLI é medido na [descoberta §8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos)) | eq | unit | — | B-06 | ✅ |
| S-09 | revogar faz o próximo pedido perguntar, **em sessão já de pé** | est | integração | — | B-05 | ✅ |
| S-10 | criar a mesma regra duas vezes não duplica linha | idem | integração | — | B-02 | ✅ |
| S-11 | dois pedidos simultâneos com a regra recém-criada resolvem os dois | conc | integração | — | B-03 | ✅ |
| S-12 | regra expirada não resolve nada | fron | unit | — | B-01 | ✅ |
| S-13 | criação e revogação de regra entram em `audit` | eq | integração | — | B-05 | ✅ |
| S-14 | regra de outro usuário não resolve o meu pedido — ele continua perguntando | err | integração | — | B-01 | ✅ |
| S-47 | padrão fora da gramática é recusado na criação | err | unit | `PERMISSION_RULE_PATTERN_INVALID` | B-01 | ✅ |
| S-48 | `Bash(git status:*)` casa `git status --short` e **não** casa `git statusx` | fron | unit | — | B-01 | ✅ |
| S-49 | validade acima do teto configurado é recusada na criação | fron | integração | `PERMISSION_RULE_EXPIRY_TOO_LONG` | B-02 | ✅ |
| S-53 | revogar a regra de outro usuário é recusado, e ela continua valendo para o dono | err | integração | `PERMISSION_NOT_OWNED` | B-05 | ✅ |
| S-54 | revogar regra que não existe | err | integração | `PERMISSION_RULE_NOT_FOUND` | B-05 | ✅ |
| S-55 | revogar duas vezes devolve a mesma regra revogada, e a trilha registra **uma** revogação | idem | integração | — | B-05 | ✅ |
| S-56 | regra `allow` não auto-aprova em sessão no modo `plan` — o humano é perguntado; `deny` continua negando | fron | unit | — | B-06 | ✅ |
| S-57 | regra `project` não resolve pedido de sessão em **outro** projeto | fron | unit | — | B-01 | ✅ |
| S-58 | `project`/`always` para invocação sem campo casável é recusado, nunca alargado para a tool inteira | err | unit | `INVALID_INPUT` | B-03 | ✅ |
| S-59 | falha ao consultar as regras pergunta ao humano — nunca autoriza | err | unit | — | B-03 | ✅ |
| S-60 | validade default acima do teto, ou teto acima do limite do código, impede o processo de subir | err | unit | — | B-02 | ✅ |
| S-61 | validade no passado, ou igual ao instante da criação, é recusada | fron | unit | `INVALID_INPUT` | B-01 | ✅ |
| S-62 | pedido resolvido por regra grava na história **qual** regra o resolveu | eq | integração | — | B-03 | ✅ |

## Telas de regra — B-07…B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | a lista mostra escopo, tool, padrão, autor, data e validade | eq | integração | — | B-07 | ✅ |
| S-16 | revogar na tela remove a linha e a próxima execução pergunta | est | integração | — | B-07 | ✅ |
| S-17 | escolher `always` exibe o alcance com todas as letras, sem eufemismo | eq | integração | — | B-08 | ✅ |
| S-18 | sem nenhuma regra, a tela mostra o estado vazio | fron | integração | — | B-07 | ✅ |
| S-19 | duplo clique em revogar revoga **uma** vez | idem | integração | — | B-07 | ✅ |
| S-20 | regra criada em outro dispositivo aparece ao recarregar a lista | conc | integração | — | B-09 | ✅ |
| S-21 | falha ao revogar mostra erro traduzido e mantém a linha | err | integração | `INTERNAL_ERROR` | B-09 | ✅ |
| S-22 | literal apresentável nas telas novas → `lint` e `i18n:check` falham | err | unit | — | B-10 | ✅ |
| S-63 | a pergunta oferece `project` e `always` com o padrão mais estreito e a validade default ([D-12](decisions.md#d-12--o-alcance-vem-na-pergunta)) | eq | unit | — | B-08 | ✅ |
| S-64 | invocação sem campo casável, ou com `)` no valor, oferece só `once` e `session` | fron | unit | — | B-08 | ✅ |
| S-65 | escolher `project`/`always` pede um segundo passo com padrão e validade, também em tool não destrutiva; voltar não envia nada ([D-14](decisions.md#d-14--escopo-persistido-sempre-pede-o-segundo-passo)) | est | integração | — | B-08, B-10 | ✅ |
| S-66 | regra a menos de 7 dias de expirar é sinalizada; a expirada continua listada, marcada ([D-13](decisions.md#d-13--perto-de-expirar-é-sete-dias)) | fron | integração | — | B-07, B-09 | ✅ |
| S-67 | sugestão persistida sem padrão ou sem validade não é oferecida pelo cliente | err | unit | — | B-08, B-10 | ✅ |
| S-68 | responder com o escopo que a pergunta ofereceu cria a regra que `/rules` lista, e revogar pela tela a tira de lá | est | e2e | — | B-07, B-08 | ✅ |
| S-69 | segundo toque em revogar, no app, revoga **uma** vez | idem | integração | — | B-09 | ✅ |

## Consulta da trilha — B-11…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | filtro por sessão devolve só aquela sessão | eq | integração | — | B-11 | ✅ |
| S-24 | filtro por período inclui a borda inicial e exclui a final | fron | integração | — | B-11 | ✅ |
| S-25 | paginação por cursor não repete nem pula linha com escrita concorrente | conc | integração | — | B-11 | ✅ |
| S-26 | consultar a trilha de outro usuário — filtrar pela sessão de outra pessoa ([D-05](decisions.md#d-05--de-quem-é-a-trilha), [D-17](decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro)) | err | integração | `FORBIDDEN` | B-12 | ✅ |
| S-27 | a consulta nunca devolve conteúdo de arquivo lido pela tool `Read` | err | unit | — | B-12 | ✅ |
| S-28 | filtro amplo usa índice, não varredura completa | fron | integração | — | B-14 | ✅ |
| S-29 | a mesma consulta, repetida, devolve a mesma página | idem | integração | — | B-11 | ✅ |
| S-30 | registro auto-resolvido aparece com `auto: true` e o id da regra | eq | integração | — | B-15 | ✅ |
| S-31 | o `traceId` liga a entrada da trilha ao log e ao evento | eq | integração | — | B-15 | ✅ |
| S-32 | a tela da trilha trata carregando, erro, vazio e conteúdo | eq | integração | — | B-13 | ✅ |
| S-50 | da entrada com `auto: true` se chega à regra — inclusive à já revogada, com o estado explicado | est | integração | — | B-15 | ✅ |
| S-70 | `from` depois de `to`, cursor malformado, ou `limit` fora de 1…100 | err | integração | `INVALID_INPUT` | B-11 | ✅ |
| S-71 | a última página devolve `nextCursor: null` — inclusive quando sobram exatamente `limit` linhas | fron | integração | — | B-11 | ✅ |
| S-72 | filtro por tool e por decisão, combinados com o período, devolve só a interseção | eq | integração | — | B-11 | ✅ |
| S-73 | a sessão sem nenhuma entrada devolve página vazia, não `403` — não há de quem ela seja | fron | integração | — | B-12 | ✅ |
| S-74 | abrir por id a regra de outro usuário, ou uma que não existe | err | integração | `PERMISSION_NOT_OWNED`, `PERMISSION_RULE_NOT_FOUND` | B-15 | ✅ |
| S-75 | entrada resolvida por regra `session` não oferece link, e diz que a regra acabou com a sessão | fron | integração | — | B-15 | ✅ |
| S-76 | dois turnos da mesma sessão gravam `traceId` distintos, cada um o do seu `session.prompt` ([D-16](decisions.md#d-16--o-traceid-é-o-do-turno)) | est | integração | — | B-15 | ✅ |
| S-77 | "carregar mais" acrescenta a página seguinte; falha ao carregar mais mantém na tela o que já estava | err | integração | `INTERNAL_ERROR` | B-13 | ✅ |
| S-78 | mudar o filtro recomeça do topo, sem misturar a página do filtro anterior | est | integração | — | B-13 | ✅ |
| S-79 | decisão humana mostra quem decidiu e de onde; recusa por prazo diz que ninguém respondeu | eq | integração | — | B-15 | ✅ |
| S-80 | clique duplo em "carregar mais" pede a página seguinte **uma** vez | idem | unit | — | B-13 | ✅ |
| S-81 | a decisão chega à trilha com o pedido, a regra, o escopo, quem e de onde ([D-15](decisions.md#d-15--a-correlação-nasce-com-a-entrada)) | eq | unit | — | B-15 | ✅ |

## Retenção — B-16…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | retenção configurada abaixo de 90 dias impede o processo de subir | err | unit | — | B-16 | ✅ |
| S-34 | a purga apaga o que está fora da janela | eq | integração | — | B-17 | ✅ |
| S-35 | a purga **não** apaga nada dentro da janela | fron | integração | — | B-17 | ✅ |
| S-36 | registro exatamente no 90º dia é mantido | fron | integração | — | B-17 | ✅ |
| S-37 | purga interrompida e reexecutada não apaga duas vezes nem perde lote | idem | integração | — | B-17 | ✅ |
| S-38 | purga concorrente com escrita não bloqueia a trilha | conc | integração | — | B-17 | ✅ |
| S-39 | a própria purga vira registro, com janela e contagem | eq | integração | — | B-19 | ✅ |
| S-40 | purga que falha sai com código ≠ 0 e diz o que não apagou | err | e2e | — | B-18 | ✅ |
| S-51 | job e comando manual simultâneos: uma purga roda, a outra sai com 0 sem apagar nada | conc | integração | — | B-17 | ✅ |
| S-52 | `DELETE` direto dentro da janela é recusado **pelo banco**, com o papel da aplicação | err | integração | — | B-17 | ✅ |
| S-82 | janela ausente, ou intervalo do job ausente, `0` ou abaixo do mínimo, impede o boot — desligar o job é só com `off` | err | unit | — | B-16 | ✅ |
| S-83 | job desligado não arma nada e loga `warn` no boot dizendo que a retenção passou a depender do comando | est | unit | — | B-17 | ✅ |
| S-84 | job ligado roda a primeira purga pouco depois do boot e rearma no intervalo; uma falha é logada em `error` e o ciclo seguinte arma igual | est | unit | — | B-17 | ✅ |
| S-85 | lote que o banco recusa não apaga nada **nem** deixa registro: apagar e registrar são uma instrução só ([D-19](decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga)) | err | integração | — | B-19 | ✅ |
| S-86 | purga que não encontra nada fora da janela não deixa registro, e rodar de novo não muda nada | idem | integração | — | B-17 | ✅ |
| S-87 | falha numa trilha não impede a outra: o relatório diz quanto cada uma apagou e qual falhou | err | integração | — | B-17 | ✅ |
| S-88 | o piso do banco são 90 × 24 h exatas, qualquer que seja o fuso da sessão ([D-21](decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário)) | fron | integração | — | B-16 | ✅ |
| S-89 | `pnpm db purge` apaga fora da janela, sai 0 e diz quanto saiu de cada trilha e até quando | eq | e2e | — | B-18 | ✅ |
| S-90 | `pnpm db purge` com outra purga em curso sai 0, não apaga nada e diz por quê | conc | integração | — | B-18 | ✅ |
| S-91 | `pnpm db purge` com o banco inalcançável sai ≠ 0 e diz que nada foi apagado | err | e2e | — | B-18 | ✅ |

## E2E — B-20…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-41 | aprovar com `always` → o pedido seguinte não pergunta e a tool executa | eq | e2e | — | B-21 | ✅ |
| S-42 | revogar → o pedido seguinte pergunta de novo, na sessão que já estava aberta | est | e2e | — | B-21 | ✅ |
| S-43 | a trilha mostra a execução auto-resolvida e a regra que a resolveu | eq | e2e | — | B-22 | ✅ |
| S-44 | regra criada no celular vale para a sessão aberta no web — pelo contrato no Playwright e pelas telas no `integration_test` do app | conc | e2e | — | B-20 | ✅ |
| S-45 | abrir a trilha de outro usuário pela porta do usuário — `403` pela [D-05](decisions.md#d-05--de-quem-é-a-trilha) e [D-17](decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro); o texto antigo dizia `NOT_FOUND` | err | e2e | `FORBIDDEN` | B-23 | ✅ |
| S-46 | revogar a mesma regra nas duas pontas ao mesmo tempo é idempotente — também em unit e integração, onde a corrida é determinística; foi escrevendo este cenário que a revogação dupla na trilha apareceu | idem | e2e | — | B-23 | ✅ |
| S-92 | `pnpm db purge` com uma sessão aberta não leva a trilha dela, e a sessão segue gravando depois — descoberto na F4: a B-23 pede, a matriz não tinha linha | conc | e2e | — | B-23 | ✅ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Retenção (B-16…B-19) | `est` — só na purga | a purga não tem máquina de estados — ela roda, apaga por janela e registra. O que poderia transitar é o lote, coberto pela idempotência em S-37. O **job** tem estados (desligado, armado, parado), e eles estão em S-83 e S-84 |
| E2E (B-20…B-23) | `fron` | as fronteiras que importam aqui são as da janela de retenção, exatas e baratas em integração (S-35, S-36). Repeti-las em e2e custaria minutos para provar o mesmo |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
