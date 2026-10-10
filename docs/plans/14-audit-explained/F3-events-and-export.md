# F3 — Eventos e exportação

Plano: [14 — Auditoria explicada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-trail-screen.md), e das decisões D-13 e D-14.
**Entrega:** a trilha conta a história inteira — não só as tools, mas os fatos que as explicam (a regra
concedida, o aparelho aprovado, a conversa retomada, o desfazer) —, liga cada invocação ao ponto da
conversa, ao diff e à regra que a respondeu, sai da máquina como arquivo sob as mesmas regras da tela, e
é alcançável a partir de onde o usuário estava quando estranhou algo.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-26 — Eventos na linha do tempo, explicados por tipo 🔲

O **registro de tipos** do web que a [B-06](F0-contract.md) contratou: por `kind`, ícone, frase e vínculo.

| Tipo | Frase (exemplo) | Vínculo |
|---|---|---|
| `device.registered` / `approved` / `revoked` / `expired` | "O celular «Pixel 8» foi aprovado por você" | histórico do aparelho ([plano 17](../17-devices/README.md)) |
| `permission.ruleGranted` / `ruleRevoked` | "Você deixou o `{agent}` rodar `pnpm test` e o que vier depois nesta pasta sem perguntar, até 12/10" — o alcance vem da descrição da regra na gramática canônica, montada pelo domínio no backend, nunca do padrão lido no cliente | a regra, em qualquer estado ([03 · D-18](../03-rules-and-audit/decisions.md#d-18--a-regra-revogada-tem-endereço)) |
| `session.resumed` / `session.forked` | "Você continuou uma conversa desta pasta" · "…uma conversa começada fora, numa cópia nova" | a conversa |
| `session.filesRewound` | "Você desfez o turno «…»: 3 arquivos restaurados, 1 preservado porque foi alterado à mão" | a lista de arquivos, com o que aconteceu a cada um |
| `audit.exported` | "Você exportou 1 240 invocações (CSV)" | o filtro usado, reaplicável |

Os `kind` que os planos 07, 11, 12, 13, 15 e 17 acrescentarem entram por eles, com a explicação na mesma
entrega (regra da B-06); os de uma extensão de motor são `engine.*`, com o motor no payload, e a explicação
que só um motor tem vem do registro de `web/src/engines/<motor>/`. Tipo desconhecido: nome técnico e "esta versão não sabe explicar este tipo"
(S-116). Desfazer com muitos arquivos mostra os primeiros e "mais N" (S-117); regra revogada abre no
estado dela (S-118).

### B-27 — Ir ao ponto exato da conversa 🔲

Pela D-13. No backend, `GET /transcripts/:engine/:id/messages` (a rota da conversa como `{ engine, id }`,
desde a F1 do [plano 28](../28-agent-neutral-core/F1-engine-port.md)) ganha `aroundToolUseId` — a página de mensagens em
volta do bloco `tool_use` daquela invocação, pelo mesmo cache e coalescência do
[plano 04](../04-transcript-and-resume/README.md), com `INVALID_INPUT` quando o bloco não está no
transcript (S-121) e `NOT_FOUND` quando a conversa sumiu do disco (S-120); contrato atualizado em
[backend/03 · transcript](../../architecture/backend/03-modules.md#transcript). No web, "abrir na
conversa" leva ao painel do [plano 08](../08-claude-panel/README.md) quando ele existir, ou à tela de
histórico até lá, rolada até a mensagem e com ela destacada (S-119). Invocação sem conversa registrada
não oferece o link e diz por quê (S-122).

### B-28 — O diff da invocação 🔲

O diff é **do backend** ([D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)): o web nunca lê
`old_string`, `new_string` nem campo nenhum do input. `GET /audit/invocations/:id/diff` (B-03) responde
na forma de `GET /sessions/:id/tools/:toolUseId/diff`, montado do input gravado pelo `FileChange` que o
classificador do adapter extrai ([plano 28 · F2](../28-agent-neutral-core/F2-canonical-tools.md)) e pela
mesma regra pura `toolDiffOf`, sem ler disco: uma edição (`file.edit`) sai com `scope: edit`; um
`file.write` não tem "antes" no input, e sai com `before.state: unavailable`, que a tela explica. Com a
sessão viva, "abrir diff completo" leva à rota da sessão, que tem o snapshot (S-123). O diff nunca é
gravado: é o input, mostrado de outro jeito.

### B-29 — Comparar com a regra que respondeu 🔲

Na invocação respondida por uma regra gravada: o padrão da regra (`GET /permission-rules/:id`, que já
existe; na gramática canônica, mostrado como está — `shell(pnpm test:*)`), o `subject` da invocação, e
**a parte que casou** destacada — "a regra respondeu porque o comando começa com `pnpm test`" (S-124).
Quem diz o que casou é o backend, pelo domínio de `permission`, que é dono do parser, do casamento e da
descrição (`messageKey` + `params`) da gramática canônica
([plano 28 · F5](../28-agent-neutral-core/F5-permission-dialect.md), o `reach` do
[plano 15 · B-02](../15-rules-management/F0-contract.md)) — não o `RuleDialect`, que só traduz; o web
não compara padrão com comando ([D-15](decisions.md#d-15--o-núcleo-neutro-do-plano-28)). A regra que a migração do 28 desligou, por não ter
tradução inequívoca, não oferece a parte que casou: mostra o padrão antigo como texto e o motivo (S-152). Regra de sessão, que nunca foi gravada, não
oferece comparação e diz por quê (S-125); regra que não existe é `PERMISSION_RULE_NOT_FOUND` (S-126).
Quando o [plano 15](../15-rules-management/README.md) entregar o `evaluate`, a explicação passa a vir
dele — a mesma precedência pura, sem uma segunda implementação no cliente.

### B-30 — ADR: exportar a trilha 🔲

O [plano 03](../03-rules-and-audit/README.md) pôs a exportação fora com uma condição: vira ADR antes de
virar task. A ADR-019 (em
[00-decisions](../../architecture/shared/00-decisions.md); a numeração segue a ordem dos planos, e o 13
abre a 018) registra a [D-14](decisions.md#d-14--exportar):
o que sai (o recorte filtrado, com o input pela mesma lista de permissão da tela), o teto, a neutralização
do CSV, que exportar é fato da trilha gravado antes do primeiro byte, e por que **não** há exportação
agendada. O contrato de `GET /audit/export` em `backend/03` passa a citá-la (S-136).

### B-31 — Exportar: o backend 🔲

`GET /audit/export?format=jsonl|csv&<filtros da linha do tempo>`:

- conta antes; acima do teto, `422 AUDIT_EXPORT_TOO_LARGE` com `params.limit` e `params.count` (S-128);
- grava `audit.exported` (filtro e contagem, nunca o conteúdo) **antes** do primeiro byte; trilha
  indisponível não exporta — `INTERNAL_ERROR` com `audit.error.unavailable` (S-129);
- sai por streaming, página a página pelo mesmo leitor da lista — as mesmas invocações que a lista traria
  (S-127); cliente que aborta interrompe a leitura (S-132);
- CSV com as células que começam com `=`, `+`, `-`, `@`, tab ou CR neutralizadas (S-130); `file.read` só
  com o `subject` e a janela, pelo mesmo `disclosedInput` por `kind` da B-10 (S-131); filtro pela sessão de outra pessoa é `403` (S-134);
- exportar duas vezes é dois fatos (S-133); log de I/O com filtro, formato, contagem e duração.

### B-32 — Exportar: a tela 🔲

Botão "Exportar" no cabeçalho e "Exportar seleção" no menu da lista: diálogo com o formato, a contagem que
o arquivo terá (do resumo) e, acima do teto, a sugestão de estreitar o filtro em vez de um erro seco
(S-135). O download é do navegador; a trilha mostra o `audit.exported` logo depois.

### B-33 — "Ver na trilha" a partir de onde o usuário está 🔲

O link é um endereço estável — `/audit/invocations/$invocationId`, ou a busca por `sessionId` + `toolUseId`
quando quem liga só sabe o par (S-137). Esta task entrega o endereço e o componente de link; os planos que
o usam o põem no lugar deles: o card de tool do [plano 08](../08-claude-panel/README.md), o detalhe de
regra do [plano 15](../15-rules-management/README.md) ("últimas invocações respondidas"), o histórico do
aparelho do [plano 17](../17-devices/README.md). Par que ainda não foi gravado — o card é mais rápido que a
trilha — responde `404` e a tela oferece "tentar de novo" (S-138).

### B-34 — Ajuda dos eventos, do diff, da regra e da exportação 🔲

A gaveta de ajuda da B-25 ganha: cada tipo de evento em palavras; o que o diff mostra e o que não mostra
(o `file.write` sem "antes"); o que a comparação com a regra quer dizer; o que o arquivo exportado contém, por
que o input vai inteiro, e por que a própria exportação fica na trilha (S-139). Tooltips e atalhos das ações
novas na command palette, como na B-25.

---

## Cenários cobertos

S-115…S-139, S-152.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
