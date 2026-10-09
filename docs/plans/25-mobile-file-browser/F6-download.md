# F6 — Download

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-text-viewer.md). As decisões da fase ([D-13, D-14](decisions.md#f6--download))
estão tomadas.
**Entrega:** um arquivo baixa pelo leitor ou pelo toque longo no painel, em stream para um
temporário, com progresso e cancelar, e vai para onde a pessoa escolher no "salvar como" do sistema.
Nenhum envio existe.

Leia antes: [mobile/04](../../architecture/mobile/04-ui.md) e
[07 · D-16](../07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos)
(download sem token na URL, e os tetos).

F4, F5 e F6 dependem só da F3, e podem correr em qualquer ordem entre si.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-26 — O "salvar como" ✅

`data/ports/file_saver.dart`, a porta, e um canal próprio `remote_claude/save`
([D-14](decisions.md#f6--download)), no padrão do `remote_claude/push`: no Android,
`ACTION_CREATE_DOCUMENT` (Storage Access Framework) com o nome e o tipo, copiando o temporário para a
URI escolhida; no iOS, o `UIDocumentPickerViewController` em modo de exportação. Devolve salvo,
cancelado ou falha. Sem permissão de armazenamento em nenhuma versão. O lado Android com teste de JVM
(S-120); o iOS fica como o resto do iOS do app ([mobile/06](../../architecture/mobile/06-testing.md)).

Como ficou: a porta em `domain/ports/file_saver.dart` ([D-27](decisions.md#f4--markdown-e-mermaid)), o
adaptador `data/engines/channel_file_saver.dart`, com as duas bordas no log (`LogOp.filesSave`: nome e
tipo, nunca o arquivo). No Android, `save/SaveChannel.kt` abre o `ACTION_CREATE_DOCUMENT` por
`startActivityForResult` e recebe a resposta no `onActivityResult` da `MainActivity` — o mesmo caminho
da resposta de permissão do canal de push, sem dependência nova ([D-30](decisions.md#f6--download));
`save/SaveRequest.kt` (nome seguro, tipo, cópia) tem o teste de JVM. No iOS, o canal mora no
`AppDelegate.swift`, para o projeto do Xcode não precisar de arquivo novo.

### B-27 — O fluxo ✅

`GET /files/raw?download=true` com Bearer, gravado **em stream** num arquivo temporário do app
(`Dio.download` e `path_provider`, que passa a dependência direta), com progresso e cancelar; depois o
"salvar como"; e o temporário apagado em todo desfecho — salvo, cancelado, erro. O teto de
`/files/limits` (200 MB) é conferido antes de começar. Um `401` no meio renova uma vez e retoma com
`Range` do que já chegou (R-09). Downloads simultâneos têm temporário e progresso próprios. A trilha
`file.downloaded` é do backend, sem mudança.

Como ficou ([D-29](decisions.md#f6--download)): `ApiClient.download` grava pelo `Dio.download`
(`deleteOnError: false`), com o `ETag` lido antes do primeiro byte; a retomada é **uma**, com
`Range: bytes=N-` e `If-Match` do mesmo `ETag`, **sem** `download=true` — a trilha guarda um registro por
download —, e passa pelo `AuthInterceptor`, que renova no `401`. O caso de uso `DownloadFile` confere o
teto, cria o temporário (`TemporaryFiles`: uma pasta `download-…` por download), baixa, oferece ao
"salvar como" e descarta o temporário em todo desfecho. O `DownloadsController` guarda as tarefas, cada
uma com o seu número, progresso e cancelar.

### B-28 — As entradas ✅

**Baixar** na barra do leitor, nos estados "sem prévia", "codificação", "grande demais", "PDF
corrompido" e "protegido por senha", e na folha do toque longo da [B-12](F2-panel.md#b-12--ações-do-item-)
e nas ações de `Semantics` da linha. O progresso com "cancelar", anunciado ao leitor de tela. Pasta
não tem baixar ([D-13](decisions.md#f6--download)).

Como ficou: o ícone `download` na barra do leitor; **baixar** em `FileRefusal` para `FILE_NOT_TEXT` e
`FILE_TOO_LARGE`, nos estados do PDF (corrompido, protegido, não é PDF) e na imagem que não é imagem; a
folha do toque longo e a ação de `Semantics` só para arquivo que abre. A faixa (`DownloadsStrip`, no
leitor e no painel) é uma `TextStrip` — região viva — com a barra e "cancelar o download"; o fim é um
snack bar: baixado, ou por quê, com "tentar de novo" onde pedir de novo muda a resposta. Cancelar não
diz nada (S-124).

---

## Cenários cobertos

S-119…S-134.

---

## Critério de conclusão

```bash
pnpm verify
```
