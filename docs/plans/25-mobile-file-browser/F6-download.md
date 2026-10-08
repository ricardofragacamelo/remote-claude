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

### B-26 — O "salvar como" 🔲

`data/ports/file_saver.dart`, a porta, e um canal próprio `remote_claude/save`
([D-14](decisions.md#f6--download)), no padrão do `remote_claude/push`: no Android,
`ACTION_CREATE_DOCUMENT` (Storage Access Framework) com o nome e o tipo, copiando o temporário para a
URI escolhida; no iOS, o `UIDocumentPickerViewController` em modo de exportação. Devolve salvo,
cancelado ou falha. Sem permissão de armazenamento em nenhuma versão. O lado Android com teste de JVM
(S-120); o iOS fica como o resto do iOS do app ([mobile/06](../../architecture/mobile/06-testing.md)).

### B-27 — O fluxo 🔲

`GET /files/raw?download=true` com Bearer, gravado **em stream** num arquivo temporário do app
(`Dio.download` e `path_provider`, que passa a dependência direta), com progresso e cancelar; depois o
"salvar como"; e o temporário apagado em todo desfecho — salvo, cancelado, erro. O teto de
`/files/limits` (200 MB) é conferido antes de começar. Um `401` no meio renova uma vez e retoma com
`Range` do que já chegou (R-09). Downloads simultâneos têm temporário e progresso próprios. A trilha
`file.downloaded` é do backend, sem mudança.

### B-28 — As entradas 🔲

**Baixar** na barra do leitor, nos estados "sem prévia", "codificação", "grande demais", "PDF
corrompido" e "protegido por senha", e na folha do toque longo da [B-12](F2-panel.md#b-12--ações-do-item-)
e nas ações de `Semantics` da linha. O progresso com "cancelar", anunciado ao leitor de tela. Pasta
não tem baixar ([D-13](decisions.md#f6--download)).

---

## Cenários cobertos

S-119…S-134.

---

## Critério de conclusão

```bash
pnpm verify
```
