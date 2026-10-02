# Plano 07 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> As vinte foram respondidas pelo usuário em **2026-09-28**, uma a uma, e todas seguem a
> recomendação. Dezenove estão decididas; a D-08 tem o método decidido e a escolha pendente do spike
> B-19. As que dependem de medida (D-04, D-05, D-08, D-09, D-12, D-16) seguem dizendo o que medir, e
> a medida vai para esta página quando for feita — não para a memória de quem a fez. Onde ela pode
> mudar um número, o **Resultado** diz que o número é provisório.

---

## F0 — Contract

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | O explorer e o editor são um módulo novo (`files`) ou uma extensão do `workspace` | se `workspace` tem de ganhar escrita e conteúdo, ou se isso é linguagem de outro domínio | B-02 | 2026-09-28 · **módulo novo `files`**, decisão do usuário com a recomendação: `files → workspace` por porta (`FolderResolver`), `files → audit` escrevendo, nenhuma dependência de `session` — a origem `claude` chega por evento de domínio | ✅ |
| D-02 | A escrita humana pela web vai para a trilha: o quê, quando, e o que acontece se a trilha cai | se leitura humana também é auditada; o que fazer quando o disco falha **depois** do registro | B-01, B-16 | 2026-09-28 · **kinds `file.*` em `audit_events`, gravados antes do disco**, sem conteúdo; trilha fora → `503` `SERVICE_UNAVAILABLE` com `Retry-After` e nada no disco; falha do disco depois → `file.failed` apontando o primeiro; leitura fora da trilha (log `debug`), download dentro (`file.downloaded`). Decisão do usuário com a recomendação; ADR-015 (B-01) e doc 04 (B-03) registram | ✅ |
| D-03 | A semântica de concorrência entre o humano e o Claude no mesmo arquivo | se o validador é hash ou mtime; se `If-Match` é obrigatório em todo verbo; o que um reenvio depois de resposta perdida recebe | B-03, B-11 | 2026-09-28 · **`ETag` forte por sha256, `If-Match` obrigatório no `PUT`**, com os sete pontos da seção (`428` sem ou com `*`, `412` inclusive para apagado, `W/` nunca casa, reenvio idêntico → `200` sem escrita, `304` no `GET`, `If-Match` opcional em mover/apagar, criar com `O_EXCL` → `409`). Decisão do usuário com a recomendação | ✅ |
| D-07 | Como a mudança no disco chega à web (WS com assinatura vs polling), e qual `seq` o stream carrega | o envelope exige `seq` monotônico **por sessão**, e este stream não é de sessão | B-04, B-23 | 2026-09-28 · **WS com assinatura**: `workspace.watch` → `watchId`, `workspace.filesChanged` com `seq` monotônico por `watchId` a partir de 1, **sem replay** — reconexão refaz o `watch` e recarrega a árvore; o envelope passa a dizer "monotônico por stream" (B-04) e o plano 12 reusa. Decisão do usuário com a recomendação | ✅ |
| D-11 | A raiz do explorer é a pasta aberta, e a API recebe a pasta junto com o caminho | se a fronteira da escrita é a raiz da allowlist ou a pasta da aba | B-02, B-07 | 2026-09-28 · **`folder` (absoluto) + `path` relativo POSIX** em toda rota do `files`; `folder` pela regra do `ResolveWorkspaceUseCase`; `path` acima da pasta → `403`, mesmo dentro da raiz; o WS segue com `workspacePath`. Decisão do usuário com a recomendação; backend/03 registra que subpasta aberta é fronteira mais estreita | ✅ |

### D-01 — módulo novo ou extensão do workspace

