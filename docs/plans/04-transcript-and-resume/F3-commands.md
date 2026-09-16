# F3 — Slash commands

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-resume.md).
**Entrega:** o menu de comandos da **instalação** local, e o `/init` funcionando pelo fluxo
normal.

---

## O que já está resolvido

O requisito de "gerar README, AGENTS.md" não é código nosso: é um comando do Claude Code, e
enviar `"/init"` como prompt **dispara o comando** — verificado por spike
([descoberta §7.1](../../discovery/01-descoberta-claude-agent-sdk.md#71--init-funciona-como-slash-command-pelo-sdk)).

O que é código nosso é o menu. E ele **não** pode ser uma lista fixa: varia por instalação e
por versão (57 comandos na instalação medida, 54 com `settingSources: []`).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-14 — `supportedCommands()` exposto 🔲

O backend expõe o que a instalação oferece. Lista hardcoded é proibida — ela envelhece na
primeira atualização do CLI e passa a oferecer comando que não existe.

Comando ou endpoint novo é mudança de contrato: schema, TS, Dart e o
[documento](../../architecture/shared/05-websocket-protocol.md) na mesma entrega.

### B-15 — Menu nas duas pontas 🔲

A UI monta a partir da resposta, como lista buscável. Instalação sem um comando não o mostra;
instalação sem nenhum continua utilizável — a caixa de prompt não depende do menu.

Filtra interno (`__`) e morto (`(removed)`, `Renamed to`) por **metadado**, nunca por nome, e
põe um grupo de sugeridos por cima ([D-05](decisions.md#d-05--o-menu-é-descoberta-não-fronteira)).
O menu é descoberta, não fronteira: impedir comando é regra de deny.

### B-16 — `/init` pelo fluxo normal 🔲

Sem atalho e sem privilégio: a sessão explora o projeto e escreve o arquivo com `Write`, o que
**pede autorização**. Isso é correto — é escrita no projeto do usuário.

### B-17 — Cache por instalação e versão 🔲

A lista é cacheada e invalidada quando a versão do CLI muda. Duas sessões pedindo ao mesmo
tempo fazem **uma** chamada.

---

## Cenários cobertos

S-29…S-36.

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
```
