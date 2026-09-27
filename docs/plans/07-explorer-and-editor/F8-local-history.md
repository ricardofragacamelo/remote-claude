# F8 — Histórico local

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F7](F7-previews-and-transfer.md).
**Entrega:** o histórico local do VS Code ("Local History" / Linha do tempo): cada escrita humana que
perde conteúdo guarda antes a versão anterior, num store nosso com teto e purga; comparar e restaurar
qualquer versão; e apagar deixa de pedir confirmação para o que cabe no histórico — vira um aviso com
**Desfazer**.

## Por quê

É a rede de segurança do humano, como o desfazer do
[ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)
é a das escritas do Claude — e o que permite trocar a confirmação do apagar por um desfazer, que é o
princípio do produto. Vem por último porque muda o comportamento do apagar da F2 e da F4, e porque
guarda cópia de conteúdo humano no backend, o que pede registro na ADR-015
([D-17](decisions.md#d-17--o-histórico-local)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-55 — O contrato do histórico, e a ADR 🔲

No `backend/03` (seção `files`): `GET /files/history?folder=&path=` (versões de um arquivo, mais novas
primeiro, com cursor), `GET /files/history?folder=&deleted=true` (apagados recentemente),
`GET /files/history/:entryId/content` e `POST /files/history/:entryId/restore` (com `If-Match` do
atual; `412`, `409`, `404`). Código novo `HISTORY_ENTRY_NOT_FOUND` (404) com chaves; `file.restored`
no CHECK da trilha (migration versionada nova). Na ADR-015, a seção do histórico: o backend passa a
guardar cópia de conteúdo humano, com teto, retenção, quem vê e por quê. No
[backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai), a
tabela nova e a razão de o conteúdo ficar em blob no disco.

### B-56 — O store 🔲

Pela [D-17](decisions.md#d-17--o-histórico-local): tabela `file_history_entries` (pasta, caminho,
hash, tamanho, motivo, quem, quando — nenhuma coluna de conteúdo) e blobs no disco do backend
**endereçados por hash** (o mesmo conteúdo guardado dez vezes é um blob). Teto por arquivo, total e
por idade, configurados; arquivo acima do teto de snapshot não entra, e a entrada diz por quê. A purga
é um job interno no molde do `SnapshotPurgeJob` do desfazer, sob advisory lock (duas purgas não
perdem nem duplicam), e nunca apaga blob que outra entrada ainda usa.

### B-57 — Guardar antes de sobrescrever 🔲

A escrita da F2 ganha um passo **antes** do disco: salvar, apagar, mover por cima, restaurar e upload
com substituição guardam a versão que vai ser perdida. A falha do histórico **não** impede salvar
(`warn`, e a aba diz "esta versão não entrou no histórico"), mas faz o apagar voltar ao segundo passo
definitivo da [D-06](decisions.md#d-06--apagar-definitivo-ou-lixeira) — nunca apaga achando que tem
volta. Escrita do Claude não entra: já tem o store do desfazer da sessão.

### B-58 — Restaurar, e desfazer o apagar 🔲

Restaurar é uma escrita comum: `If-Match` do atual (412 se mudou — inclusive pelo Claude), a versão
atual guardada antes, `file.restored` na trilha antes do disco; restaurar duas vezes a mesma entrada
não escreve na segunda. Restaurar arquivo apagado o recria no caminho (409 se o caminho já foi
ocupado). Na web, apagar o que cabe no histórico deixa de abrir o diálogo: o aviso do centro de
notificações do plano 06 traz **Desfazer**, que restaura todos os itens do lote; o que não cabe
continua com a contagem e o segundo passo.

### B-59 — A Linha do tempo 🔲

Uma seção "Linha do tempo" no Explorer para o arquivo ativo: versões com motivo, autor e quando,
mais novas primeiro, paginadas e filtráveis por motivo; comparar uma versão com o atual (aba de diff)
ou com outra; restaurar, com confirmação só quando há buffer sujo. "Apagados recentemente" na pasta
alcança o histórico de arquivo que não existe mais. Arquivo sem histórico mostra um vazio que explica
quando o histórico nasce. É só o histórico local — o git ficou fora dos planos por decisão do usuário
de 2026-09-26.

### B-60 — Usabilidade e ajuda da Linha do tempo 🔲

Ajuda em en e pt-BR: o que é guardado e o que não é (escrita do Claude), o teto e a retenção, e que
isto **não** é git nem o desfazer do Claude — três coisas que o usuário confunde se ninguém disser.
Teclado, atalhos na palette e axe sem violação.

### B-61 — E2e do histórico local 🔲

Salvar três vezes → três versões → comparar → restaurar; apagar arquivo → aviso com Desfazer → o
arquivo volta, e a Auditoria mostra os dois fatos; restaurar com o arquivo mudado pelo Claude
roteirizado → conflito.

---

## Cenários cobertos

S-328…S-355.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