`workspace` já resolve caminho contra a allowlist, e o explorer lista diretórios — a tentação é
acrescentar lá. Mas o catálogo de [backend/03](../../architecture/backend/03-modules.md#o-catálogo)
diz do `workspace` que ele **não** é responsável por "rodar nada dentro deles", e o que nasce aqui
é conteúdo, validador de versão, escrita atômica, criação, remoção e um watcher: linguagem própria
e invariantes próprias, que é o critério da seção "Criando um módulo novo" do mesmo documento.

| Opção | A favor | Contra |
|---|---|---|
| **Módulo `files`**, dependendo de `workspace` por porta | a fronteira de segurança (`workspace`) continua pequena e pura; o `files` cresce sem inflá-la; planos 08, 11 e 13 consomem o `files` sem tocar na allowlist | uma porta a mais (`FolderResolver`) |
| Estender `workspace` | nenhuma porta nova | mistura a primeira linha de defesa com I/O de conteúdo; o `workspace` passaria a escrever no disco, o que contradiz a própria definição |

**Recomendação:** módulo novo `files`, com `files → workspace` por porta (resolver a pasta), `files
→ audit` escrevendo, e **nenhuma** dependência de `session`: a origem `claude` de uma mudança chega
por evento de domínio (`session.fileStateRecorded`, B-18/B-22), não por import. É o que mantém o
diagrama de fronteiras sem ciclo.

### D-02 — a escrita humana na trilha

Até aqui a trilha registra o que o **Claude** fez (hook `PreToolUse`) e os fatos de conta
(`audit_events`). O humano escrevendo no disco pela web é um ator novo sobre a mesma máquina, e a
pergunta "quem mudou este arquivo?" passa a ter uma resposta que a trilha não sabe dar.

- **O quê:** `file.created`, `file.written`, `file.moved`, `file.copied`, `file.deleted` — e,
  nas fases deles, `file.downloaded` (F7) e `file.restored` (F8) —, em `audit_events`
  (kinds novos por migration versionada nova — [backend/05](../../architecture/backend/05-persistence.md#os-fatos-de-conta)),
  com caminho, tamanho, hash antes e depois, origem e destino de um move, contagem de um apagamento
  recursivo. **Nunca conteúdo** — é a mesma regra da `Read`
  ([backend/03](../../architecture/backend/03-modules.md#audit)).
- **Quando:** antes do disco, como o desfazer já faz (`session.filesRewound`). Trilha indisponível
  não escreve.
- **Com qual status:** o precedente do plano 04 é `INTERNAL_ERROR`, pelo WebSocket. Aqui é HTTP, e
  o [doc 04](../../architecture/shared/04-errors-and-http.md#erro-do-servidor) reserva `500` para
  bug nosso e `503` para "dependência fora" — que é o que um banco indisponível é.
- **Disco que falha depois do registro:** o fato gravado diz que a escrita foi tentada. Sem mais
  nada, a trilha afirmaria uma escrita que não houve.
- **Leitura humana:** não é auditada. O volume seria o de cada clique na árvore, e o que o humano lê
  na própria máquina não é o risco que a trilha existe para cobrir. Fica no log de I/O em `debug`,
  com caminho e bytes.

**Recomendação:** os kinds acima em `audit_events`, gravados antes do disco; trilha indisponível →
`503` `SERVICE_UNAVAILABLE` com `Retry-After` e **nada** no disco; falha do disco depois do
registro → um kind próprio, `file.failed`, que aponta o id do primeiro. Baixar arquivo ou pasta
é leitura, mas tira conteúdo da máquina — é o que a trilha existe para contar, e entra (`file.downloaded`). A leitura fica fora da
trilha, dito na ADR-015 (B-01). Registrar no doc 04 por que aqui é `503` e no desfazer é `500`,
para ninguém "corrigir" um pelo outro.

### D-03 — a semântica de concorrência

O Claude escreve no mesmo arquivo que o humano tem aberto. Sem controle de versão, o save do humano
apaga o trabalho do Claude em silêncio — ou o contrário.

| Opção | A favor | Contra |
|---|---|---|
| **`ETag` forte = sha256 dos bytes**, `If-Match` obrigatório no `PUT` | igualdade de conteúdo é o que importa; independe de relógio | hash custa ler o arquivo inteiro (ele já é lido, e há teto — D-04) |
| `ETag` por mtime+tamanho | barato | mtime tem granularidade e pode repetir em escritas no mesmo instante; o Claude reescreve com o mesmo tamanho |
| `If-Match` opcional | cliente mais simples | um cliente que esquece o cabeçalho sobrescreve às cegas — o defeito que o plano existe para impedir |

Detalhes que a opção escolhida precisa fixar:

- **`428` `PRECONDITION_REQUIRED`** para `PUT` sem `If-Match` — e para `If-Match: *`, que em HTTP
  significa "qualquer versão serve" e aqui seria o mesmo que não ter enviado;
- **`412` `FILE_CHANGED`** quando difere, **inclusive** quando o arquivo foi apagado (RFC 9110: sem
  representação atual, `If-Match` falha) — o save nunca recria em silêncio um arquivo que o Claude
  removeu; o `412` carrega o `ETag` atual;
- `ETag` fraco (`W/…`) nunca casa com comparação forte → `412`;
- **reenvio depois de resposta perdida:** o primeiro `PUT` escreveu; o segundo chega com o `If-Match`
  antigo e daria `412`, embora o disco já tenha o que ele quer. Se o hash atual é o hash do corpo
  enviado, a resposta é `200` com o `ETag` atual, sem escrita e sem segundo fato na trilha;
- `GET` aceita `If-None-Match` → `304`: revalidar abas ao reativar uma aba de pasta fica barato;
- mover e apagar aceitam `If-Match` **opcional** — a árvore não carrega hash, e exigir um obrigaria
  uma leitura por item;
- criar é "só se não existe", atômico no disco (`O_EXCL`) → `409` `FILE_EXISTS`.

**Recomendação:** `ETag` forte por sha256, com os sete pontos acima. É o que o
[doc 04](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) passa a listar para
`412` e `428` (B-03).

### D-07 — o transporte da mudança e o seq do stream

A árvore e as abas precisam saber quando o disco muda — o Claude escreve o tempo todo.

| Opção | A favor | Contra |
|---|---|---|
| **WS: `workspace.watch`/`unwatch`, evento `workspace.filesChanged`** | imediato; o socket já existe e já é autenticado; o fan-out existe | o envelope diz "`seq` monotônico **por sessão**", e isto não é sessão |
| Polling de `GET /files/tree` | nada de contrato novo | atraso de segundos e custo proporcional ao número de diretórios abertos; não diz **o quê** mudou |

Sobre o `seq`: o evento precisa de um (o envelope o exige de todo `event`), mas replay não serve
para árvore — o que importa depois de uma queda é o estado **atual** do disco, que uma recarga dá
melhor que mil eventos reencaminhados. O [plano 12](../12-integrated-terminal/README.md) tem o
mesmo problema com `seq` por terminal.

**Recomendação:** WS com assinatura. `workspace.watch` responde com um `watchId`; o `seq` é
monotônico **por `watchId`**, começando em 1; **sem replay** — reconexão refaz o `watch` (novo
`watchId`, `seq` do 1) e recarrega a árvore. O [contrato](../../architecture/shared/05-websocket-protocol.md#envelope)
passa a dizer "monotônico **por stream** — uma sessão, ou uma assinatura", uma vez, e o plano 12
reusa a regra em vez de escrever a sua (B-04).

### D-11 — a raiz do explorer é a pasta aberta

O esboço do roteiro dos planos 06–13 descrevia `GET /files/tree?path=` — só o caminho. Mas a ADR-015 diz que a
fronteira da escrita é "allowlist **+ pasta aberta**", e o cliente não é quem garante fronteira.

| Opção | A favor | Contra |
|---|---|---|
| **`folder` (absoluto, a pasta da aba) + `path` (relativo a ela)** em toda rota | o servidor confere as duas coisas; o explorer não sobe acima da pasta; `path` relativo não carrega caminho da máquina em cada resposta | dois parâmetros |
| Só `path` absoluto, conferido contra a allowlist | um parâmetro | a pasta aberta vira convenção da UI; um `path` para a raiz vizinha, dentro da mesma raiz da allowlist, seria aceito |

**Recomendação:** `folder` + `path` relativo (POSIX, `''` é a própria pasta) em todas as rotas do
`files`; `folder` passa pela mesma regra do `ResolveWorkspaceUseCase`; `path` que sobe acima da
pasta é recusado como fora da allowlist (`403`), mesmo dentro da raiz. O WebSocket continua dizendo
`workspacePath`, como `session.start` — é o mesmo valor. Registrar no
[backend/03](../../architecture/backend/03-modules.md#workspace) que uma subpasta aberta é uma
fronteira mais estreita que a raiz, e é isso que ela significa.

---

## F1 — File read

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Tetos de tamanho (modo leve, edição, leitura paginada) e quais encodings se lê e se grava | quanto o editor escolhido (D-09) aguenta sem travar o celular; tamanho real dos arquivos dos repositórios do usuário — **medir** | B-09, B-11, B-38 | 2026-09-28 · **limiar 1 MB, teto de edição 10 MB, configurados**; acima → `413` `FILE_TOO_LARGE` e leitura paginada (F7); binário por NUL nos primeiros 8 KB; encoding só por BOM e UTF-8 válido, senão `415` e "reabrir com encoding" (`iconv-lite`), save no encoding de abertura, não representável → `422`; teto lido com `teto + 1` do mesmo descritor. Decisão do usuário com a recomendação; **os números são provisórios** até a medida (p50/p99 em `~/projects`, 1/5/10 MB no celular), que vem para esta página | ✅ |
| D-05 | O que fazer com symlink (seguir? até onde?) e com hard link ao salvar | se a verificação pós-abertura (`/proc/self/fd`) é aceitável como Linux-only; o que o rename atômico faz com `nlink > 1` — **medir** | B-07, B-11 | 2026-09-28 · **symlink seguido só com `realpath` dentro da pasta aberta**; link para fora é `outside: true` e não navegável; verificação pós-abertura por `/proc/self/fd` em toda leitura e todo temporário (macOS é gap do plano 19); apagar symlink apaga o link; **`nlink > 1` → escrita no lugar com cópia temporária**. Decisão do usuário com a recomendação; a parte do hard link fica sujeita à medida do que o VS Code faz | ✅ |

### D-04 — teto de tamanho e encoding

Arquivo grande trava o editor e custa memória no backend (o conteúdo é lido inteiro para o hash).
Encoding errado corrompe o arquivo no save: ler latin-1 como UTF-8 e gravar de volta troca todo byte
acentuado.

- **Tamanho — três faixas, como o VS Code.** Até o *limiar de arquivo grande*, o editor completo;
  entre o limiar e o *teto de edição*, o **modo leve** (sem minimap, sem folding, sem realce pesado —
  e a aba diz isso); acima do teto, **leitura paginada somente leitura** pelo `GET /files/raw` com
  `Range` (F7). Medir: tamanho p50/p99 dos arquivos de texto em `~/projects` (excluídos os da D-10) e
  o tempo de abrir 1, 5 e 10 MB no editor da D-09 num celular médio.
- **Binário.** NUL nos primeiros 8 KB é a heurística do git e do VS Code; barata e conhecida. Binário
  abre em hexadecimal, somente leitura (F7).
- **Encoding.** Detecção só pelo que é certo: BOM (UTF-8, UTF-16 LE/BE) e UTF-8 válido. UTF-8 inválido
  sem escolha é `415` (`reason: encoding`) — **nunca um palpite** —, e a UI oferece "reabrir com
  encoding" (windows-1252, ISO-8859-1/15, Shift-JIS, GBK…, via `iconv-lite` no backend). O save grava
  no encoding em que o arquivo foi aberto; trocar é ação explícita ("salvar com encoding"), e
  caractere que o encoding de destino não representa é `422` `FILE_NOT_ENCODABLE`, nunca `?` em
  silêncio.

**Recomendação:** limiar **1 MB**, teto de edição **10 MB**, ambos configurados, até a medida dizer
outros números (`413` `FILE_TOO_LARGE` com `params.size` e `params.limit` acima do teto — o cliente
então oferece a leitura paginada); binário por NUL nos primeiros 8 KB; encodings como acima. O teto é
lido com limite de `teto + 1` bytes do mesmo descritor — nunca `stat` e depois leitura, que deixa o
arquivo crescer entre as duas.

### D-05 — symlinks e hard links

Três perguntas diferentes, que costumam ser confundidas:

1. **Seguir symlink ao ler/escrever.** O esboço do roteiro dizia "só se o alvo fica na mesma raiz". Com a D-11, a
   fronteira da escrita é a **pasta aberta**, e seguir um link para a pasta vizinha — dentro da
   mesma raiz — deixaria o humano escrever fora da pasta que abriu. Monorepos com `pnpm` apontam
   `node_modules/*` para `packages/*` **dentro** do repositório, então a regra estrita não os quebra
   quando a pasta aberta é a raiz do repositório.
2. **A corrida entre checar e abrir (TOCTOU).** `realpath` → conferir → `open` deixa uma janela em
   que um diretório intermediário vira symlink para fora. `O_NOFOLLOW` protege só o último
   componente, e o Node não expõe `openat2(RESOLVE_BENEATH)`. No Linux, depois de abrir, o caminho
   real do descritor está em `/proc/self/fd/<fd>`: conferir **no descritor** fecha a janela para
   leitura e para o temporário da escrita. O `rename` final continua sendo por caminho — a janela
   residual é a de um processo local, com escrita dentro da pasta, trocando um diretório no
   microssegundo certo, e é declarada (R-02). Em macOS o equivalente (`F_GETPATH`) não está no Node:
   gap para o [plano 19](../19-distribution/README.md).
3. **Hard link ao salvar.** O save atômico (temporário + `rename`) troca o inode: o outro nome do
   hard link continua com o conteúdo antigo, em silêncio. Medir o que o VS Code faz; a alternativa
   é escrever no lugar (com cópia de segurança temporária) quando `nlink > 1`.

**Recomendação:** seguir symlink só quando o `realpath` fica **dentro da pasta aberta** (mais
estrito que o esboço, pela D-11); na árvore, o link para fora aparece como `symlink` com
`outside: true` e não é navegável; verificação pós-abertura pelo descritor em toda leitura e em todo
temporário; apagar um symlink apaga o link, nunca o alvo; `nlink > 1` → escrita no lugar com cópia
temporária, para não quebrar o link em silêncio — sujeito à medida.

---

## F2 — File write

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Apagar é definitivo, vai para uma lixeira, ou é desfeito pelo histórico local | onde uma lixeira poderia morar sem sair da allowlist nem sujar o repositório | B-15, B-58 | 2026-09-28 · **em duas etapas**: até a F8, definitivo com segundo passo (`409` `DIRECTORY_NOT_EMPTY` com contagem capada, apaga só com `expectedEntries` igual, senão `412`); com a F8, o que cabe no histórico é guardado e apagar vira aviso com **Desfazer** (B-58); o que não cabe mantém o segundo passo; falha ao guardar volta ao segundo passo. Decisão do usuário com a recomendação | ✅ |
| D-12 | Como mover sem sobrescrever o destino, se o Node não tem `RENAME_NOREPLACE` | se `link` + `unlink` serve para arquivo; o que resta para diretório — **medir** | B-13 | 2026-09-28 · **arquivo por `link` + `unlink`; diretório por conferência + `rename` sob a trava por caminho** (B-18), janela residual declarada em R-02; `EXDEV` → `422` `FILE_OPERATION_INVALID` (`reason: crossDevice`), nunca cópia + remoção implícita. Decisão do usuário com a recomendação; a medida de uma biblioteca com `renameat2` sem módulo nativo ainda vem, e só troca o meio, não a semântica | ✅ |
| D-13 | Onde os fatos `file.*` aparecem para o usuário — `/audit` só lê `audit_entries` hoje | se um `GET /audit-events` é deste plano ou do [plano 14](../14-audit-explained/README.md), que redesenha a trilha | B-17, B-29 | 2026-09-28 · **`GET /audit-events`** no `AuditQueryModule`, filtrado por quem pergunta, `kind` por prefixo, cursor keyset por `seq`, e uma seção "Arquivos" mínima na Auditoria; o plano 14 absorve, e se chegar antes B-17/B-29 consomem o dele. Decisão do usuário com a recomendação | ✅ |
| D-15 | Arquivos que mudam o que o Claude pode fazer (`.claude/settings*.json`, `.mcp.json`) são editáveis pelo editor genérico | o que o [plano 13](../13-claude-settings/README.md) decide para a tela própria dele | B-11, B-34 | 2026-09-28 · **editável com segundo passo**: `PUT` sem `confirmSensitive: true` → `428` (`reason: sensitiveFile`); com ele, grava e registra `file.written` com `sensitive: true`; lista pura de domínio (`.claude/settings.json`, `.claude/settings.local.json`, `.mcp.json`) reusada pelo plano 13; criar, mover e apagar passam pelo mesmo passo. Decisão do usuário com a recomendação | ✅ |

### D-06 — apagar definitivo ou lixeira

O VS Code manda para a lixeira do SO. Aqui:

- a lixeira do SO (`~/.local/share/Trash`) fica **fora da allowlist** — escrever lá é exatamente o
  que a fronteira proíbe;
- uma lixeira **dentro** da pasta (`.rc-trash/`) aparece no `git status`, no Quick Open do plano 11
  e no contexto do Claude;
- o desfazer do [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)
  é da **sessão** do Claude e não alcança escrita humana;
- mas o **histórico local** da F8 é um store nosso, fora da pasta, com teto e purga — o mesmo desenho
  do store de snapshots do ADR-013. Guardar ali o que vai ser apagado é uma lixeira que não fura a
  fronteira nem suja o repositório.

O princípio do produto é "desfazer quando possível, em vez de confirmar".

**Recomendação:** em duas etapas. **Até a F8**, apagar é definitivo com o segundo passo que diz
**quanto** vai embora: pasta não vazia responde `409` `DIRECTORY_NOT_EMPTY` com a contagem (capada,
para não varrer `node_modules` inteiro), e só apaga quando o cliente devolve a contagem que viu
(`expectedEntries`) — se mudou no meio, `412`. **Com a F8**, o que cabe no teto do histórico é
guardado antes de sair, e apagar deixa de pedir confirmação: vira um aviso com **Desfazer**
(B-58). O que não cabe (a pasta de 40 mil arquivos) continua com o segundo passo e diz, sem
eufemismo, que não há volta. Falha ao guardar no histórico volta ao segundo passo — nunca apaga
achando que tem volta.

### D-12 — mover sem sobrescrever

`fs.rename` no Linux **sobrescreve** o destino em silêncio. `renameat2(RENAME_NOREPLACE)` existe no
kernel, não no Node.

- **Arquivo:** `link(origem, destino)` falha com `EEXIST` se o destino existe — atômico — e depois
  `unlink(origem)`. Não serve entre sistemas de arquivos (`EXDEV`).
- **Diretório:** não tem hard link. Conferir e depois renomear deixa a janela.

**Recomendação:** arquivo por `link` + `unlink`; diretório por conferência + `rename` sob a trava
por caminho do processo (B-18), com a janela residual contra processos externos declarada em R-02;
`EXDEV` → `422` `FILE_OPERATION_INVALID` (`reason: crossDevice`), nunca cópia + remoção implícita.
Medir antes se alguma biblioteca pequena expõe `renameat2` sem módulo nativo.

### D-13 — onde os fatos de arquivo aparecem na trilha

`GET /audit-entries` lê `audit_entries` (invocações de tool). `audit_events` (fatos de conta, e agora
os de arquivo) não tem leitura: foi escrito para ser prestado depois, e o "depois" chega aqui — o e2e
da F6 pede os três fatos na tela de Auditoria.

| Opção | A favor | Contra |
|---|---|---|
| **`GET /audit-events`** no `AuditQueryModule`, com `kind` (prefixo), cursor keyset por `seq` | mesma disciplina da trilha de invocações; serve aos fatos de device, regra e retomada que hoje ninguém vê | endpoint novo num módulo que não é deste plano |
| União dentro de `GET /audit-entries` | uma lista só | as formas são diferentes — `toolName`/`input` não têm valor honesto para "apagou `src/x.ts`"; é o argumento que separou as tabelas |

**Recomendação:** `GET /audit-events`, filtrado sempre por quem pergunta, com `kind` por prefixo
(`file.`), e uma seção "Arquivos" mínima na tela de Auditoria do [plano 06](../06-workbench/README.md).
O redesenho da trilha é do [plano 14](../14-audit-explained/README.md), que junta `audit_events` à
linha do tempo — ele absorve esta leitura em vez de escrever outra; se o 14 chegar antes, B-17 e
B-29 viram consumo do endpoint dele. O substituir em lote do plano 11 escreve pela escrita deste
plano e cai nos mesmos fatos.

### D-15 — arquivos que mudam a permissão

Uma regra `allow` no `.claude/settings.json` do projeto **fura o `canUseTool`** em diretório confiado
(medido — [backend/04](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido)),
e um hook ali é código que roda na próxima sessão. O plano 13 recomenda que a tela dele mostre isso
só para leitura. Um editor genérico que salva qualquer arquivo abre a mesma porta por outro lado.

| Opção | A favor | Contra |
|---|---|---|
| Editável como qualquer arquivo | é o humano decidindo, como faria no disco | um save rápido do celular muda o que o Claude pode fazer sem ninguém perceber que era isso |
| Somente leitura no editor | coerente com o plano 13 | o usuário não consegue corrigir o próprio arquivo pela ferramenta que diz ser um editor |
| **Editável com segundo passo** que diz o que o arquivo faz, e fato na trilha marcado `sensitive` | o humano decide sabendo; a trilha distingue | uma lista de nomes a manter |

**Recomendação:** editável com segundo passo. O `PUT` de um caminho da lista sem a confirmação
explícita (`confirmSensitive: true`) responde `428` `PRECONDITION_REQUIRED` (`params.reason:
sensitiveFile`); com ela, grava e registra `file.written` com `sensitive: true`. A lista é regra pura
de domínio (`.claude/settings.json`, `.claude/settings.local.json`, `.mcp.json`), e o plano 13 a
reusa. Criar, mover e apagar esses caminhos passam pelo mesmo passo.

---

## F3 — File watch

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Qual watcher: `fs.watch` recursivo, `chokidar` ou `@parcel/watcher` | quantos watches de inotify cada um consome num repositório com `node_modules`, e o que acontece no limite — **medir** | B-19, B-20 | 2026-09-28 · método decidido pelo usuário com a recomendação. 2026-10-01 · **`chokidar` v5**, pela medida do spike B-19 (`scripts/watcher-spike.mjs`, números na seção): é a única das três que passa nos **dois** critérios — não gasta watch em diretório excluído (`fs.watch` gasta ~50 mil, dentro de `node_modules`) e diz `ENOSPC` no limite **na subida e depois dela** (`@parcel/watcher` recusa a subida, mas fica **mudo** quando o limite acaba com ele já de pé, e perde o que muda nas pastas novas). O preço: um watch por arquivo além de um por pasta (2 805 contra 709 do `@parcel/watcher` neste repositório). Sem empate, a regra do módulo nativo não decidiu | ✅ |

### D-08 — a implementação do watcher

No Linux, todo watcher recursivo em userland acaba em inotify, **um watch por diretório**. O limite
`fs.inotify.max_user_watches` é da máquina inteira — e o VS Code do usuário, o do `tsc --watch` e o
nosso disputam o mesmo número. Um repositório com `node_modules` passa de 50 mil diretórios.

| Opção | O que se sabe | O que medir |
|---|---|---|
| `fs.watch({ recursive: true })` (Node ≥ 20 no Linux) | sem dependência; percorre a árvore e põe um watch em cada diretório, **inclusive** os ignorados | watches consumidos com `node_modules`; latência de subir numa árvore grande |
| `chokidar` v4 | API madura, `ignored` por função; sobre `fs.watch` | se o `ignored` evita pôr watch no diretório ignorado ou só filtra o evento |
| `@parcel/watcher` | nativo, ignora por glob **antes** de pôr o watch; usado pelo VS Code | módulo nativo — custo no [plano 19](../19-distribution/README.md) |

**Recomendação:** decidir pela medida, não pela reputação: um spike (B-19) num clone deste
repositório com `pnpm install` feito, contando watches (`/proc/<pid>/fdinfo`) e tempo de subida das
três opções, e o comportamento com `max_user_watches` baixado de propósito. O critério é
"diretório excluído (D-10) não consome watch" e "no limite, erro explícito, nunca silêncio". Se
duas empatarem, a sem módulo nativo.

**Resultado da medida (2026-10-01, B-19).** Clone raso deste repositório com
`pnpm install --frozen-lockfile` feito — 8 005 diretórios e 58 631 entradas, das quais 2 805 (709
diretórios) fora de `.git` e da lista da D-10 —, Linux 6.8, Node 24.16, `chokidar` 4.0.3 e 5.0.0,
`@parcel/watcher` 2.6.0. Cada opção num processo próprio, que conta as linhas `inotify wd:` do seu
`/proc/self/fdinfo` quando o watcher está pronto, e escreve uma sonda numa pasta assistida e outra
em `node_modules/`. O limite foi baixado sem root, num user namespace próprio
(`unshare -Ur`, `/proc/sys/user/max_inotify_watches`). Reproduzir:
`node scripts/watcher-spike.mjs --tree <clone> --libs <pasta com as bibliotecas> [--limit <n> | --midflight]`.

| Opção | Watches | Pronto em | Sonda em `node_modules` | Limite 300 na subida | Limite gasto depois da subida |
|---|---|---|---|---|---|
| `fs.watch` recursivo | **49 941** | 1,8–3,3 s | ouvida (assiste tudo) | evento `error` `ENOSPC`, watcher parcial de pé | `error` `ENOSPC` |
| `chokidar` 4 / 5 | 2 805 | 0,2–0,8 s | não ouvida | evento `error` `ENOSPC`, `ready` mesmo assim | `error` `ENOSPC` por pasta nova |
| `@parcel/watcher` | 709 | 0,15 s | não ouvida | a subida **rejeita** (`inotify_add_watch … No space left on device`), nada retido | **nada** — o arquivo escrito numa pasta nova não chega e nenhum erro aparece |

Os 2 805 do `chokidar` são exatamente as entradas fora das exclusões: ele põe um watch em cada
arquivo além de cada pasta, e não há opção que o impeça. Com `@parcel/watcher` o número cai a um
quarto, mas o silêncio depois da subida reprova o segundo critério — e é o caso comum: o limite se
esgota quando o VS Code do usuário sobe **depois** de nós. **Escolha: `chokidar` v5** (ESM, Node
≥ 20, sem módulo nativo). O adapter (`ChokidarFolderWatcher`) trata o `ENOSPC`/`EMFILE` antes do
`ready` como `WATCH_UNAVAILABLE` e fecha o que reteve, e depois dele como
`workspace.watchStopped { reason: systemLimit }`. Alternativa registrada, sem task: um adapter
nosso sobre `fs.watch` não recursivo por pasta custaria os 709 watches com erro explícito — se o
custo por arquivo virar problema medido, é por aí, atrás da mesma porta.

---

## F4 — Explorer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Exclusões padrão da árvore e do watcher, e o teto de entradas por diretório | se o que é escondido também deixa de ser assistido; qual teto não trava a virtualização | B-08, B-20, B-25 | 2026-09-28 · **duas listas, constantes do domínio**: escondidos `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db` (com "mostrar ocultos"); visíveis e não assistidos `node_modules`, `.git/objects`, `.git/subtree-cache`, `dist`, `build`, `.venv`, `target`; teto por nível configurado, default 5 000, com `truncated: true`. Decisão do usuário com a recomendação | ✅ |
| D-19 | De onde vêm os modelos do "novo a partir de modelo" | se o usuário quer modelos próprios, e onde eles morariam sem inventar convenção na pasta dele | B-26 | 2026-09-28 · **conjunto embutido no web + "Novo a partir deste arquivo"**; criar de modelo é um `POST /files` com conteúdo inicial; pasta de convenção e modelos por usuário ficam como alternativa registrada, sem task. Decisão do usuário com a recomendação | ✅ |

### D-10 — exclusões padrão e teto da árvore

O VS Code separa duas listas: `files.exclude` (não aparece: `.git`, `.DS_Store`…) e
`files.watcherExclude` (aparece, mas não é assistido: `node_modules`, `.git/objects`…). A separação
importa: esconder `node_modules` confunde quem procura um pacote; assistir `node_modules` esgota o
inotify.

**Recomendação:** as duas listas, com os defaults do VS Code como ponto de partida, **constantes do
domínio** e não configuração por usuário neste plano — `.git`, `.svn`, `.hg`, `.DS_Store`,
`Thumbs.db` escondidos (com alternador "mostrar ocultos" na árvore, conveniência por visitante);
`node_modules`, `.git/objects`, `.git/subtree-cache`, `dist`, `build`, `.venv`, `target` visíveis e
**não assistidos** (a árvore os recarrega ao expandir). Teto de entradas por nível **configurado,
default 5 000**, com `truncated: true` — o mesmo espírito do teto da listagem de subpastas do plano
06, sem ser necessariamente o mesmo número (lá são só diretórios).

### D-19 — de onde vêm os modelos

O VS Code puro não tem modelos de arquivo — extensões têm. O pedido do usuário é "criar a partir de
modelo", e a pergunta é de onde o modelo vem.

| Opção | A favor | Contra |
|---|---|---|
| **Conjunto embutido no web** (Markdown, JSON, TypeScript, teste, `.gitignore`, `.editorconfig`, `CLAUDE.md`…), com nome traduzido e marcadores (`${fileName}`, `${date}`) | nada no servidor; o conteúdo é revisado como código | fixo por versão |
| **"Novo a partir deste arquivo"** — qualquer arquivo da pasta vira modelo | o modelo do projeto é o próprio projeto; nada de convenção nova | é um duplicar com nome escolhido |
| Pasta de modelos por convenção (`.templates/`) | modelos do time versionados no repositório | inventa convenção na pasta do usuário; o Quick Open e o Claude passam a vê-la |
| Modelos por usuário no servidor | seguem o usuário entre dispositivos | tela de gestão, armazenamento e migração para um recurso secundário |

**Recomendação:** as duas primeiras. Criar a partir de modelo é um `POST /files` com conteúdo inicial
— o servidor não sabe que era modelo, e não precisa. Pasta de convenção e modelos por usuário ficam
registrados aqui como alternativa, sem task.

---

## F5 — Editor

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-09 | O editor é o Monaco ou o CodeMirror 6 | tamanho do bundle, toque no celular, testabilidade em jsdom, CSP e workers — **medir** | B-31 | 2026-09-28 · **Monaco**, carregado sob demanda, servido pelo nosso build (nenhum byte de CDN), atrás da porta `CodeEditor`; modo simplificado em tela pequena. Decisão do usuário com a recomendação; a medida (chunk gzip, tempo até editar no celular, cobertura do modo simplificado) não troca o editor — decide só a partir de que largura o modo simplificado assume. **Medida 2026-10-01** (`node scripts/editor-bundle.mjs`): chunk `monaco-engine` 3 972,7 kB / **1 029,8 kB gzip**, CSS 27,7 kB gzip, `editor.worker` ~81 kB gzip, cada gramática 0,5–3,8 kB gzip sob demanda; nada do Monaco no chunk inicial, nenhum byte de CDN. Abaixo de `md` o Monaco **nunca carrega** (o modo simplificado é um campo de texto com as mesmas regras de save); o tempo até editar num celular médio não foi medido | ✅ |
| D-14 | Rascunho não salvo sobrevive à recarga da página | se guardar conteúdo de arquivo no navegador é aceitável (`.env` aberto num computador emprestado) | B-40 | 2026-09-28 · **não persistir conteúdo**: buffer sujo em memória, `beforeunload` ao recarregar ou fechar, confirmação listando os arquivos ao fechar aba suja; persistir cifrado no servidor fica para decisão própria. Decisão do usuário com a recomendação | ✅ |
| D-20 | O formato do que se arrasta da árvore e das abas para o chat do Claude, e o que acontece entre abas de pasta | o que o [plano 08](../08-claude-panel/README.md) aceita como anexo (`{kind:'file', path, range?}`), e se pasta entra como anexo | B-42 | 2026-09-28 · **`application/x-remote-claude-files+json`** (`{ folder, entries, selection? }`, caminho relativo) + `text/plain`; `scopeDragPayload` pura em `web/src/shared/`, recusando com `outsideFolder`; pasta vai como `directory`, sem expandir; "Adicionar ao contexto do Claude" só com o painel do 08 registrado; a fronteira continua no `session.prompt`. Decisão do usuário com a recomendação | ✅ |

### D-09 — Monaco ou CodeMirror 6

| | Monaco | CodeMirror 6 |
|---|---|---|
| Fidelidade ao VS Code | é o editor do VS Code: atalhos, multi-cursor, busca, **diff editor embutido** | próximo, montado por extensões; diff é `@codemirror/merge`, mais simples |
| Bundle | grande (MBs), com workers de linguagem | pequeno e modular |
| Celular / toque | fraco — seleção e teclado virtual são conhecidos por falhar | bom, desenhado para toque |
| jsdom (unit/integração do web) | não roda — exige adaptador e teste real no e2e | roda parcialmente |
| CSP e servir localmente | `@monaco-editor/react` busca da CDN por padrão; precisa de `loader.config` com o pacote local e `worker-src` para os workers | sem CDN, sem workers obrigatórios |
| Reuso nos planos 08 e 11 | `colorize` para realce no chat; diff para as alterações do Claude e para a prévia do substituir | realce e diff por extensões diferentes |
| O que vem de graça | localizar/substituir, ir para linha, multicursor, minimap, sticky scroll, desfazer por aba | localizar e desfazer por extensão; minimap não existe |

**Recomendação:** Monaco, pela fidelidade e pelo diff editor, que os planos 08 e 11 reusam —
**carregado sob demanda** (chunk próprio, nunca no bundle inicial), **servido pelo nosso build**
(nenhum byte de CDN), atrás de uma porta `CodeEditor` para que componentes e hooks sejam testados em
jsdom com um falso e o Monaco real no e2e; em tela pequena, um modo simplificado (leitura, e edição
num campo de texto com as mesmas regras de save). A decisão fecha **depois** de medir: chunk
gzipado, tempo até editar num celular médio, e se o modo simplificado cobre o toque. Se a medida
condenar o Monaco no celular, a saída não é trocar de editor: é o modo simplificado assumir tudo
abaixo de `md`.

O que o Monaco traz pronto (multicursor, minimap, sticky scroll) entra como está, ligado ou
desligado pelas preferências — **sem task própria**. Nada de inteligência de linguagem: completar,
diagnóstico, formatador e símbolos ficaram fora por decisão do usuário de 2026-09-26; o Monaco serve
só o realce de sintaxe por gramática, que não executa nada.

### D-14 — rascunho não salvo e a recarga

O VS Code guarda o buffer sujo ("hot exit") e o devolve ao reabrir. No navegador, isso significa
conteúdo de arquivo em `localStorage`/IndexedDB — em claro, na máquina de quem abriu, e o
[web/03](../../architecture/web/03-ui-system.md#tema) só aceita armazenamento local para conveniência.

**Recomendação:** não persistir conteúdo neste plano. Buffer sujo vive em memória; recarregar ou
fechar a página com buffer sujo dispara o aviso do navegador (`beforeunload`); fechar uma aba de
editor ou de pasta suja pede confirmação listando os arquivos. Persistir (cifrado, por usuário, no
servidor) pode vir depois, com decisão própria.

### D-20 — o que se arrasta para o Claude

O usuário quer arrastar arquivos da árvore e das abas para o chat e vê-los entrar no contexto do
prompt. O alvo e os chips de contexto são do plano 08; a **fonte** é deste plano, e as duas pontas
precisam concordar num formato.

- **O quê:** um tipo próprio no `DataTransfer` (`application/x-remote-claude-files+json`) com
  `{ folder, entries: [{ path, kind: 'file' | 'directory' }], selection?: { path, range } }` — caminho
  **relativo à pasta da aba** e a pasta junto, como a API (D-11) — e `text/plain` com os caminhos
  relativos, para quem solta num campo de texto qualquer.
- **Entre abas de pasta:** arrastar da aba `/r/app/pkg` para o chat da aba `/r/app` é legítimo (o
  caminho está dentro); o contrário não é. Se cada ponta decidir sozinha, divergem.
- **Pasta:** o plano 08 decide se pasta vira anexo; este plano só a entrega como `directory`, sem
  expandir o conteúdo — expandir `node_modules` num arraste é o acidente óbvio.
- **Sem o plano 08:** os itens "Adicionar ao contexto do Claude" não podem aparecer se ninguém os
  consome.

**Recomendação:** o tipo e uma função pura `scopeDragPayload(payload, targetFolder)` moram em
`web/src/shared/` (duas features consomem — é o critério de [web/02](../../architecture/web/02-folder-structure.md#quando-algo-vira-shared));
ela reescopa o que a pasta de destino contém e recusa o resto com motivo (`outsideFolder`), e o
plano 08 a usa no alvo. O comando "Adicionar ao contexto do Claude" é registrado com condição de
existência de um consumidor — o item só aparece quando o painel do 08 está registrado. A validação de
verdade continua sendo a do backend no `session.prompt` (plano 08 · F0): o arraste é conveniência,
não fronteira.

---

## F6 — E2e

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-21 | O menu de contexto é modal? | o axe no navegador (S-289) acusou `aria-hidden-focus`: o menu modal do Radix esconde o resto da página com `aria-hidden` e o deixa focável — e o axe só perdoa isso para `dialog` com `aria-modal` | B-45 | 2026-10-01 · **não**: `ContextMenu` de `shared/components/ui/context-menu.tsx` passa a `modal={false}` por padrão (`// CUSTOM:`), o que vale para a árvore, as abas do editor, as abas de pasta e as pastas recentes. O padrão de menu do WAI-ARIA não esconde a página; clique fora e `Esc` continuam fechando, e o foco continua entrando e voltando. Os `DropdownMenu` ficam como estão — fora do escopo do S-289, sem medição | ✅ |
| D-22 | O tema escuro do editor é o `vs-dark` do Monaco? | o axe (S-289, tema escuro) mediu o comentário do `vs-dark` (`#608b4e` em `#1e1e1e`) em 4,2:1, abaixo dos 4,5:1 do AA | B-45 | 2026-10-01 · **não**: um tema `remote-claude-dark` herda o `vs-dark` e troca só o comentário pelo verde do Dark+ do VS Code (`#6A9955`, 5,0:1); o claro continua `vs`. O teste unitário do engine mede o contraste | ✅ |
| D-23 | Como o e2e prova que desfazer o turno do Claude preserva a edição humana (S-285), se o único arquivo do turno foi editado depois | a confirmação da tela não oferece um desfazer que não faria nada (plano 04 · S-38): com o único arquivo preservado, o botão fica desabilitado | B-44 | 2026-10-01 · a tela prova o que diz **antes** — o arquivo em "Ficam como estão" com o motivo `modifiedOutside`, "nada mudaria" e o botão desabilitado —, e o desfazer é pedido assim mesmo por um socket da suíte, como outro dispositivo faria: o `session.rewound` lista o arquivo em `preserved` com `modifiedOutside`, a região "Último desfazer" da tela o mostra em "Mantidos como estavam", e o disco guarda a edição humana | ✅ |

---

## F7 — Previews and transfer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-16 | Como baixar arquivo e pasta sem token na URL, e os tetos de download e de upload | quanto um blob aguenta no navegador do celular; se um bilhete de uso único na URL é aceitável — **medir** | B-48, B-49, B-52 | 2026-09-28 · **`fetch` com Bearer → blob**, teto de download configurado (default 200 MB) conhecido antes (`413` no `archive` pelo estimado); `showSaveFilePicker` + stream onde existir; upload com teto por arquivo (default 100 MB), multipart em stream. Bilhete na URL fica como alternativa, só com decisão própria. Decisão do usuário com a recomendação; os tetos são provisórios até medir o blob no celular | ✅ |
| D-18 | Como servir conteúdo do usuário para prévia sem abrir XSS na origem do app | quais tipos entram na prévia; se o pdf.js local cabe no orçamento de bundle | B-48, B-50 | 2026-09-28 · **`GET /files/raw` sempre com `nosniff` e `CSP: sandbox`**, fora da lista de prévia como `attachment`; a web nunca navega para o `raw` — imagem e SVG por `<img src=blob:>`, PDF pelo pdf.js do nosso build, markdown pelo sanitizador do plano 08; prévia de `.html` é o código-fonte. Decisão do usuário com a recomendação | ✅ |
| D-26 | Como o e2e passa pelas superfícies nativas do navegador na transferência (S-326, S-360) | o Playwright não responde ao diálogo de `showSaveFilePicker` nem arrasta um arquivo de fora da página; o arrastar do desktop, o seletor de arquivos e o salvar são do navegador | B-54 | 2026-10-01 · **o salvar**: `showSaveFilePicker` é removido antes da página carregar (`addInitScript`), e o download segue o caminho de todo navegador sem ele — link para um blob que a página fez (D-16) —, chegando como `download` do Playwright; o caminho do seletor fica com o teste de integração. **O arrastar**: um `drop` despachado na linha da pasta com um `DataTransfer` da página carregando um `File` — o que o navegador entrega ao soltar um arquivo do desktop; a leitura cai no `transfer.files` (sem `webkitGetAsEntry`), como num navegador sem a API de entradas. **O seletor**: o `filechooser` que "Enviar arquivos aqui…" abre, respondido com `setFiles`. **O teclado**: o foco é posto na linha da pasta (`focus()`), e daí em diante só teclas — `Shift+F10`, a letra do item, `Enter`, a palette, `Alt+Shift+D` | ✅ |

### D-16 — download sem token na URL, e os tetos

Um `<a href>` ou um `<img src>` não carregam o cabeçalho `Authorization`, e token em query string é
proibido ([AGENTS.md](../../../AGENTS.md), regra 8): vaza em log de proxy e em histórico.

| Opção | A favor | Contra |
|---|---|---|
| **`fetch` com Bearer → blob → `URL.createObjectURL`** | nenhuma credencial na URL; o mesmo caminho para imagem, PDF e download | o arquivo inteiro passa pela memória do navegador — um zip de 2 GB não cabe num celular |
| Bilhete de uso único (opaco, 60 s, amarrado ao usuário e ao caminho) na URL | download em stream nativo, sem teto de memória | é uma credencial na URL, ainda que curta e de uso único; aparece no log de acesso |
| `showSaveFilePicker` + stream | stream sem credencial na URL | só em navegadores Chromium de desktop |

**Recomendação:** `fetch` + blob, com teto de download configurado (default 200 MB) que o cliente
conhece antes de começar (`413` `FILE_TOO_LARGE` no `archive` pelo tamanho estimado); stream por
`showSaveFilePicker` onde existir, como melhoria. O bilhete fica registrado como alternativa, e só
entra com decisão própria. Upload: teto por arquivo configurado (default 100 MB), multipart em stream
no backend — nunca o corpo inteiro em memória.

### D-18 — servir conteúdo do usuário para prévia

Um `.html` ou um `.svg` servido pela origem da API com o seu `Content-Type` é **script do usuário
rodando na origem do produto** — com acesso ao que a sessão web alcança. Mesmo arquivo "do próprio
usuário": pode ter vindo do Claude, de um `npm install` ou de um clone.

**Recomendação:** `GET /files/raw` sempre com `X-Content-Type-Options: nosniff` e
`Content-Security-Policy: sandbox`; tipos fora de uma lista de prévia (imagens raster, SVG, PDF,
texto) saem como `attachment`. A web nunca navega para o `raw`: imagem e SVG entram por
`<img src=blob:>` (script em SVG não roda dentro de `<img>`), PDF é desenhado pelo pdf.js servido
pelo nosso build (nunca o visualizador embutido do navegador, que abre o PDF numa origem), markdown é
renderizado pelo mesmo sanitizador do plano 08 — HTML cru nunca vira DOM. Prévia de `.html` é o
código-fonte, não a página.

---

## F8 — Local history

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-17 | O que o histórico local guarda, com que teto e retenção, quem vê, e o que acontece quando ele falha | quanto espaço o usuário aceita dar; se a versão salva por uma pessoa pode ser vista por outra da mesma raiz | B-55, B-56, B-57 | 2026-09-28 · **como na seção**: versão anterior a toda escrita humana que perde conteúdo (a do Claude não), metadado em tabela nova e blob por hash no disco do backend, nunca no Postgres; defaults configurados de **50 versões por arquivo, 512 MB, 30 dias**, purga por job; visível a quem alcança a raiz agora, com o autor; falha não impede salvar, impede apagar sem confirmação; restaurar é escrita comum (`file.restored`). Decisão do usuário com a recomendação; ADR-015 (B-55) registra | ✅ |
| D-24 | Como o e2e prova o conflito do restaurar sobre o que o Claude roteirizado escreveu (S-355) | com o arquivo aberto **e limpo**, o editor recarrega o que o Claude escreveu (S-283) e o restaurar manda o `If-Match` novo — e vai; com o arquivo fechado, a versão atual é lida na hora do restaurar. Nenhum dos dois manda um `If-Match` velho | B-61 | 2026-10-01 · pelo **único caminho em que a tela manda um `If-Match` velho**: o buffer sujo quando o Claude escreve. A versão que a pessoa viu fica no buffer; restaurar pergunta (descarta o não salvo), e a resposta é `412` `FILE_CHANGED` dito com as palavras do restaurar e o trace; o disco guarda o que o Claude escreveu, e o servidor continua com **uma** versão (nada guardado, nada escrito) | ✅ |
| D-25 | O que fazer com S-281 e S-282 (F6), escritos antes da F8 mudar o apagar | com a B-58, apagar o que cabe no histórico não pergunta mais: o e2e da F6 esperava o diálogo "Apagar … de vez?" para um arquivo e para uma pasta de 4 entradas, e quebrou | B-61 | 2026-10-01 · o comportamento é o da [D-06](#f2--file-write) em sua segunda etapa, não um bug: o S-281 passa a esperar o aviso "… was deleted. It is kept in the local history." e nenhum diálogo; o S-282 continua provando o diálogo com a contagem, agora numa pasta que o histórico **não** guarda — um arquivo esparso de `historyMaxFileBytes + 1` (lido de `GET /files/limits`) dentro dela, e o primeiro passo diz por quê (`whyTooLarge`). Os helpers comuns dos specs foram para `e2e/fixtures/explorer.ts`, `page-checks.ts` e `history.ts` (`pnpm lint:dup` 0 clones) | ✅ |

### D-17 — o histórico local

O "Local History" do VS Code guarda uma cópia a cada save e deixa comparar e restaurar. É conteúdo de
arquivo guardado **fora** do arquivo — o mesmo tipo de coisa que o store de snapshots do
[ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso),
e deve seguir a mesma disciplina.

- **O que entra:** a versão **anterior** a toda escrita humana que perde conteúdo — salvar,
  apagar, mover por cima, restaurar, upload com substituição. Escrita do Claude **não** entra: ela
  já tem o store do desfazer da sessão, e duas cópias do mesmo fato divergem.
- **Onde:** metadado numa tabela (migration versionada nova — caminho, pasta, hash, tamanho, motivo,
  quem, quando), conteúdo em blob no disco do backend, **endereçado por hash** (o mesmo conteúdo
  salvo dez vezes é um blob). Nunca no Postgres — [backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)
  deixa o conteúdo do workspace fora do banco.
- **Teto e retenção:** por arquivo (entradas), total (bytes) e por idade; purga por job, sem apagar
  blob que outra entrada usa; arquivo acima do teto de snapshot não entra, e a entrada diz por quê.
- **Quem vê:** a versão foi escrita por alguém que tinha acesso à raiz; quem tem acesso à raiz
  **agora** já lê o arquivo atual. A leitura revalida a allowlist a cada pedido.
- **Falha:** o histórico é rede de conforto, a trilha é garantia. Falha do histórico **não** impede
  salvar — mas impede o apagar sem confirmação (D-06).

**Recomendação:** como acima, com defaults configurados de **50 versões por arquivo, 512 MB no
total e 30 dias**; visível a quem alcança a raiz agora, com o autor de cada versão à vista;
restaurar é uma escrita comum (com `If-Match`, na trilha como `file.restored`, e guardando antes o
que substitui). Registrar na ADR-015 (B-55) que o backend passa a guardar cópia de conteúdo humano, e
por quê.

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 07`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
