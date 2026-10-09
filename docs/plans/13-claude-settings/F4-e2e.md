# F4 — E2E e smoke-live

Plano: [13 — Configuração do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-project-config.md).
**Entrega:** o plano provado pela porta do usuário — padrão que chega à sessão, servidor MCP pelo
segundo passo até a trilha, segredo que não volta, `.mcp.json` aprovado por conteúdo, tool MCP pedindo
permissão, arquivo de `.claude/` criado pelo modelo — e, contra o Claude real, que o CLI faz o que a
F0 mediu.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-41 — E2E: padrões e diagnóstico 🔲

Playwright com o SDK roteirizado ([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)):
trocar o modelo e o modo padrão pela tela, abrir uma sessão pelo painel e ver `session.started` e o
indicador do painel com o padrão; sobreposição da pasta vencendo a do usuário; o diagnóstico da
instalação e o teste de conexão, com o resultado descrito. Cenários S-185, S-186.

### B-42 — E2E: o ciclo do servidor MCP 🔲

Adicionar um servidor stdio de fixture ([D-19](decisions.md#d-19--servidor-mcp-de-fixture)) com um
segredo em env, pelo segundo passo; ver o `claude.mcpServerAdded` na trilha (`/audit`, ou a linha do
tempo do [plano 14](../14-audit-explained/README.md) se já existir); conferir na rede e na tela, e depois
de recarregar, que o valor do segredo nunca volta; abrir sessão, desligar o servidor pela tela e ver o
indicador da sessão mudar. Cenários S-187…S-189.

### B-43 — E2E: `.mcp.json` e tool MCP 🔲

Pasta com `.mcp.json` de fixture: aparece pendente; aprovar; a sessão nova tem o servidor; alterar o
arquivo põe a entrada em "alterado" e a sessão seguinte não o tem. O SDK roteirizado emite um
`tool_use` `mcp__fixture__echo`: o card de permissão aparece com o risco destrutivo; negar → a tool não
roda, e a trilha tem o registro e a negação. Cenários S-190, S-191.

### B-44 — E2E: configuração de projeto 🔲

Criar um slash command pelo modelo inicial, salvar no editor e usá-lo no menu do painel; um subagent de
fixture com `permissionMode` no frontmatter aparece sinalizado; hooks do `.claude/settings.json`
aparecem só leitura; uma skill de usuário de fixture aparece com o selo Usuário, e desligar a origem a
tira do `/` do painel; pasta que saiu da allowlist mostra a recusa traduzida com caminho de volta.
Cenários S-192…S-194.

### B-45 — E2E: usabilidade e acessibilidade 🔲

axe sem violação nas sete seções; o fluxo de adicionar servidor inteiro pelo teclado; viewport de
celular sem scroll horizontal, com a navegação de seções virando seletor; a gaveta de ajuda abre, está
traduzida nos dois idiomas, e o "saiba mais" de um campo leva à seção certa. Cenário S-195.

### B-46 — `smoke-live` e compatibilidade do app 🔲

No `smoke-live` (`pnpm test:e2e:live`, sob demanda —
[plano 01 · D-12](../01-live-session/decisions.md#d-12--onde-o-smoke-live-roda)), contra o Claude real e
a fixture gerada por execução: lista de modelos e conta não vazias; servidor de fixture `connected` pela
composição strict; uma tool MCP real passando pelo `canUseTool` e pelo `PreToolUse`; o segredo ausente
do `cmdline`; e o subagent de projeto com `permissionMode: acceptEdits` não escrevendo sem o
`canUseTool` — ou, se o CLI escrever, o cenário registra o resultado medido, a tela o avisa e o risco
fica aberto. E, pelas skills: uma skill de usuário real carregando pelo plugin sintético; a `allow` de
`~/.claude/settings.json` do `CLAUDE_CONFIG_DIR` isolado **continuando** sem dispensar o `canUseTool`
(regressão da D-11); e a política de shell inline valendo como a D-21 decidir. É o que avisa quando uma versão nova do CLI muda o que a F0 mediu.

`pnpm test:e2e:mobile` verde com os tipos Dart regenerados: o app não ganha tela nova, mas não pode
quebrar com os campos e o evento novos (mobile fora do escopo, exceto compatibilidade de contrato).

E a **conversa** do app em paridade com a do web ([D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)):
as fixtures que só este plano consegue gravar, pela via real e não pelo spike do 26, entram na paridade de
conteúdo do [plano 26 · B-28](../26-mobile-conversation-parity/F6-parity-gate.md#b-28--a-paridade-de-conteúdo-por-fixture-) e passam nas duas pontas:

- uma tool de servidor MCP **composto pelo backend** (`setMcpServers()`), sem título;
- uma skill de **usuário** carregada pelo plugin sintético (B-35);
- um slash command e um subagent de **projeto** criados pelo modelo inicial (B-33, B-36), com a permissão que o
  subagent volta a pedir (D-23);
- uma sessão com o output style padrão da B-15.

O `render:check` sai verde, sem entrada `pending`: um componente que este plano acrescentar à conversa do web
(o indicador de MCP não é da conversa) entra no mapa com o par no app. Cenário S-214.
Cenários S-196…S-199.

---

## Cenários cobertos

S-185…S-199, S-214.

---

## Critério de conclusão

```bash
pnpm verify:full       # o portão 11 roda o render:check do plano 26
pnpm test:e2e:mobile
pnpm test:e2e:live
```
