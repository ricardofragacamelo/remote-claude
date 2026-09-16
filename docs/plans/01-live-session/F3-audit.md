# F3 — Auditoria

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-session-runtime.md).
**Entrega:** o módulo `audit` gravando, de forma append-only, **toda** invocação de tool — não
só as que pedem humano.

---

## Por que antes da permissão

Porque a ordem inversa é uma armadilha conhecida: com o `canUseTool` pronto, é natural
pendurar a trilha nele — e aí **toda leitura de arquivo e todo comando auto-aprovado ficam de
fora**. Foi medido: 6 tool calls → 6 hooks `PreToolUse` → 2 `canUseTool`
([descoberta §7.3](../../discovery/01-descoberta-claude-agent-sdk.md#73--canusetool-não-é-chamado-para-toda-tool)).

Entregando a trilha primeiro, o `canUseTool` chega ao mundo já no seu papel: **aprovação**,
não registro.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-21 — Domínio `audit` 🔲

Registro imutável com `who`, `what`, `when`, `where` (device/IP), o `input` **exato** da tool e
a `decision` — [backend/03](../../architecture/backend/03-modules.md#audit).

Sem update, sem delete: a entidade não tem setter, e o repositório não expõe operação que não
seja escrita ou leitura.

### B-22 — Tabela append-only e migration 🔲

O append-only é garantido **no banco**, não só na intenção do código: a permissão do papel da
aplicação não inclui `UPDATE` nem `DELETE` na tabela de auditoria.

Trilha que o próprio sistema pode reescrever não é trilha.

### B-23 — Hook `PreToolUse` ligado ao módulo 🔲

`adapter/outbound/claude/audit-hook.ts`: registra e **deixa passar** (`{ continue: true }`).
Ele não decide — decisão é do `canUseTool`, e confundir os dois é o buraco que esta fase
existe para fechar.

O hook é `audit` write-only para os outros módulos: todo mundo escreve, ninguém lê de dentro
do fluxo.

### B-24 — Falha de escrita bloqueia a autorização 🔲

Sem trilha, não autoriza. A falha é `error` no log e chega à UI como evento de erro — falha
silenciosa aqui significaria execução sem registro, que é exatamente o que não pode acontecer
num sistema que roda `Bash` na máquina do usuário.

---

## Cenários cobertos

S-40…S-49.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
