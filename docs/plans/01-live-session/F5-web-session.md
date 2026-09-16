# F5 — Web da sessão

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-permission.md).
**Entrega:** a tela onde o produto acontece — stream da conversa, execução de tool visível,
fila de permissão e os controles da sessão.

---

## Por que só agora

Porque UI contra contrato que ainda muda é UI reescrita. Com F0…F4 verdes, o front consome um
contrato estável e um backend que já se comporta — e o que sobra para depurar aqui é o front.

Leia [web/04-state-and-data](../../architecture/web/04-state-and-data.md) e
[web/03-ui-system](../../architecture/web/03-ui-system.md) antes do primeiro componente.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-32 — Store de stream com as três regras 🔲

Zustand, por sessão, com o que [web/04](../../architecture/web/04-state-and-data.md#o-store-de-stream)
exige e não pode faltar:

1. descarta evento com `seq <= lastSeq` — replay reentrega;
2. `gap: true` limpa o store e recarrega por HTTP, sem costurar buraco;
3. `message.delta` acumula **por `messageId`**, e `message.completed` substitui o acumulado.

A terceira fecha a dívida que o bootstrap registrou: o redutor não existia porque o evento não
existia ([progresso do plano 00](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado)).

### B-33 — `wsClient` estendido 🔲

Os comandos novos, reconexão com backoff exponencial **com jitter** (1 s → 30 s), `attach` com
`resumeFromSeq`, e `connection.reauthenticate` quando o token expira com o socket aberto.

Não conhece React. Nunca reconecte em laço apertado.

### B-34 — Tela da sessão 🔲

Conversa, status da sessão e composer (React Hook Form + Zod). Os quatro estados de tela, e a
sessão ativa **na URL** — colar o link em outro dispositivo tem que reproduzir a tela.

Abrir `/sessions/:id` de uma sessão **já encerrada** mostra o estado terminal (motivo, hora)
**e** faz replay do que o ring buffer ainda tiver, rotulado como **parcial**
([D-10](decisions.md#d-10--abrir-o-que-já-acabou)). Sem o rótulo, ausência de conteúdo é lida
como ausência de atividade — pior do que não mostrar nada.

São **dois ramos, os dois reais**: buffer presente e buffer perdido. O segundo não é caso de
borda; é o que acontece depois de todo restart do backend. O histórico de verdade continua sendo
o [plano 04](../04-transcript-and-resume/README.md).

### B-35 — Execução de tool visível 🔲

`tool.started` / `tool.progress` / `tool.completed` viram um card com o comando exato,
monoespaçado e rolável. O usuário está acompanhando execução na própria máquina; truncar o
comando esconde justamente o que importa.

### B-36 — Fila de permissão 🔲

Contagem regressiva até `expiresAt`; estado `pending` que **não** aceita segundo clique;
expirou → sai como negada, sem pedir confirmação; resolvida em outro dispositivo → some
sozinha, mostrando quem resolveu.

Perder a corrida **não** é erro na tela — ver [a fila](../../architecture/web/04-state-and-data.md#a-fila-de-permissão).

### B-37 — Controles da sessão 🔲

`interrupt`, `setModel`, `setPermissionMode` e `close`. Fechar é só do dono; para os demais o
controle aparece desabilitado **com explicação** — esconder regra de autorização transforma
segurança em bug aparente.

### B-38 — i18n das telas novas 🔲

Chaves em `en` **e** `pt-BR`, escritas primeiro em inglês, sem concatenar fragmento e sem
markup no valor — [02-i18n](../../architecture/shared/02-i18n.md).

`pnpm i18n:check` verde: paridade, sem órfã, params casando.

---

## Cenários cobertos

S-66…S-75, S-96, S-97.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
