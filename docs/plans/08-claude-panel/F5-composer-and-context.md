# F5 — Composer e contexto

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-chat-panel.md); do explorer, das abas e da API de arquivos do
[plano 07](../07-explorer-and-editor/README.md); e, para o autocomplete fuzzy, do localizador de arquivos
do [plano 09](../09-search/README.md) (a D-12).
**Entrega:** escolher o que faz parte do contexto de um prompt como no plugin do Claude — `@` seleciona
arquivo, pasta, seleção ou terminal com autocomplete; arrastar do explorer, das abas e do desktop põe no
contexto; o contexto aparece em chips removíveis com tamanho e tokens estimados; `/` chama comando ou
skill da instalação com autocomplete, também antes de a sessão existir.

**Decisões que precisam estar fechadas para começar:** D-12, D-22 e D-23
([decisions.md](decisions.md#f5--composer-e-contexto)), e as D-01, D-02 e D-13.

---

## Por que o composer é uma fase própria

É um pedido explícito do usuário, com a forma dita: "poder escolher quais arquivos fazem parte do
contexto quando enviarmos um prompt, da mesma forma que o plugin do Claude: um `@` seleciona um arquivo;
quero poder arrastar arquivos para colocar no contexto; um `/` pode chamar um comando ou uma skill; e
ter autocomplete." Cada frase é uma task abaixo, com a sua matriz.

E é uma fronteira de segurança, não só uma caixa de texto: o contexto aponta arquivos da máquina. Por
isso a regra de como ele chega ao Claude é a D-01 — **referência** que ele lê pelo `Read`, que o hook
`PreToolUse` audita ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)) —,
o backend valida cada caminho na pasta da sessão, e o que vem do desktop **nunca** é gravado na pasta em
silêncio (D-22).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-44 — Backend: referências de arquivo, pasta e trecho, e texto de provedor 🔲

O `session.prompt` com `attachments` (a [B-01](F0-contract.md)) passa por uma validação **antes** de
qualquer coisa chegar ao Claude, e ela é tudo ou nada — um anexo inválido recusa o prompt inteiro, com o
`correlationId`:

- o caminho está no workspace **da sessão** (o `cwd`), contido no realpath — `..` e symlink que escapa →
  `WORKSPACE_NOT_ALLOWED`; a checagem é a do `FilePath` do módulo `files` do plano 07, por uma porta
  declarada no `session` ([fronteiras](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem));
- existe e é do tipo pedido — `FILE_NOT_FOUND` (do 07); `kind: 'file'` que é diretório → `INVALID_INPUT`;
  binário que não é imagem → `FILE_NOT_TEXT` (do 07);
- `range` é validado na sintaxe (`1 ≤ startLine ≤ endLine`); além do fim do arquivo passa — o Claude lê
  o que existe.

