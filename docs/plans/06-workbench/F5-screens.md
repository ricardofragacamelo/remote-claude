# F5 — Telas separadas: uma por assunto (web)

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-commands.md).
**Entrega:** cada assunto na sua tela, dentro da moldura e com a moldura de tela: Auditoria e
Regras com o conteúdo de hoje, Dispositivos, Logs e diagnóstico (o ping), Configurações do app e
Sobre; a home desmontada — nada mais de cards de assuntos diferentes empilhados — e as rotas antigas
de sessão e histórico removidas.

---

## Por quê

O pedido é explícito: "não misture os assuntos, uma tela para cada coisa". A casca da F3 e os
serviços da F4 já existem; esta fase **muda de lugar** o que já estava pronto e cria as telas que
só este plano tem (Configurações, Sobre). A profundidade de cada tela movida é de outro plano, e
este não a antecipa:

| Tela | Aqui | A profundidade |
|---|---|---|
| Auditoria | a trilha de hoje, na moldura | [14 — Auditoria explicada](../14-audit-explained/README.md) |
| Regras | as regras de hoje, na moldura | [15 — Gestão de regras](../15-rules-management/README.md) |
| Dispositivos | a lista de hoje, que sai da home | [17 — Dispositivos](../17-devices/README.md) |
| Logs e diagnóstico | o ping, que sai da home | [18 — Logs e diagnóstico](../18-logs-and-diagnostics/README.md) |
| Configuração do Claude | só a posição na navegação | [13 — Configuração do Claude](../13-claude-settings/README.md) |
| Uso e custo | só a posição na navegação | [16 — Uso e custo](../16-usage-and-cost/README.md) |

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-28 — Auditoria e Regras como telas próprias ✅

