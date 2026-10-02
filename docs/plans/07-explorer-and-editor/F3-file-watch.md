# F3 — Observação de mudanças

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-file-write.md) — a origem `user` casa com as escritas dela, e a `claude` com o
evento que a B-18 publica.
**Entrega:** o backend assiste a pasta aberta e avisa, pelo stream `workspace.filesChanged`, o que
mudou e quem mudou — com exclusões, coalescência, teto, refcount por pasta e liberação garantida.

## Por quê

Sem isto, o editor mostra a versão que o Claude acabou de substituir, e o usuário só descobre ao
salvar (412). Com isto mal feito, o backend esgota o inotify da máquina inteira — e o VS Code do
usuário, que disputa o mesmo limite, para de ver mudanças. Por isso a fase começa medindo.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-19 — Medir e escolher o watcher ✅

O spike da [D-08](decisions.md#d-08--a-implementação-do-watcher): `fs.watch` recursivo, `chokidar` e
`@parcel/watcher` num clone deste repositório com `pnpm install` feito, contando watches consumidos e
tempo de subida, e baixando `max_user_watches` de propósito para ver o que cada um faz no limite. O
resultado vai para a D-08, com os números; o critério é "diretório não assistido (D-10) não consome
watch" e "no limite, erro explícito". O script do spike fica em `scripts/` se for rodado de novo
(regra 10 do [AGENTS.md](../../../AGENTS.md)).

**Feito (2026-10-01):** `scripts/watcher-spike.mjs`; escolhido o `chokidar` v5 — os números estão na
[D-08](decisions.md#d-08--a-implementação-do-watcher).

### B-20 — O adapter do watcher ✅

Port `FolderWatcher` e adapter da biblioteca escolhida. Não assiste `.git/` nem a lista de não
assistidos da [D-10](decisions.md#d-10--exclusões-padrão-e-teto-da-árvore) (`node_modules`…).
Coalescência numa janela curta: rajada no mesmo arquivo vira um `changed`; criado e apagado na janela
vira nada; rename vira `deleted` + `created` (sem rastrear identidade — a web não precisa). Mais
mudanças que o teto por evento → `overflow: true`, e o cliente recarrega. Limite do sistema esgotado
→ `WATCH_UNAVAILABLE`, nunca silêncio.

### B-21 — O registro de assinaturas ✅

Um watcher por `realpath` de pasta, com **refcount** de assinaturas; subpasta de pasta já assistida
reusa o watcher da mãe, entregando caminhos relativos à subpasta — é o caso das duas abas de pasta
`/r/app` e `/r/app/pkg`. Autorização no `watch` (allowlist, dono da raiz); teto de assinaturas por
connection (`WATCH_LIMIT_REACHED`); watch repetido na mesma connection devolve o mesmo `watchId`;
unwatch desconhecido é `ack`.

**Liberar é o requisito, não o detalhe** — vazamento aqui é recurso da máquina do usuário:

- unwatch, queda do socket, revogação do usuário ou do device, shutdown: toda saída passa pela mesma
  rotina, que decrementa e fecha o watcher na última;
- recarga da allowlist que tira a pasta → `workspace.watchStopped { reason: allowlistChanged }` e o
  watcher sai; pasta apagada → `reason: folderDeleted`;
- mil ciclos watch/unwatch devolvem watchers, listeners e memória ao inicial (S-145) — e a tela de
  saúde do [plano 18](../18-logs-and-diagnostics/README.md) lê a contagem de watchers abertos daqui.

### B-22 — Quem mudou: a origem ✅

Função pura: caminho + hash que casam com um `session.fileStateRecorded` recente → `claude`; com uma
escrita nossa recente (registro de curta duração alimentado pela F2) → `user`; senão `external`.
Escritas do Claude e do humano no mesmo arquivo dentro da janela → vale o hash final, nunca uma
origem inventada. A origem é **rótulo para a UI** ("o Claude alterou este arquivo"), opcional no
contrato, e não decide nada — nem segurança, nem conflito, que é sempre o `ETag`.

### B-23 — O handler e o stream ✅

`adapter/inbound/ws/files/`: traduz `workspace.watch`/`unwatch` nos use cases, e publica pelo fan-out
existente ([backend/06](../../architecture/backend/06-realtime.md#fan-out)) com `seq` **por `watchId`**,
começando em 1, sem ring buffer e sem replay ([D-07](decisions.md#d-07--o-transporte-da-mudança-e-o-seq-do-stream)).
Connection lenta que estoura a fila recebe `overflow` e não segura o watcher das outras. Log
`files.watch` em debug com pasta, contagem e `watchId` — nunca conteúdo.

---

## Cenários cobertos

S-128…S-156.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