A composição é **no backend**, para web e app verem o mesmo, no formato que a D-01 fixar (um que o CLI
não expande). O `text` de provedor (`@terminal`) vai delimitado e rotulado pela origem, dentro do teto.
O log de `claude.input` leva caminhos e tamanhos, nunca conteúdo
([logging desta borda](../../architecture/backend/04-claude-integration.md#logging-desta-borda)). Prompt
com contexto durante um turno entra na fila da B-34 como qualquer outro.

### B-45 — Backend: anexos enviados (imagem e arquivo do desktop) 🔲

Pela D-02 e pela D-22: `POST /sessions/:sessionId/attachments` recebe imagem (PNG/JPEG/GIF/WebP) ou
arquivo de texto, com teto (`413 PAYLOAD_TOO_LARGE`) e tipo (`415 ATTACHMENT_TYPE_UNSUPPORTED`), e
devolve `attachmentId`. O anexo vive fora do workspace — memória ou diretório temporário do backend —,
**nunca** na trilha nem no log (só tipo, tamanho, hash), e é descartado ao fechar a sessão ou no TTL.
No prompt, a imagem vira bloco `image` do `SDKUserMessage`; o texto vira conteúdo delimitado com o nome
do arquivo — é conteúdo que a pessoa entregou, não leitura de disco. `attachmentId` desconhecido, de
outra sessão ou expirado → `ATTACHMENT_NOT_FOUND`. Reenvio do mesmo upload (mesmo hash, mesma sessão)
devolve o mesmo id.

Se o spike da D-02 reprovar a imagem, a parte de imagem sai, com registro no [progresso](progress.md).

### B-46 — O composer 🔲

Substitui o `PromptComposer` de uma linha: multilinha que cresce até um teto, Enter envia, Shift+Enter
quebra linha, Enter durante composição IME não envia. Prompt vazio **e** sem contexto não envia — o
botão diz por quê. Com um turno em execução, enviar diz que o prompt vai para a fila (B-34). Recusa do
backend chega pelo `correlationId`, traduzida, e o texto e o contexto ficam. Continua em React Hook
Form com Zod, como o de hoje, e sem depender do menu: o que se digita é o que se envia.

### B-47 — O conjunto de contexto, em chips 🔲

Acima do composer, o contexto do próximo prompt em chips: arquivo, pasta, trecho (com as linhas), imagem
(com miniatura), texto enviado e terminal — cada um com ícone, nome relativo à pasta e remover (clique e
teclado). O conjunto mostra o **tamanho total e os tokens estimados** (D-23) e avisa acima do limite,
sem bloquear; acima do teto duro, não envia e diz por quê.

- **deduplica**: o mesmo arquivo duas vezes é um chip; trecho de arquivo que já está inteiro não
  duplica;
- **persiste** no rascunho da conversa, na aba de pasta, até enviar ou limpar — trocar de aba e
  recarregar o mantêm (estado da aba que o plano 06 restaura); enviar limpa; envio recusado mantém;
- **revalida** antes de enviar: arquivo apagado entre escolher e enviar fica marcado, e o envio é
  recusado com o caminho; binário é avisado no chip;
- cada conversa tem o seu conjunto.

### B-48 — `@` com autocomplete 🔲

`@` abre o menu de menções no cursor:

| Entrada | O que acrescenta |
|---|---|
| arquivos e pastas da pasta aberta, por busca fuzzy — abertos no editor e recentes primeiro | chip de arquivo ou pasta |
| `@seleção` | o trecho selecionado no editor ativo da aba |
| `@terminal` | a saída recente do terminal ativo, como `text` — registrado pelo [plano 10](../10-integrated-terminal/README.md); ausente enquanto ele não existir ou com o terminal desligado |

A busca, pela D-12, é o localizador de arquivos do plano 09 (`GET /search/files`), dentro da pasta; a
resposta atrasada de uma consulta velha é descartada. Sem resultado, pasta vazia e resultado acima do
teto (`truncated`: "refine a busca") têm texto próprio. Caminho fora da pasta não é oferecido, e digitado
à mão é recusado no envio. Busca que falha diz isso e deixa digitar o caminho. Teclado: setas navegam,
Enter/Tab escolhem, Esc fecha sem apagar o texto — padrão ARIA de combobox. Os provedores (`@seleção`,
`@terminal`) vivem num registro do cliente, que outro plano estende sem mexer no composer.

### B-49 — Arrastar e soltar 🔲

| Origem | Resultado |
|---|---|
| explorer do plano 07 — um ou vários, pastas incluídas | um chip por item; pasta é **um** chip, sem expandir; acima do teto de itens, entra até o teto com aviso |
| aba do editor | o chip do arquivo |
| desktop | imagem e texto viram anexo enviado (B-45), com teto e tipo conferidos antes; **nada** é gravado na pasta — "salvar na pasta" é a ação de upload do plano 07, separada e explícita (D-22) |

Soltar no composer ou em qualquer ponto da conversa. Soltar durante um turno põe no contexto do rascunho,
e o envio vai para a fila. Item arrastado de **outra** aba de pasta é recusado com o motivo: o contexto é
da pasta da sessão. A área de soltar é anunciada, e há alternativa sem arrastar: "adicionar ao contexto"
no menu de contexto do explorer e da aba do editor.

### B-50 — `/` com autocomplete: comandos e skills de todas as origens 🔲

O `supportedCommands()` devolve comandos **e skills** — o próprio `sdk.d.ts` o descreve como "a lista de
skills disponíveis" —, e o menu do [plano 04](../04-transcript-and-resume/F3-commands.md) já os lista; o
que falta é distingui-los e mostrá-los como o plugin do Claude:

- **origem** de cada item, com selo: **Claude Code** (o `builtin` do SDK), **Projeto**, **Usuário** e
  **Sistema**. Por decisão do usuário (2026-09-26), as skills carregam das três origens: as de usuário e
  de sistema entram por um plugin local que o [plano 11](../11-claude-settings/README.md) monta pela opção
  `plugins` do SDK, mantendo o `settingSources: ['project']` do ADR-011; elas chegam qualificadas
  (`plugin:skill`), e o nome do plugin diz a origem. Nome simples, descrição e dica de argumento à vista;
  escolher insere o nome **que o CLI roda** (o qualificado, quando é o caso). Skill desligada no plano 11
  não aparece;
- **colisão**: o mesmo nome em duas origens aparece duas vezes, distinguido pelo selo. Entre um `builtin`
  e um sem marca, `/nome` roda o `builtin` **qualquer que seja a ordem** (é o que o SDK documenta) — hoje o
  `menuOf` fica com a primeira linha, o que está errado quando o `builtin` vem depois; a regra muda e ganha
  cenário, e o sem marca aparece como encoberto, salvo se tiver nome qualificado;
- **antes da sessão** (rascunho, D-07): `GET /catalog?workspacePath=` serve comandos, skills e modelos do
  catálogo por versão do CLI e pasta (D-13); sem cache, uma query efêmera o preenche uma vez — conta no teto
  de sessões enquanto dura e fecha em seguida, sem ceder prompt. Duas conversas juntas fazem uma chamada;
- o menu filtra enquanto se digita (nome, alias, descrição), descarta resposta velha e, ao escolher,
  insere `/nome ` com a dica de argumento como placeholder. Catálogo indisponível não trava nada: o menu é
  descoberta, não fronteira ([D-05 do plano 04](../04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).

A origem entra no formato de `GET /sessions/:sessionId/commands` como campo novo (`origin`), documentado
em [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#slash-commands).

### B-51 — Do editor para o contexto 🔲

"Adicionar seleção ao chat" no menu de contexto do editor (e atalho) cria o chip do trecho na conversa
ativa da mesma aba; seleção vazia acrescenta o arquivo inteiro; várias seleções (multicursor) viram um
chip por trecho, até o teto. Aba do editor **suja** → o chip avisa que o Claude lê o que está salvo, não
o que está na tela (R-05).

### B-52 — Usabilidade e ajuda do composer 🔲

Uma seção da ajuda do painel, em en e pt-BR: o que `@` e `/` fazem, o que arrastar de cada lugar faz, o
que é o conjunto de contexto e o aviso de tamanho, **o que o Claude lê** (a referência, pelo `Read`, e o
que vai para a trilha) e o que vem do desktop (anexo, não arquivo da pasta), de onde vêm as skills e o que
os selos querem dizer. Tudo operável só por teclado — abrir `@` e `/`, escolher, remover chip, enviar,
interromper —; tooltip em todo controle; axe sem violação; nenhum literal (`lint`, `i18n:check`).

---

## Cenários cobertos

S-197…S-254.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