`/audit` e `/rules`, `/rules/$ruleId` passam a morar na moldura, cada uma na sua entrada da
navegação, com a moldura de tela (B-19) e o conteúdo de hoje — sem redesenho. As garantias de
[web/03 · Trilha](../../architecture/web/03-ui-system.md#trilha-de-auditoria) e
[web/03 · Regras](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada)
continuam valendo: filtros na search, a trilha filtrada é um link inclusive depois do login, a regra
abre em qualquer estado. A ajuda da tela é a mínima que o conteúdo de hoje sustenta; a completa é
dos planos 14 e 16.

### B-29 — Dispositivos como tela própria ✅

O `DeviceList` sai da home para `/devices`, entrada própria da navegação — **não** uma seção de
Configurações: aprovar um aparelho é uma decisão de segurança, e mora ao lado das outras. Aprovar e
revogar funcionam como hoje; a ajuda diz o que um aparelho aprovado pode fazer. O resto — último
acesso, push de teste, histórico — é do [plano 17](../17-devices/README.md).

### B-30 — Logs e diagnóstico, mínima ✅

`/diagnostics` nasce com o que existe: o **ping de ponta a ponta** (`diag.ping`, o
`SessionPingPanel` que sai da home), o estado da conexão do socket e o botão de reconectar. Ping com
o socket fechado → `NETWORK_UNREACHABLE` traduzido, com a ação. Dois pings seguidos: cada resposta
casa com o seu pedido. Visualizador de logs e saúde da instalação são do
[plano 18](../18-logs-and-diagnostics/README.md) ([D-12](decisions.md#d-12--o-que-a-tela-logs-e-diagnóstico-tem-neste-plano)).

### B-31 — Configurações do app ✅

`/settings/$section`, uma seção por vez, com a lista de seções à esquerda (em cima abaixo de `md`)
e busca pelas opções. Seções deste plano ([D-13](decisions.md#d-13--onde-vivem-as-configurações-do-app-e-quais-seções-entram)):

- **Aparência** — tema (claro, escuro, do sistema), idioma, densidade;
- **Workspaces** — as raízes liberadas **só leitura** (nenhum controle de edição: mudar a
  allowlist exige acesso ao disco), com o comando `pnpm allowlist add <caminho>` copiável e a
  explicação de onde ele roda; as pastas recentes, com fixar e remover.

As seções são um **registro**: o [plano 07](../07-explorer-and-editor/README.md) registra "Editor" e o
[plano 12](../12-integrated-terminal/README.md) "Terminal"; sem registro, a seção não aparece. Nenhuma
seção trata do Claude — modelo, permission mode e MCP são da tela do plano 13, e o teste do registro
recusa a mistura. Seção desconhecida na URL cai na primeira, sem erro. Toda opção mostra o valor
padrão e tem "restaurar padrão".

### B-32 — Sobre ✅

`/about`, pelo menu de gerenciar e pela paleta: as versões do backend, do web, do Agent SDK, do CLI
do Claude e do Node (B-12), com "copiar" do bloco inteiro para um relato de defeito; o que não se
pôde ler aparece como tal, com o motivo. Links para a documentação do repositório e a licença.

### B-33 — A home desmontada, e as rotas antigas ✅

- a home deixa de ter `WorkspaceSelector`, `SessionStarter` solto, `SessionPingPanel` e
  `DeviceList` — cada um foi para o seu lugar (boas-vindas, workbench, Logs e diagnóstico,
  Dispositivos);
- `/` com abas abertas passa a levar à aba ativa, e sem abas segue a boas-vindas (S-05, movido da
  F3 pela [D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)) — é na mesma mudança que ping
  e dispositivos saem da home, que ele deixa de esconder alguma coisa;
- o store global `useWorkspaceStore.selected` **deixa de existir**: pasta é da aba (B-20). É a raiz
  do caso relatado, e sai com teste que impede a volta;
- o `Screen` de coluna única sai, e com ele as rotas `/sessions/$sessionId`, `/history` e
  `/history/$conversationId` ([D-07](decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)) — sem
  deep link de compatibilidade. `SessionRoute`, `HistoryRoute`, `ConversationRoute` e as navegações
  que levam a elas (`app/navigation.ts`, `App.tsx`) saem; iniciar uma sessão mantém o usuário na aba
  da pasta, com a sessão na secondary side bar. Ler, continuar e desfazer uma conversa **antiga**
  pelo web volta com a view Sessões do [plano 08](../08-claude-panel/README.md);
- na **mesma mudança**, os specs de e2e que entravam por essas rotas migram — contrato quebrado numa
  ponta só é bug. `commands-and-undo` passa a abrir a sessão pela aba da pasta; em
  `history-and-resume`, o que tem porta no workbench passa a entrar por ela, e o que só tinha porta
  em `/history` (retomar pela tela, conversa removida) **sai** do e2e do web — nunca `skip` —, com os
  cenários do plano 04 que ele provava registrados como devolvidos ao plano 08. O app continua
  provando o histórico no `integration_test`.

### B-34 — Usabilidade e ajuda das telas deste plano ✅

A task explícita de "ajuda de verdade", para a boas-vindas, o diálogo Abrir pasta, o workbench,
Dispositivos, Logs e diagnóstico, Configurações e Sobre:

- conteúdo do painel de ajuda (B-19) de cada uma, escrito para quem nunca viu o produto, em `en` e
  `pt-BR`: o que é a tela, o que cada estado significa, o que ela não mostra nem registra, atalhos;
- **tooltip** e `aria-label` traduzidos em todo controle só de ícone;
- todo **estado vazio ensina** o próximo passo com uma ação; todo **erro diz o que fazer**;
- "saiba mais" nos pontos de dúvida (allowlist, fechar aba não encerra sessão, teto de abas) leva
  à seção certa da ajuda;
- cada atalho listado na ajuda executa o que diz — lido do registro, testado por isso.

---

## Cenários cobertos

S-05 (da F3, pela [D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)), S-136…S-154, e os
descobertos na execução, S-200…S-206 ([D-32](decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
