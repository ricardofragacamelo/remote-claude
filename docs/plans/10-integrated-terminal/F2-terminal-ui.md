# F2 — Interface do terminal

Plano: [10 — Terminal integrado](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-pty.md), e do [plano 06](../06-workbench/README.md) (o painel inferior, as
abas de pasta, a command palette, a moldura de tela com ajuda e as Configurações).
**Entrega:** o terminal no painel inferior do workbench, como no VS Code — vários terminais, divisão
lado a lado, perfis, busca no scrollback, links clicáveis, marcas de comando —, a aba Saída com a
saída dos `Bash` do Claude, as recusas e a reautenticação na tela, a seção Configurações › Terminal
e a ajuda de tudo isso.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — A feature `terminal` no web: service, hooks e estado por aba de pasta 🔲

`web/src/features/terminal/`, na cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md#onde-o-websocket-entra-na-cadeia)): o service
fala os comandos `terminal.*` pelo cliente WS e o `GET /terminals` pelo `api.ts`; os hooks
(`useTerminals(folder)`, `useTerminal(terminalId)`) expõem estado e ações.

- O estado é **da aba de pasta** (store por pasta, como o 06 exige): terminal de uma aba nunca
  aparece em outra.
- Aba de pasta inativa **mantém** os terminais anexados. É a exceção à suspensão de recursos da
  D-11 do plano 06, e precisa estar dita lá: suspender deixaria a carência matar o shell.
- Reconexão do socket nunca reenvia `terminal.open`: lista e reanexa. Resposta atrasada da lista
  não apaga um terminal aberto depois dela.

### B-17 — O componente de terminal 🔲

