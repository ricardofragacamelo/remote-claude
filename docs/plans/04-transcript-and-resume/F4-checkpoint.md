# F4 — Desfazer

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-commands.md).
**Entrega:** desfazer o que uma sessão escreveu em disco, com alcance explícito e registro.

---

## Por que isso existe

Aprovar um `Write` pelo celular, no ônibus, é uma decisão tomada com menos contexto do que a
mesma decisão no desktop. **O desfazer é o que torna esse risco aceitável.**

E é, ele próprio, uma operação que **mexe no disco do usuário** — logo: alcance visível,
recusa durante turno, e auditoria.

## O mecanismo é nosso, e por quê

O caminho óbvio era `rewindFiles()` do SDK. Dois fatos medidos o descartam
([D-06](decisions.md#d-06--desfazer-sem-destruir)):

1. ele **sobrescreve em silêncio** alteração que o usuário fez à mão depois do checkpoint, e o
   `dryRun` reporta isso como um reverte trivial;
2. ele **não aceita filtro de arquivo** — uma chamada reverte todos os divergentes do
   checkpoint. "Preservar o que o usuário editou e reverter o resto" não é implementável sobre
   essa API.

Então o store é nosso: snapshot do conteúdo anterior por turno, revert **arquivo por arquivo**.
`enableFileCheckpointing: true` continua ligado — é o `/rewind` do próprio usuário no editor —,
mas deixa de ser o nosso mecanismo.

A linha de base e os snapshots vêm da [B-46](../01-live-session/F3-audit.md) e da
[B-47](../01-live-session/F3-audit.md) do plano 01, gravadas desde a primeira sessão. Esta fase
**consome** esse registro; não o cria.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-18 — Comando de rewind no contrato 🔲

O desfazer exposto como comando WS, com o evento de resultado — que carrega **revertidos e
preservados**, não um booleano. Contrato muda nas três pontas na mesma entrega — é a regra dos
[gatilhos específicos](../../../AGENTS.md).

O alvo é o `prompt_id` de um turno, que é a chave do nosso checkpoint; não um uuid de mensagem
do transcript.

### B-19 — UI com alcance explícito 🔲

Antes de desfazer, a tela diz **quais arquivos** voltam, **quais ficam** e **para qual ponto**.
Confirmação sem lista é confirmação sem informação.

A lista é **diff nosso**, entre o snapshot e o conteúdo atual — e é o que permite separar, na
própria tela, o que a sessão escreveu do que o usuário editou depois. O ponto de desfazer é
rotulado pelo prompt do turno, que o hook `UserPromptSubmit` guardou.

### B-20 — Rewind é auditado 🔲

Entra em `audit` com a lista de arquivos e o ponto de destino. Alteração em disco que não
deixa rastro é exatamente o que a trilha existe para impedir.

### B-21 — Limites do rewind 🔲

Só alcança o que **aquela sessão** tocou; sessão fechada não desfaz; durante um turno em
execução é recusado com `SESSION_LOCKED`. Falha no meio não deixa estado parcial silencioso —
erro claro, com o que foi e o que não foi revertido.

E o limite que o spike obrigou a criar: **arquivo alterado fora da sessão depois do checkpoint é
preservado**, porque o SDK o sobrescreveria em silêncio ([D-06](decisions.md#d-06--desfazer-sem-destruir)).
O resultado carrega revertidos e preservados, com motivo.

Sessão sem linha de base não impede o desfazer: ela o torna conservador, e a UI diz por quê.

E três requisitos que passaram a ser **nossos** no momento em que o revert deixou de ser do SDK:

| Requisito | Por quê |
|---|---|
| Recusar caminho que virou symlink, hard link ou arquivo não regular, e caminho cujo diretório-pai deixou de resolver | era o `skippedLinks` do SDK; sem essa checagem, restaurar é um caminho para escrever fora do workspace |
| Restauração **atômica** por arquivo — temporário no mesmo diretório, depois `rename` | falha no meio deixando arquivo truncado é pior que não ter revertido |
| Teto e purga do store de snapshots | referência: o store do CLI ocupa 6,6 MB para 54 sessões — pequeno, e pequeno sem teto continua crescendo |

"Sessão fechada não desfaz" continua valendo, mas agora é **política e não limitação**: o store
é nosso, e não exige sessão viva como o `rewindFiles()` exigia.

---

## Cenários cobertos

S-37…S-45, S-61…S-67.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
