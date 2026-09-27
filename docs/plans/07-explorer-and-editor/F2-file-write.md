# F2 — Escrita de arquivos

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-file-read.md).
**Entrega:** o backend salva, cria, renomeia, move, copia e apaga dentro da pasta aberta — atômico,
sem sobrescrever o que o Claude escreveu, sem sobrescrever destino, com a trilha **antes** do disco —
e a escrita humana convive com o desfazer da sessão viva.

## Por quê

É a fase onde o produto passa a poder **perder trabalho** do usuário. Cada task tem um cenário de
perda que precisa estar escrito antes: o save que apaga a escrita do Claude (S-64), o arquivo
truncado por falha no meio (S-69), o move que sobrescreve em silêncio (S-91), a pasta apagada que
tinha um arquivo novo (S-110).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-11 — Salvar: atômico, com `If-Match` 🔲

`PUT /files/content` pela [D-03](decisions.md#d-03--a-semântica-de-concorrência): sem `If-Match` (ou
com `*`) → `428`; hash atual diferente → `412` com o `ETag` atual — inclusive quando o arquivo foi
apagado, que nunca é recriado em silêncio; **mas** hash atual igual ao hash do corpo → `200` sem
escrever (o reenvio depois de resposta perdida, S-66).

A escrita é a mesma do desfazer ([backend/04](../../architecture/backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso)):
temporário no **mesmo diretório** do alvo real (com prefixo reconhecível, `.<nome>.rc-<ulid>.tmp`),
`fsync`, modo do original preservado, conferência do caminho real do descritor do temporário, nova
conferência do hash imediatamente antes, e `rename`. Temporário órfão de um processo que morreu sai
na próxima escrita naquele diretório. O servidor **não** normaliza fim de linha; grava o BOM se o
cliente o pediu e no `encoding` em que o arquivo foi aberto (`422` `FILE_NOT_ENCODABLE` se o conteúdo
não cabe). Symlink interno: escreve no alvo, o link fica. Hard link: pela
[D-05](decisions.md#d-05--symlinks-e-hard-links), sem quebrá-lo em silêncio. Disco cheio → `507`
`STORAGE_FULL`, original intacto, temporário removido.

Arquivo sensível ([D-15](decisions.md#d-15--arquivos-que-mudam-a-permissão)) — `.claude/settings.json`,
`.claude/settings.local.json`, `.mcp.json`, lista pura no domínio — exige `confirmSensitive: true`,
senão `428` (`reason: sensitiveFile`); o fato na trilha leva `sensitive: true`.

O use case de escrita é **exportado** pelo módulo: o substituir em lote do plano 09 e a edição de
`CLAUDE.md` do plano 11 escrevem por ele, e herdam `ETag`, trilha e atomicidade.

### B-12 — Criar arquivo e pasta 🔲

`POST /files { folder, path, kind, content?, encoding? }`: `O_EXCL` no disco — dois creates juntos,
um `201` e um `409` —, pais intermediários criados (`a/b/c.ts`), `201` com `Location` e `ETag`. O
`content` inicial é o que permite "novo a partir de modelo" e "salvar como" sem rota nova: o servidor
não sabe que era um modelo, e não precisa ([D-19](decisions.md#d-19--de-onde-vêm-os-modelos)). Nome
vazio, `.`, `..`, NUL ou segmento acima de 255 bytes → `400` com todos os motivos. O `409` carrega o
`ETag` do existente: é por ele que a web reconhece o próprio reenvio.

### B-13 — Renomear e mover 🔲

`POST /files/move { folder, from, to, ifMatch? }`, **sem sobrescrever** pela
[D-12](decisions.md#d-12--mover-sem-sobrescrever) — o `rename` do Linux sobrescreve em silêncio, e é
exatamente o defeito a evitar. Recusa mover para dentro de si mesmo, mover a própria pasta aberta,
destino fora da pasta (`403`) e `EXDEV` (`422`, `reason: crossDevice` — nunca cópia + remoção
implícita). Renomear só a caixa funciona. `If-Match` opcional: a web o manda quando tem o `ETag` (a
aba aberta), e é o que torna seguro o "desfazer renomear" da B-27.

### B-14 — Copiar e duplicar 🔲

`POST /files/copy { folder, from, to }`: arquivo e pasta recursiva; symlink é copiado **como link**,
nunca seguido; destino existente → `409`; pasta acima do teto de cópia (entradas ou bytes) é recusada
**antes** de começar; falha no meio remove o destino parcial. "Duplicar" é a web escolhendo o nome
(`nome copy.ext`, `nome copy 2.ext`) por uma função pura.

### B-15 — Apagar 🔲

`DELETE /files?folder=&path=`. Pela [D-06](decisions.md#d-06--apagar-definitivo-ou-lixeira), até a
F8: pasta não vazia sem `recursive` → `409` `DIRECTORY_NOT_EMPTY` com a contagem (capada); com
`recursive&expectedEntries=n` e a contagem mudou → `412`, nada apagado. Apagar symlink apaga o link —
o alvo, mesmo fora da pasta, fica —, e o recursivo não atravessa link. A própria pasta aberta não se
apaga por aqui. O que não existe é `404`, que a web trata como feito quando é o reenvio dela.

### B-16 — A escrita humana na trilha 🔲

Pela [D-02](decisions.md#d-02--a-escrita-humana-na-trilha): migration versionada nova acrescentando
ao CHECK de `audit_events.kind` os `file.created`, `file.written`, `file.moved`, `file.copied`,
`file.deleted` e `file.failed` — sem tocar na `0013` ([migrations](../../architecture/backend/05-persistence.md#migrations)).
`subject_id` é o caminho real, `subject_label` o relativo; `details` leva tamanho, hash antes/depois,
origem/destino, contagem, `sensitive` — **nunca conteúdo**. Gravado antes do disco; trilha
indisponível → `503` `SERVICE_UNAVAILABLE` com `Retry-After`, e nada no disco; disco que falha depois
do registro → `file.failed` apontando o primeiro. Reenvio idempotente (S-66) não grava segundo fato.

### B-17 — Ler os fatos de arquivo 🔲

Pela [D-13](decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha): `GET /audit-events` no
`AuditQueryModule`, filtrado sempre por quem pergunta, `kind` por prefixo, cursor keyset por `seq`
descendente — a mesma disciplina de `GET /audit-entries` ([backend/03](../../architecture/backend/03-modules.md#audit)).
Documentado no `backend/03`. O redesenho da tela é do [plano 12](../12-audit-explained/README.md); se
ele chegar antes, esta task vira consumo do endpoint dele.

### B-18 — A escrita humana e a sessão viva 🔲

Duas coisas, uma razão cada:

- **o desfazer preserva o humano.** Nada a mudar no `session`: a escrita humana muda o hash, o
  `session_file_states` diverge, e o desfazer do turno preserva (`modifiedOutside`). O que nasce aqui
  é o **cenário** que prova isso entre os dois módulos (S-124), para ninguém "otimizar" a linha de
  base depois;
- **a trava por caminho.** O save do humano e a restauração do desfazer rodam no mesmo processo e
  escrevem por `rename`: uma trava em memória por `realpath`, fornecida pela infraestrutura e
  injetada por porta nos dois módulos, serializa as duas — o disco termina com uma versão inteira, e
  o `ETag` diz qual. Processos externos (o CLI do Claude escreve direto no disco) não passam por ela;
  a janela residual está em R-01.

E o fio para a origem da F3: o hook `PostToolUse` publica `session.fileStateRecorded { path, hash }`
por `EventEmitter2` ([comunicação assíncrona](../../architecture/backend/03-modules.md#comunicação-assíncrona)),
e o `files` o escuta sem importar `session`.

---

## Cenários cobertos

S-62…S-127.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