Fecha a [D-11](decisions.md#d-11--xtermjs-renderizador-carregamento-e-teste). xterm.js atrás de uma
porta (`TerminalView`), carregado sob demanda, com a medição do bundle registrada.

- **Entrada:** teclas coalescidas abaixo do `maxFramesPerSecond` do `connection.ready.limits`;
  colagem acima de `maxFrameBytes` fatiada em ordem; colagem de **várias linhas** pede confirmação
  mostrando o texto (o shell executaria cada linha), exceto com bracketed paste ativo no shell.
- **Tamanho:** fit ao painel, um `terminal.resize` por debounce.
- **Tema:** as cores do terminal saem dos tokens do tema claro/escuro e trocam sem recarregar
  ([tema](../../architecture/web/03-ui-system.md#tema)).
- **Copiar/colar:** atalhos (Ctrl/Cmd+Shift+C/V, e Ctrl/Cmd+C com seleção), menu de contexto,
  copiar ao selecionar como preferência; sem permissão de área de transferência → aviso traduzido
  que diz o que fazer.
- **Acessibilidade** ([a11y](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional)):
  modo leitor de tela do xterm, um atalho documentado para o foco **sair** do terminal (sem
  armadilha de teclado) e a visão acessível do buffer como texto, como a do VS Code.

### B-18 — O painel inferior: vários terminais, divisão e a aba Saída 🔲

- Abas de terminal: novo (com escolha de perfil), alternar, fechar, renomear, ícone e cor; o título
  segue o `terminal.titleChanged` até ser renomeado. Fechar um terminal com programa em primeiro
  plano pede confirmação que o **nomeia**; shell ocioso fecha sem perguntar — confirmação só para o
  destrutivo.
- **Dividir**: dois (ou mais) terminais lado a lado no mesmo grupo, cada um o seu PTY e o seu
  tamanho; fechar um devolve o espaço ao outro.
- Limpar, matar, selecionar tudo, maximizar e restaurar o painel; ``Ctrl+` `` alterna o painel.
- **Aba Saída:** o `tool.progress` dos `Bash` das sessões que a aba de pasta observa, com ANSI,
  seguir ao vivo, copiar e limpar. A fonte são os eventos `tool.*` do contrato atual; quem anexa as
  sessões à aba é o [plano 08](../08-claude-panel/README.md) — sem sessão, o estado vazio ensina
  onde ela aparece.
- Fechar a aba de pasta com terminais pede confirmação que diz que eles encerram na carência.
- Abaixo de `md`, o painel vira uma view da barra de abas do 06, sem scroll horizontal
  ([responsividade](../../architecture/web/03-ui-system.md#responsividade)).

### B-19 — Busca, links e marcas de comando 🔲

Tudo sobre o buffer local do xterm; o backend não participa.

- **Busca no scrollback** (Ctrl/Cmd+F com o foco no terminal): regex, caixa, palavra inteira,
  realce de todas, próxima/anterior, contador; regex inválida é validada na hora.
- **Links:** URL `http`/`https` abre em nova aba com `noopener`; `javascript:`, `data:` e `file:`
  nunca viram link. Caminho `arquivo:linha:coluna`, relativo ao `cwd` atual (vindo da shell
  integration, ou a pasta do terminal sem ela), abre no editor do
  [plano 07](../07-explorer-and-editor/README.md) na linha; caminho fora da pasta aberta não vira
  link. Enquanto o editor do 07 não existe, caminho não vira link.
- **Marcas de comando** (com a shell integration, [D-12](decisions.md#d-12--shell-integration)):
  sucesso/falha na margem, ir para o comando anterior/próximo, selecionar a saída de um comando,
  copiar o comando. Sem integração, os controles somem em vez de falhar.
- **Contexto para o Claude:** "enviar seleção ao Claude" e a fonte do `@terminal` do plano 08 —
  a seleção, ou as últimas N linhas, com teto. É o humano escolhendo o que vai ao prompt.
- **"Executar seleção no terminal"** no menu do editor do 08: manda o texto ao terminal ativo; sem
  terminal, abre um — sujeito ao step-up.

### B-20 — Recusas, reautenticação e reconexão na tela 🔲

Os quatro estados de tela ([padrões de UI](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre))
e cada recusa com texto que diz o que fazer:

- `TERMINAL_DISABLED` → quem liga e onde (o arquivo da máquina), sem botão de tentar de novo;
- `STEP_UP_REQUIRED` → diálogo que explica por que, e redireciona ao provedor com `max_age`; na
  volta, o botão reaparece e o terminal **não** abre sozinho — abrir um shell é sempre um clique do
  humano. O diálogo avisa que a volta precisa caber na carência dos terminais abertos;
- `TERMINAL_LIMIT_REACHED` → o número e como liberar uma vaga;
- reconectado → rótulo discreto, sem saída duplicada; encerrado → código, motivo traduzido e "novo
  terminal"; `terminal.detached` → "aberto em outra janela" e "trazer para cá".

### B-21 — Configurações › Terminal 🔲

A seção que o [plano 06](../06-workbench/README.md) reservou:

- **do servidor, só leitura, com o porquê:** se o terminal está ligado para você, a janela de
  step-up e os limites;
- **perfis:** detectados, personalizados (criar, editar, remover, com validação inline) e o padrão —
  pelo `PUT /terminals/profiles`;
- **preferências** (fonte, tamanho, cursor, linhas de scrollback do cliente, copiar ao selecionar,
  aviso de colagem, shell integration ligada) onde a D-13 do 06 mandar; com armazenamento bloqueado,
  a tela funciona com os padrões. Mudança aplica aos terminais abertos, sem reabrir.

### B-22 — Usabilidade e ajuda do terminal 🔲

Sobre a moldura de tela do plano 06 (propósito e gaveta de ajuda), para o painel, a aba Saída e a
seção de Configurações, em `en` e `pt-BR`, escrita para quem nunca viu o produto:

- a ajuda diz o que o terminal é, **o que ele não protege** (fora da permissão e da allowlist), o
  que é registrado (abrir, reanexar, fechar) e o que **não** é (as teclas, a saída), e cada estado;
- tooltip em todo controle de ícone; "saiba mais" em cada recusa levando à seção certa da ajuda;
- os atalhos (alternar painel, novo terminal, dividir, buscar, ir para comando, sair do foco)
  registrados na command palette do 06; com o foco no terminal, as teclas vão ao shell, exceto as
  que o workbench reserva — e a ajuda lista quais;
- estado vazio que ensina: como abrir, e — desligado — por quê e quem liga;
- axe sem violação no painel, na busca e nas Configurações, nos dois temas.

---

## Cenários cobertos

S-123…S-163.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
