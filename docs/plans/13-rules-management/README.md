# Plano 13 — Gestão de regras

**Objetivo:** as regras de permissão ganham uma tela de gestão de verdade — entender o que cada uma
permite ou bloqueia, onde vale e quanto foi usada, criar e ajustar com segurança, testar um comando e
simular contra a trilha antes, e revogar (e desfazer) —, com a explicação do que uma regra é escrita
na própria tela.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

Nenhuma mudança deste plano toca o WebSocket, e por isso o `test:e2e:mobile` não entra no critério:
o app Flutter só lê `GET /permission-rules` e `DELETE /permission-rules/:id`, cujo comportamento sem
parâmetro não muda (S-01, S-02).

**Depende de:** [plano 03](../03-rules-and-audit/README.md) (concluído — é o que se gerencia aqui);
[plano 06](../06-workbench/README.md) (navegação global, moldura de tela com ajuda, paleta, central
de notificações, seletor de pasta). **Não** depende do [plano 12](../12-audit-explained/README.md):
o uso sai das entradas de decisão de `audit_entries`, que já têm o `rule_id` desde a `0009`; o 13 só
muda para onde o link "ver na trilha" aponta.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário, sobre a tela de hoje: "muito simples, tem que ter tela própria, controles melhores, o que
faz". A `/rules` do [plano 03](../03-rules-and-audit/F1-rules-ui.md) lista as regras concedidas, com
escopo, padrão, validade e um botão de revogar. Ela cumpre a promessa daquele plano — a autorização
antecipada tem onde ser vista e retirada —, e só isso: não diz em palavras o que a regra deixa o Claude
fazer, não diz se ela serve para alguma coisa, não encontra uma regra entre cinquenta, e não cria
nenhuma. O vazio dela diz: "uma regra nasce quando você responde 'não perguntar de novo'".

Criar pela tela é o pedido que mais pesa, e o que mais pede cuidado. Até aqui toda regra nascia de
uma invocação real, com o **padrão mais estreito** que a cobria. Pela tela a pessoa escreve o padrão —
e a gramática deixa escrever largo. Por isso o plano não é "uma tela mais bonita": é um backend que
**recusa** o que é largo demais por qualquer porta, uma análise que acha a regra que nunca responde ou
que sobra, um teste de comando e uma simulação que mostram o efeito **antes** de gravar, e a mesma
rotina de concessão do plano 03 por trás de tudo.

### O que a leitura do código mudou

O briefing deste plano descreveu o backend de memória. Lido o código em 2026-09-26, cinco fatos são
diferentes do que se supunha — e quatro deles viraram decisão:

