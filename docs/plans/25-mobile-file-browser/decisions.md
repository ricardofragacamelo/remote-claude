# Plano 25 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

Os IDs D-01…D-18 são os da [discovery §16](../../discovery/07-navegador-de-arquivos-no-app.md#16-decisões-em-aberto),
para que o rastro de lá continue valendo; as novas começam na D-19. As decididas no planejamento
(2026-10-08) seguem a recomendação da discovery, conferida contra o código, e são as técnicas ou as de
efeito pequeno e reversível. As que mudam o que o usuário vê de forma marcante ou a segurança (D-01,
D-03, D-12, D-18) foram decididas **pelo usuário** no mesmo dia, assim como o critério das que
dependem de captura ou de medida (D-02, D-09, D-10), que ficam 🔄 até a captura ou o spike. Ficam
abertas só as que dependem de medida sem critério a escolher (D-06, D-20, D-22).

---

## F0 — Spike dos motores

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Motores de markdown e de PDF. Markdown: `flutter_markdown_plus`, `gpt_markdown`, `markdown_widget`; PDF: `pdfrx`, `syncfusion_flutter_pdfviewer` (licença comercial), `flutter_pdfview` (nativo, sem seleção de texto) | se o `flutter_markdown_plus` deixa o HTML fora e entrega links e imagens a callbacks nossos (S-02); se o `pdfrx` convive com o `flutter test` atrás de porta (S-03); o APK somado (S-05) | F3…F5 | — *(recomendação: `flutter_markdown_plus` + `pdfrx`, ambos de licença livre e mantidos)* | 🔲 |
| D-09 | Teto de texto no celular: (a) os 10 MB do servidor; (b) um teto menor do app (p. ex. 2 MB), acima disso "baixar" | tempo de abertura e memória de 1, 5 e 10 MB, e de uma linha única de 1 MB, no emulador (S-06) | B-15 | 2026-10-08, **pelo usuário**, o critério: **pela medida do spike** — o teto é o maior tamanho que abre rápido e sem pico de memória no emulador. Fecha com o número da B-03 | 🔄 |
| D-10 | Motor do Mermaid: (a) WebView com o `mermaid.js` embutido; (b) `merman` (Rust por FFI); (c) `flutter_mermaid` (Dart puro) | a fidelidade do `merman` nos oito diagramas contra o `mermaid.js` (S-04), o primeiro desenho e o APK de cada um (S-05). (c) já está fora: não desenha classe, estado, ER nem mindmap | F4 (B-21) | 2026-10-08, **pelo usuário**, o critério: **(b) `merman` se a fidelidade passar** no S-04 (as diferenças aceitas ficam registradas); senão **(a)**, com a ADR da R-14. Fecha com o resultado da B-02 | 🔄 |
| D-19 | Número do plano | — | o plano | 2026-10-08: **25**, criado no fim da lista sem renumerar, como os 22, 23 e 24. Não depende de nenhum plano em aberto; o ponto de contato com o 21 é a D-20 | ✅ |
| D-23 | Onde vive o código do spike | — | B-01…B-03 | 2026-10-08: **fora da árvore** — um app mínimo no scratchpad da sessão (ou numa worktree descartável), nunca em `mobile/`. Fica no repositório só o que ele mediu: a tabela no `progress.md` e o resultado das D-06, D-09, D-10 e D-22. Um spike dentro de `mobile/` arrastaria dependências e cobertura para o portão antes de a escolha existir | ✅ |

## F1 — Normas e a sessão encoberta

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | O pedido escondido sob uma tela empilhada ([discovery §4.3](../../discovery/07-navegador-de-arquivos-no-app.md#43-achados-colaterais), achado 1): (a) `RouteAware` na `SessionPage`; (b) faixa "o Claude está esperando" no leitor; (c) as duas | — | B-08, B-18 | 2026-10-08: **(c)**. (a) é o conserto, e vale também para o histórico, que já tem o problema; entra na F1, antes do leitor existir. (b) é o que a pessoa vê sem sair do arquivo, e entra com o leitor (B-18) | ✅ |
| D-12 | Ler a pasta de um aparelho **pendente** ([discovery §4.3](../../discovery/07-navegador-de-arquivos-no-app.md#43-achados-colaterais), achado 2): (a) como hoje, o Bearer basta; (b) exigir aparelho aprovado nas rotas de leitura de `files` | — | B-32, B-09 | 2026-10-08, **pelo usuário**: **(b), exigir aparelho aprovado**, reconhecendo o app **pelo cliente do token** (`azp`), e não pelo cabeçalho. Todo `/files/*` cujo token não é do cliente web (`OIDC_CLIENT_ID_WEB`) exige um `x-install-id` aprovado daquele usuário — sem ele, pendente ou desconhecido, `403 DEVICE_NOT_REGISTERED`; revogado, `403 DEVICE_REVOKED` (os dois já estão no catálogo). Tirar o cabeçalho não contorna. Entra a [B-32](F1-norms.md#b-32--aparelho-aprovado-para-ler-a-pasta-) na F1, e o plano deixa de ser "o backend não muda". Assistir a sessão continua permitido ao pendente ([shared/08](../../architecture/shared/08-authentication.md)): ler a pasta é mais que assistir | ✅ |
| D-24 | Token sem `azp`, ou com um `azp` que não é nenhum dos dois clientes configurados | — | B-32 | 2026-10-08, no planejamento, decorrência da D-12: **fecha** — só o token cujo `azp` é o cliente web dispensa o aparelho; qualquer outro (o do app, um desconhecido, nenhum) exige `x-install-id` aprovado. Abrir para o desconhecido faria do `azp` ausente um jeito de contornar a regra | ✅ |

## F2 — Painel de arquivos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Lado da barra lateral: (a) `endDrawer`, à direita; (b) à esquerda, trocando o conteúdo do `drawer` conforme o botão | — | B-10 | 2026-10-08, **pelo usuário**: **(a), `endDrawer` à direita**. Dois slots, dois estados independentes, e o lado diz qual painel é | ✅ |
| D-02 | A barra da sessão com 4 ícones: (a) 4 ícones; (b) o histórico vai para o `⋯`, ficam 3 | a captura em 360 dp com fonte em 200 %, com o quarto ícone: o título e o chip continuam legíveis? | B-10 | 2026-10-08, **pelo usuário**, o critério: **pela captura** — 4 ícones se couber; se o título e o chip sumirem, o histórico vai para o `⋯`. A captura fica no `progress.md` | 🔄 |
| D-03 | Ícone do botão: (a) `account_tree_outlined`; (b) `file_copy_outlined` (o do Explorer do VS Code); (c) `source_outlined` | — | B-10 | 2026-10-08, **pelo usuário**: **(a), `account_tree_outlined`**, o que mais se distingue do `folder_copy_outlined` das sessões | ✅ |
| D-04 | Navegação no painel: (a) um nível por vez, com migalha; (b) árvore expansível com recuo | — | B-11 | 2026-10-08: **(a)**. Em 300 a 400 dp, o recuo come a largura em três ou quatro níveis; é o molde dos gerenciadores de arquivo do celular | ✅ |
| D-05 | O painel também na `FolderPage` | — | B-13 | 2026-10-08: **sim**. O mesmo widget, e permite ler arquivos sem abrir sessão. O estado é por pasta, então os dois lugares mostram o mesmo nível (S-45) | ✅ |

## F3 — Leitor de texto e de imagem

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Modelo de zoom: (a) fonte no texto e no markdown, transformação no PDF, na imagem e no diagrama em tela cheia; (b) `InteractiveViewer` em tudo | — | B-16, B-19, B-22 | 2026-10-08: **(a)**. (b) obriga a desenhar o texto inteiro de uma vez (sem virtualização) e não deixa a quebra de linha se refazer ([discovery §8](../../discovery/07-navegador-de-arquivos-no-app.md#8-zoom-e-arrasto)) | ✅ |
| D-08 | SVG: (a) abre como texto; (b) desenhado com `flutter_svg` | — | B-14 | 2026-10-08: **(a)**. SVG é conteúdo ativo, e o pedido não o cita | ✅ |
| D-15 | Mudanças no disco enquanto se lê: (a) recarregar com `If-None-Match` ao voltar ao primeiro plano, ao voltar de outra tela e pelo "atualizar"; (b) assinar `workspace.watch` no app | — | B-18 | 2026-10-08: **(a)**. (b) exige rotear `workspace.*` no `WsClient` sem tocar no `seq` da sessão — o caminho mais sensível do app —, e o ganho sobre o `304` é pequeno | ✅ |
| D-17 | Onde lembrar a quebra de linha: (a) global no aparelho; (b) por arquivo; (c) por extensão | — | B-15 | 2026-10-08: **(a)**, como o VS Code. Guardada com as outras preferências do app, não no armazenamento seguro | ✅ |

## F4 — Markdown e Mermaid

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-18 | Diagrama como **imagem** no app, enquanto o web terá SVG inline com texto selecionável e links ([21 · D-02](../21-rich-previews/decisions.md#f0--normas)): (a) imagem, sem links nem seleção; (b) diagrama num WebView visível, com links pela regra do markdown | — | B-22 | 2026-10-08, **pelo usuário**: **(a), imagem**, sem links nem seleção; tocar abre a tela cheia com zoom. A diferença do web fica escrita no [mobile/04](../../architecture/mobile/04-ui.md) | ✅ |
| D-20 | Versão do Mermaid nos dois clientes, se o web ainda não tem o `mermaid` ([21 · B-16](../21-rich-previews/F3-markdown.md) não começou) | a D-10. Com o `merman`, a versão é a do Mermaid que ele declara (12.1) e o plano registra as diferenças aceitas. Com o WebView, o `mermaid.min.js` precisa de uma fonte de verdade antes de o web existir | B-21 | — *(recomendação, se for o WebView: o app fixa a versão exata no seu `package.json` de assets, copiada por script no build, e o plano 21 · B-16 adota a mesma, com nota cruzada nos dois planos)* | 🔲 |

## F5 — PDF

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-22 | De onde o `pdfrx` lê os bytes: (a) `ApiClient.bytes` → documento em memória; (b) por URI com o Bearer no cabeçalho e leitura por intervalo (`Range`) | o S-01: se o `pdfrx` aceita cabeçalho por URI, se pede `Range` de verdade, e a memória de um PDF de 50 MB nos dois caminhos | B-23 | — *(recomendação: (b) se o S-01 confirmar, porque não segura o arquivo inteiro na memória (R-02); senão (a), com um teto de PDF no app abaixo dos 200 MB do servidor)* | 🔲 |

## F6 — Download

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-13 | Baixar pasta (o zip do `/files/archive`) | — | B-28 | 2026-10-08: **não** agora. O pedido fala de arquivos, e o `/files/archive` existe se vier | ✅ |
| D-14 | Como salvar: (a) "salvar como" do sistema (SAF / seletor do iOS), por canal próprio; (b) o mesmo, por pacote (`file_picker`, `flutter_file_dialog`); (c) direto em Downloads pelo MediaStore | — | B-26 | 2026-10-08: **(a)**. Não pede permissão de armazenamento em nenhuma versão do Android, a pessoa escolhe o lugar, é o gesto do `showSaveFilePicker` do web, e são ~50 linhas de Kotlin e Swift no padrão do canal `remote_claude/push` que o app já tem | ✅ |

## F7 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-16 | Como o e2e passa pelo "salvar como": (a) fake da porta no e2e, com o diálogo nativo coberto pelo teste de JVM; (b) Patrol dirigindo o diálogo do sistema | — | B-30 | 2026-10-08: **(a)**, como o web na [07 · D-26](../07-explorer-and-editor/decisions.md). O DocumentsUI muda entre versões do Android; o download pelo HTTP real e a trilha `file.downloaded` continuam no e2e (S-140) | ✅ |
| D-21 | Como o PDF (e a imagem e o binário) da fixture chega à pasta, se o `makeFolder` do e2e só cria texto por `POST /files` | — | B-29 | 2026-10-08: **pelo `/files/upload` no helper do e2e** (`e2e_environment.dart`), que é o "navegador" do teste, não o app. Os arquivos ficam em `mobile/integration_test/fixtures/`. A regra de "nada de escrita" (B-07) vale para `lib/features/files/`, não para o helper | ✅ |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
