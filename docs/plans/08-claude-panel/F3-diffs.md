# F3 — Diffs

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-rendering.md), e da aba de diff do editor do
[plano 07](../07-explorer-and-editor/README.md).
**Entrega:** o que o Claude muda fica visível **antes** de aprovar (no card de permissão), **enquanto**
acontece (diff inline no chat), **no editor** (aba de diff) e **por sessão** (view "Alterações") — e
pode ser aceito ou rejeitado por arquivo e por trecho, com as garantias do desfazer.

**Decisões que precisam estar fechadas para começar:** D-08 e D-18
([decisions.md](decisions.md#f3--diffs)), e a D-03 da F0.

---

## O diff é nosso, a partir do que já guardamos

O store do [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)
já tem o conteúdo **anterior** de cada caminho no primeiro toque de cada turno
(`turn_file_checkpoints`, com o blob em disco) e o hash de como a sessão deixou cada arquivo
(`session_file_states`) ([backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)).
Pela D-03, o diff sai daí e do input da tool — sem segundo store. Onde o store não alcança (segundo
Edit no mesmo arquivo e turno, arquivo acima do teto do snapshot), a resposta **diz**, em vez de
inventar um lado.

E rejeitar é restaurar — pelo mesmo `UndoPlanner`, com as mesmas regras do desfazer do plano 04:
preserva o que foi alterado à mão, nunca escreve através de link, restaura atomicamente e grava na
trilha antes do disco ([backend/04](../../architecture/backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-25 — `GET /sessions/:sessionId/tools/:toolUseId/diff` ✅

Para Edit, MultiEdit e Write de uma sessão viva do chamador:

| Tool | Trechos | Arquivo inteiro |
|---|---|---|
| Edit | `old_string` → `new_string`, exato | antes = snapshot do turno; depois = disco, **se** o disco ainda tem o hash que a sessão deixou |
| MultiEdit | um trecho por edição, na ordem | idem |
| Write | — | antes = snapshot (ou `absent`, arquivo novo); depois = o `content` do input |

`before.state` diz o que se tem: `content`, `absent`, `unavailable` (não há snapshot intermediário,
com o motivo) ou `notRestorable` (acima do teto do snapshot). Recusas: `TOOL_USE_NOT_FOUND` (`404`),
`DIFF_NOT_APPLICABLE` (`422`) para tool que não escreve, `FORBIDDEN`/`SESSION_NOT_FOUND`, e o
`FILE_NOT_TEXT` do plano 07 para binário. A regra de montagem é domínio puro (`tool-diff`); o disco é
lido pelo mesmo adaptador de disco do desfazer (`NodeUndoDisk`), que já recusa link. Log com caminho e
tamanhos, nunca conteúdo.

### B-26 — `GET /sessions/:sessionId/changes` e o arquivo da alteração ✅

A lista de arquivos que a sessão viva — e as sessões anteriores da **mesma** conversa, continuada
in-place — criou, modificou ou apagou, com `+`/`−` e `modifiedOutside` (o disco não tem mais o hash que
a sessão deixou). `GET /sessions/:sessionId/changes/file?path=` devolve o antes da sessão (o snapshot do
primeiro turno que tocou o caminho), o agora (disco), os **trechos** com `hunkId` e a `revision` (hash
do disco no cálculo). Caminho que não é da sessão → `NOT_FOUND`; que virou link para fora →
`WORKSPACE_NOT_ALLOWED`, sem ler. Pedido durante uma escrita devolve um estado coerente: a leitura é de
um arquivo inteiro, antes ou depois do `rename` atômico.

Sessão encerrada não tem alterações por aqui — a mesma política do desfazer (ver "Não entra" no
[README](README.md#não-entra)).

### B-27 — Diff inline no chat e aba de diff no editor ✅

O card de Edit/Write/MultiEdit mostra o diff inline (pela B-25), recolhido acima de *n* linhas. "Abrir
diff" abre a **aba de diff** do editor do plano 07, na mesma aba de pasta — abrir de novo foca a mesma
aba. Falha ao carregar mostra o erro traduzido no card e deixa o resto da conversa.

### B-28 — A view "Alterações" da sessão, com aceitar ✅

Uma view por sessão (no painel e acessível da status bar e da palette): arquivos com ícone de
criado/modificado/apagado, `+`/`−`, e `modifiedOutside` com aviso de que rejeitar vai preservar o
arquivo. Clicar abre o diff contra antes da sessão na aba de diff. Atualiza a cada `turn.completed` e
`session.rewound`, como a prévia do desfazer ([menu de comandos e desfazer](../../architecture/web/04-state-and-data.md#menu-de-comandos-e-desfazer)).

**Aceitar** é marca de revisão (D-18): tira o arquivo da lista de pendentes, sobrevive a trocar de aba
e a recarregar (estado da aba de pasta), nunca escreve nada. Aceitar tudo; filtrar pendentes e
revisados. O desfazer por turno do plano 04 (`UndoPanel`) continua ali, ao lado.

### B-29 — O card de permissão mostra o diff antes de aprovar ✅

Para Edit/MultiEdit/Write pendentes, o card calcula a prévia **no cliente**: o input aplicado ao disco
**agora**, lido pela API de arquivos do plano 07 — sem mudar o `permission.requested` nem o app (D-03).
`old_string` que não casa com o disco → a prévia diz que a edição não vai casar, sem inventar diff.
Arquivo grande ou binário → prévia indisponível com o motivo, e o input exato continua à vista, que é a
regra da tela de permissão. A prévia diz contra que momento foi calculada e é relida ao ganhar foco
(R-06). Em modo "aceitar edições" não há card — e o seletor de modo avisa isso (B-36).

### B-30 — Rejeitar um arquivo ✅

`session.rewindFiles { sessionId, promptId, paths }` (D-08): o `promptId` é o do primeiro turno da
sessão que tocou o caminho, e `paths` restringe o alcance. É o mesmo cálculo do desfazer: igual ao que
a sessão deixou → restaura; alterado depois → preserva (`modifiedOutside`); link → recusa; trilha
indisponível → nada tocado (`INTERNAL_ERROR`); turno em execução → `SESSION_LOCKED`; caminho que a
sessão não tocou → `INVALID_INPUT`. Rejeitar duas vezes devolve `unchanged`. O campo `paths` e o
comando da B-31 já estão no contrato desde a [B-02](F0-contract.md), nas três pontas.

### B-31 — Rejeitar um trecho, e desfazer a rejeição ✅

`session.rejectChange { sessionId, path, hunkId, revision }` (D-08). Só quando o disco ainda tem o
hash que a sessão deixou — senão o arquivo é `modifiedOutside` e só se rejeita inteiro, preservando. A
`revision` é conferida antes de escrever: mudou → `SESSION_CHANGE_STALE` (`409`) e a tela recarrega os
trechos. Restaurar o trecho é escrever o arquivo com aquele trecho de volta ao snapshot, atômico, com a
trilha gravada antes (`session.filesRewound`, com `details` dizendo arquivo e trecho — sem conteúdo); a
linha de base passa a ser o que a rejeição deixou, como o desfazer já faz. Rejeitar o último trecho de
um arquivo que a sessão criou o apaga. Reenvio do mesmo `hunkId` com a mesma `revision` escreve uma vez.

**Desfazer em vez de confirmar:** a rejeição guarda o conteúdo que substituiu e oferece desfazer (toast
do [plano 06](../06-workbench/README.md)) enquanto o arquivo não mudar de novo. Confirmação só para
"rejeitar tudo".

---

## Cenários cobertos

S-103…S-144.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