| O que se supunha | O que o código faz | Onde vira trabalho |
|---|---|---|
| `POST /permission-rules` cria regra `project` para uma pasta do usuário | o controller só normaliza o caminho (`WorkspacePath.create`); **não** confere allowlist nem dono — aceita qualquer pasta | B-09 (S-23…S-28) |
| `project` vale "no projeto" | vale na pasta **exata** da sessão: o `projectPath` do pedido é o `workspace.value` da sessão e o casamento é igualdade — a regra de `/raiz/app` não alcança a sessão em `/raiz/app/backend` | [D-10](decisions.md#d-10--project-alcança-as-subpastas), B-09 (S-30) |
| a gramática é a do Claude Code, que não deixa um prefixo autorizar comando encadeado | o prefixo casa `value.startsWith(conteúdo + ' ')`: `allow Bash(git status:*)` cobre `git status && curl … \| sh`, e nenhum teste cobre operador de shell; e em tool de caminho `Read(/a/src:*)` não cobre `/a/src/x.ts` | [D-07](decisions.md#d-07--comando-composto-e-o-prefixo), [D-08](decisions.md#d-08--prefixo-em-tool-de-caminho), B-08 (S-07…S-14) |
| regra larga demais é um risco da interface | o backend aceita `allow Bash` com escopo `always` — há teste de integração que concede `allow Write` assim | [D-09](decisions.md#d-09--o-que-é-largo-demais), B-08, B-09 (S-31, S-32) |
| a regra tem "autor" | tem **dono**: `grantedBy` é o `sub` de quem a possui, mostrado cru na linha; não há registro de como ela nasceu (card, API, qual aparelho) | B-09 (S-35), B-22 |

E três confirmações que o desenho usa: a revogada sai da listagem e só `GET /permission-rules/:id` a
devolve ([plano 03 · D-18](../03-rules-and-audit/decisions.md#d-18--a-regra-revogada-tem-endereço));
`audit_entries.rule_id` existe mas **não tem índice**, e a retenção de 90 dias é menor que o teto de
validade de 365 — o uso é "nos últimos 90 dias" ([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação));
e a seção Regras do `web/03-ui-system.md` tem uma linha duplicada, corrigida na B-06.

### As garantias do plano 03 continuam valendo

Nenhuma é reaberta; todas são provadas de novo, porque o código que as sustenta muda aqui:

| Garantia | Onde é provada de novo |
|---|---|
| qualquer `deny` que case vence | S-19, S-95, S-112 |
| em `plan`, nenhum `allow` responde | S-19, S-96, S-219 |
| escopo persistido pede segundo passo | S-34, S-188, S-220 |
| toda regra expira, com teto, recusado e nunca truncado | S-37, S-66, S-90, S-148 |
| revogar (e encurtar) vale na próxima invocação da sessão viva | S-76, S-86, S-215 |
| conceder e revogar vão para a trilha; falha da trilha não deixa autorização sem rastro | S-40, S-65, S-77, S-80 |
| a regra nunca é devolvida ao SDK | S-41 |
| regra de um usuário nunca resolve, nem aparece, para outro | S-49, S-58, S-98, S-119, S-218 |

---

## Escopo

### Entra

| | |
|---|---|
| Contrato: rotas de leitura, escrita, teste, simulação, importação; códigos e kinds novos; gramática endurecida; a tela no `web/03` | F0 |
| Casamento que conhece a decisão (comando composto), largura do padrão, contenção e alcance como regra pura | F1 |
| Criação que confere pasta pela allowlist e largura em toda porta; validade própria de `deny`; origem da regra | F1 |
| Listagem com filtros, busca, ordenação, resumo, uso, achados; invocações e história de cada regra | F1 |
| Encurtar e estender com `If-Match`; revogar em lote; desfazer a revogação | F1 |
| Testar um comando; redundância, sobreposição e conflito; simular contra as últimas invocações | F1 |
| Modelos de regra; exportar e importar com prévia e segundo passo; lembrete de expiração | F1 |
| A tela: abas, filtros, tabela densa, detalhe com a frase do que a regra faz, validade, lote, desfazer, menu de contexto, paleta, selo de expiração, ajuda | F2 |
| O assistente de criação, o teste de comando, a simulação, modelos, duplicar, exportar e importar pela tela | F3 |
| E2E do ciclo, da segurança e das regressões | F4 |

### Não entra

- **Editar padrão, escopo ou decisão de uma regra.** Mudar é revogar e criar — é o que mantém a
  trilha verdadeira sobre o que respondeu cada invocação ([D-01](decisions.md#d-01--o-que-se-edita-numa-regra)).
  A tela oferece o atalho (duplicar alterando, e revogar a original), não a edição.
- **Gramática de caminho** (`Edit(src/**)`, estilo gitignore). É outra linguagem de padrão e outra
  superfície de ataque; registrada como candidata a plano futuro ([D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)).
- **Regras de sessão na tela.** A regra `session` vive em memória e morre com a sessão; ela aparece no
  teste de comando "nesta sessão", e a ajuda explica. Mostrá-la numa lista de gestão seria gerir o que
  some sozinho.
- **Editar as permissões do `.claude/settings.json` do projeto.** Elas furam o `canUseTool` em
  diretório confiado ([backend/04](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido));
  mostrá-las (só leitura) é do [plano 11](../11-claude-settings/README.md).
- **Step-up (reautenticação recente) para criar regra.** Mecanismo do [plano 10](../10-integrated-terminal/README.md)
  e do [plano 05](../05-hardening-operations/README.md); quando existir, criar `allow` `broad` é
  candidato a exigi-lo ([D-03](decisions.md#d-03--segundo-passo-e-step-up-ao-criar-pela-tela)).
- **Limite de taxa das rotas novas** — nos limites do [plano 05](../05-hardening-operations/README.md).
- **As telas novas no app Flutter.** O web é mobile-first e responde no celular; o app mantém a lista e
  a revogação do plano 03, que continuam funcionando sem mudança.
- **Regras sugeridas a partir dos scripts do `package.json`** — quando o [plano 10](../10-integrated-terminal/README.md)
  detectar tarefas ([D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram)).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | o contrato inteiro nos documentos normativos: rotas, campos, códigos, kinds, gramática, a tela | B-01…B-07 | 🔲 |
| F1 | [Backend de regras](F1-rules-backend.md) | casamento endurecido, criação segura, listagem com uso, validade, lote, desfazer, teste, análise, simulação, modelos, importação, lembrete | B-08…B-19 | 🔲 |
| F2 | [Tela de regras](F2-rules-screen.md) | a tela de gestão: abas, filtros, tabela, detalhe, validade, lote, lembrete e ajuda | B-20…B-26 | 🔲 |
| F3 | [Criação de regras](F3-rule-authoring.md) | criar pela tela com prévia, teste e simulação; modelos, duplicar, exportar e importar | B-27…B-32 | 🔲 |
| F4 | [E2E](F4-e2e.md) | o ciclo, a segurança e as regressões pela porta do usuário | B-33…B-36 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O contrato é escrito antes do código, e o app Flutter não percebe a mudança | B-01…B-03 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-01, S-02, S-06 |
| Códigos novos com status que significa, nas três fontes | B-04 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-03 |
| Os fatos novos vão para a trilha, sem conteúdo | B-05 | [backend/05-persistence](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) | S-04, S-05 |
| A tela e a gramática estão nos documentos normativos | B-06, B-07 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada), [backend/04](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) | S-13, S-159, S-223 |
| Um prefixo `allow` não autoriza comando encadeado; um `deny` pega o segmento | B-08 | [backend/04](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) | S-07…S-12, S-20, S-21 |
| A largura do padrão é regra pura, e o que é largo demais é recusado por qualquer porta | B-08, B-09 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-15, S-16, S-31…S-33, S-90, S-147, S-189, S-217 |
| Regra de pasta só para pasta liberada e do próprio usuário, na forma que a sessão usa | B-09 | [backend/03-modules](../../architecture/backend/03-modules.md#workspace) | S-22…S-30, S-195 |
| As garantias do plano 03 continuam de pé | B-08, B-09, B-12, B-13, B-36 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-13, S-19, S-34, S-39…S-41, S-76, S-86, S-96, S-219, S-220 |
| `deny` expira, com teto próprio que falha fechado | B-09 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada) | S-37, S-38 |
| Toda regra diz de onde veio | B-09, B-22 | [backend/05-persistence](../../architecture/backend/05-persistence.md#as-regras-de-permissão) | S-35, S-36 |
| Encontrar uma regra entre muitas, e nunca a de outra pessoa | B-10, B-20, B-21 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-42…S-54, S-156, S-158 |
| Quanto cada regra foi usada, e o número bate com a trilha | B-11 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-55…S-64, S-165 |
| Encurtar e estender sem ressuscitar regra nem perder corrida | B-12, B-23 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-65…S-79, S-157, S-169…S-172 |
| Revogar em lote, e desfazer em vez de confirmar | B-13, B-24 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada) | S-80…S-93, S-173…S-177 |
| Testar um comando com a mesma precedência da sessão, sem efeito e sem vazar | B-14, B-28 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-94…S-109, S-196…S-199 |
| Achar a regra redundante, sobreposta ou que nunca responde, e explicar | B-15, B-22 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-110…S-120, S-164, S-190 |
| Simular o efeito contra a trilha antes de criar ou revogar | B-16, B-29 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-121…S-132, S-200…S-202 |
| Modelos de regra, que passam pelas mesmas validações | B-17, B-30 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-133…S-135, S-203, S-204 |
| Exportar e importar com prévia e segundo passo | B-18, B-31 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-136…S-149, S-205…S-208, S-216 |
| Lembrar antes de a regra expirar, sem vazar padrão pelo push | B-19, B-25 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-150…S-155, S-178…S-180 |
| A tela diz o que cada regra faz, em palavras | B-21, B-22 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada), [02-i18n](../../architecture/shared/02-i18n.md) | S-159…S-168, S-222 |
| Criar pela tela, vendo o alcance real antes de gravar | B-27 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada) | S-185…S-195, S-211, S-212 |
| Ajuda de verdade, atalhos, teclado e acessibilidade em toda tela nova | B-26, B-32 | [web/01-architecture](../../architecture/web/01-architecture.md), [02-i18n](../../architecture/shared/02-i18n.md) | S-181…S-184, S-209, S-210, S-221 |
| O ciclo, a segurança e as regressões pela porta do usuário | B-33…B-36 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-211…S-222 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── domain/permission/services/        rule-pattern (casamento por decisão) · rule-breadth ·
│                                      rule-coverage · rule-reach · rule-analysis
├── application/permission/
│   ├── ports/                         rule-folder-resolver.port (→ workspace) · leitura da trilha
│   ├── change-permission-rule-expiry · revoke-permission-rules · restore-permission-rules
│   ├── evaluate-permission · simulate-permission-rules · preview-permission-rule
│   ├── rule-templates (catálogo) · export/import-permission-rules
│   └── remind-expiring-rules (job)
├── application/audit/ports/           AuditTrailReader: uso, invocações e história por regra
├── adapter/inbound/http/permission-rules/   as rotas novas
├── adapter/outbound/persistence/{permission,audit}/
└── infrastructure/database/migrations/      origem da regra e marca de lembrete · índices ·
                                             kinds novos no CHECK de audit_events

web/src/features/permission/
├── components/   RulesScreen · RuleTable · RuleCard · RuleDetailPanel · RuleExpiryDialog ·
│                 RuleBulkBar · RuleWizard · CommandTester · RuleSimulation · RuleTemplates ·
│                 RuleImportPreview · RulesHelp
├── hooks/        useRules · useRule · useRuleMutations · useRuleEvaluation · useRuleSimulation ·
│                 useRuleImport · useRuleTemplates
└── services/     rule.service.ts
web/src/app/      RulesRoute (/rules, /rules/$ruleId) · RuleWizardRoute (/rules/new)

e2e/specs/        rule-authoring · rule-management · rule-authoring-security
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Criar pela tela facilita escrever regra larga** — o R-01 do plano 03, agora com um formulário na frente | **aberto** — mitigação em camadas: o servidor recusa `unbounded` e exige confirmação para `broad` por qualquer porta ([D-09](decisions.md#d-09--o-que-é-largo-demais)); prévia, teste e simulação mostram o alcance real antes; segundo passo sempre |
| R-02 | **Endurecer o casamento muda o comportamento de regras que já existem** — um `allow` de prefixo passa a perguntar o comando encadeado | **aberto** — só na direção segura, provado por propriedade (S-20); a ajuda e o detalhe dizem o que o prefixo não cobre; o progresso registra a mudança na data em que ela entrar ([D-07](decisions.md#d-07--comando-composto-e-o-prefixo)) |
| R-03 | **O teste de comando diz "seria perguntado" e o CLI decide antes** — `deny` do projeto, `acceptEdits`, leituras aprovadas pelo CLI | **aberto** — toda resposta traz as ressalvas (S-106), e a ajuda as explica; o teste responde pelo que **nós** decidimos, e diz isso |
| R-04 | **O uso é janelado pela retenção**: uma regra de 365 dias mostra só os últimos 90 | **aberto** — a tela diz "nos últimos 90 dias"; a trilha é a fonte porque o número precisa bater com ela ([D-05](decisions.md#d-05--a-fonte-do-uso-e-da-simulação)) |
| R-05 | **Importar traz regras em massa de outra máquina ou de outra pessoa** | **aberto** — cada item passa pela rotina de concessão (pasta, largura, validade nova), prévia por item, segundo passo, dono sempre o chamador, trilha ([D-17](decisions.md#d-17--exportar-e-importar)) |
| R-06 | **Corrida entre revogar e estender ressuscita uma regra** | **aberto** — a escrita da validade é condicional ao estado e à versão, e é ela que decide (S-74, S-75) |
| R-07 | **Teste e simulação viram oráculo caro** — varrer a trilha a cada tecla | **aberto** — tetos de `limit`, índice parcial, prévia com debounce, e os limites de taxa do [plano 05](../05-hardening-operations/README.md) |
| R-08 | **Dependência do plano 06** para moldura, navegação, paleta, central de notificações e seletor de pasta | **aberto** — a F0 e a F1 não dependem dele; se a F2 começar antes, a tela usa o `Screen` atual e a tarefa de moldura volta a ser do 06, registrada no progresso |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) e as [decisões](decisions.md) antes
   de começar: a F0 não começa com D-01…D-13 abertas, nem a F1 com D-14…D-18.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
