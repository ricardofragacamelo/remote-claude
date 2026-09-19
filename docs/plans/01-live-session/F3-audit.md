# F3 — Auditoria

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-session-runtime.md).
**Entrega:** o módulo `audit` gravando, de forma append-only, **toda** invocação de tool — não
só as que pedem humano.

---

## Por que antes da permissão

Porque a ordem inversa é uma armadilha conhecida: com o `canUseTool` pronto, é natural
pendurar a trilha nele — e aí **toda leitura de arquivo e todo comando auto-aprovado ficam de
fora**. Foi medido: 6 tool calls → 6 hooks `PreToolUse` → 2 `canUseTool`
([descoberta §7.3](../../discovery/01-descoberta-claude-agent-sdk.md#73--canusetool-não-é-chamado-para-toda-tool)).

Entregando a trilha primeiro, o `canUseTool` chega ao mundo já no seu papel: **aprovação**,
não registro.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-21 — Domínio `audit` ✅

Registro imutável com `who`, `what`, `when`, `where` (device/IP), o `input` **exato** da tool e
a `decision` — [backend/03](../../architecture/backend/03-modules.md#audit).

Sem update, sem delete: a entidade não tem setter, e o repositório não expõe operação que não
seja escrita ou leitura.

### B-22 — Tabela append-only e migration ✅

O append-only é garantido **no banco**, não só na intenção do código: uma trigger na tabela
aborta a escrita destrutiva para **quem quer que** esteja conectado
([D-06](decisions.md#d-06--append-only-de-verdade)) — sem papel restrito e sem segunda conexão.

`UPDATE` aborta sempre. `DELETE` aborta **dentro do piso de 90 dias**, e só fora dele é
permitido: é assim que a purga do
[plano 03](../03-rules-and-audit/decisions.md#d-08--quem-pode-apagar-a-trilha-append-only) tem por
onde passar sem que o piso de retenção dependa de o código se comportar.

Trilha que o próprio sistema pode reescrever não é trilha.

A tabela nasce com uma coluna sequencial própria (`seq bigint`, gerada pelo banco), que é a
ordenação estável da consulta paginada do
[plano 03](../03-rules-and-audit/decisions.md#d-06--paginar-sobre-o-tempo) — `at` filtra, `seq`
ordena. Ela nasce **aqui** porque acrescentar coluna depois é mexer numa tabela que esta fase
protege contra alteração; agora custa uma linha de DDL.

### B-23 — Hook `PreToolUse` ligado ao módulo ✅

`adapter/outbound/claude/audit-hook.ts`: registra e **deixa passar** (`{ continue: true }`).
Ele não decide — decisão é do `canUseTool`, e confundir os dois é o buraco que esta fase
existe para fechar.

O hook é `audit` write-only para os outros módulos: todo mundo escreve, ninguém lê de dentro
do fluxo.

### B-24 — Falha de escrita bloqueia a autorização ✅

Sem trilha, não autoriza. A falha é `error` no log e chega à UI como evento de erro — falha
silenciosa aqui significaria execução sem registro, que é exatamente o que não pode acontecer
num sistema que roda `Bash` na máquina do usuário.

### B-46 — `PostToolUse`: o estado em que a sessão deixou cada arquivo ✅

Entrou depois, e por um motivo externo a esta fase: o
[D-06 do plano 04](../04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir) mediu
que `rewindFiles()` **sobrescreve em silêncio** alteração que o usuário fez à mão, e que o
`dryRun` do SDK não denuncia isso. A única forma de distinguir "como a sessão deixou o arquivo"
de "alterado depois" é termos registrado o primeiro — e quem registra é um hook, aqui, desde a
primeira sessão. Registrar só quando o plano 04 chegar seria registrar tarde: o desfazer
precisaria julgar sessões para as quais não existe linha de base.

Segundo hook em `adapter/outbound/claude/`, irmão do `audit-hook` da B-23 e com a mesma regra de
não decidir nada: para tool que escreve em arquivo, grava `sessionId`, caminho, hash e mtime do
resultado.

| Regra | Por quê |
|---|---|
| **Não** é a tabela de auditoria | esta linha é sobrescrita a cada escrita no mesmo arquivo, e a trigger da B-22 aborta `UPDATE` — misturar as duas quebraria o append-only ou o registro |
| Tabela própria, dona é `session` | é "o que esta sessão fez ao disco", com o ciclo de vida da sessão; `audit` continua write-only e imutável |
| `PostToolUse`, não `PreToolUse` | o hash só existe **depois** da escrita; o `PreToolUse` da B-23 registra a intenção, este registra o resultado |
| `PostToolUseFailure` **não** atualiza o estado | tool que falhou não mudou o arquivo, e gravar o hash aí criaria uma linha de base falsa |
| Falha aqui **não** bloqueia a autorização | ao contrário da B-24: sem trilha não se autoriza, mas sem linha de base o desfazer só fica mais conservador — e degradar para "mais conservador" é aceitável, para "sem registro" não |

Isso também fecha um furo da promessa desta fase: com só o `PreToolUse`, a trilha diz o que foi
**pedido** e nunca o que **resultou** — para um `Write`, ela não responde o que de fato foi
escrito.

> **Alternativa não escolhida, e por que:** existe o hook `FileChanged`
> (`file_path`, `event: 'change' | 'add' | 'unlink'`), que notificaria alteração externa em vez
> de exigir comparação depois. Ele não diz **quem** alterou, e o comportamento do watcher não foi
> verificado por spike — então entra como complemento possível da B-46, nunca como substituto.
> Trocar o mecanismo pela assinatura do tipo é o erro que o spike do D-06 acabou de expor.

### B-47 — O store de checkpoint: o conteúdo anterior, por turno ✅

A B-46 grava **como a sessão deixou** o arquivo. Para desfazer é preciso o outro lado: **como o
arquivo estava antes**. E ele não pode vir do store do CLI — o
[D-06 do plano 04](../04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir) mediu
que `rewindFiles()` não aceita filtro de arquivo, então reverter *alguns* arquivos e preservar
outros só existe se o snapshot for nosso.

| Hook | O que guarda |
|---|---|
| `UserPromptSubmit` | abre o checkpoint do turno — `prompt_id` e o texto do prompt, que é o rótulo do ponto de desfazer na UI |
| `PreToolUse` | na **primeira** vez que o turno toca um caminho, o conteúdo anterior — ou a marca "ausente", para o desfazer poder apagar arquivo que o turno criou |

A chave é `(session_id, prompt_id, path)`. O `prompt_id` vem do `BaseHookInput` em todo hook —
"UUID correlating a user prompt with all subsequent events until the next prompt" —, então o
turno a que um snapshot pertence é sabido **sem ler o transcript**.

| Regra | Por quê |
|---|---|
| Só o **primeiro** toque do turno num caminho gera snapshot | o segundo sobrescreveria o estado anterior pelo intermediário, e o ponto de desfazer é o início do turno |
| Arquivo acima do limite de tamanho **não** é snapshotado, e isso fica registrado | snapshot de arquivo enorme enche o disco do usuário; e o desfazer precisa saber que não pode prometer aquele arquivo |
| Teto e purga, com a purga nunca alcançando sessão viva | referência: o store do CLI ocupa 6,6 MB para 54 sessões — pequeno, e pequeno sem teto continua crescendo |
| Mesma tabela **não**, mesma fase sim | é o par da B-46: um hook grava o antes, o outro o depois, e os dois vivem no mesmo lugar do código |

**Por que aqui e não no plano 04:** os hooks são montados pelo `sdk-options.factory` da
[B-13](F2-session-runtime.md), e o snapshot tem de existir desde a primeira sessão — se começar
a valer quando o plano 04 chegar, o desfazer nasce cego para tudo que rodou antes dele.

---

## Cenários cobertos

S-40…S-49, S-99…S-108.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
