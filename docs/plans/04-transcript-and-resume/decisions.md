# Plano 04 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Transcript

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Quais sessões do VSCode aparecem: todas as de `~/.claude/projects/`, ou só as dos workspaces da allowlist | o que o usuário espera ver, e o que ele consideraria vazamento | B-02 | — | 🔲 |
| D-02 | Tamanho da página do transcript, e se a leitura começa pelo fim | tamanho típico de uma conversa real — não medido | B-04 | — | 🔲 |

### D-01 — o que aparece de fora

O transcript vive no mesmo arquivo que o VSCode usa, então **tudo** que foi conversado na
máquina está ao alcance. Listar tudo é coerente com "a máquina é do usuário"; listar só o que
está na allowlist mantém a mesma fronteira que vale para executar — e evita que um projeto que o
usuário deliberadamente não liberou apareça na tela do celular.

Recomendado: restringir à allowlist, com a origem visível, e reavaliar se alguém reclamar da
falta.

---

## F1 — Telas de histórico

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | A lista é por workspace (entra-se no workspace e vê-se as sessões) ou global com filtro | quantos workspaces e quantas sessões por workspace | B-06 | — | 🔲 |

---

## F2 — Retomada

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Retomar uma sessão que está **aberta agora** no VSCode: permitir, avisar ou recusar | o que o CLI faz com dois consumidores na mesma sessão — **exige spike** | B-12 | — | 🔲 |

### D-04 — duas bocas no mesmo arquivo

`persistSession: true` compartilha o JSONL com o VSCode, e é isso que permite continuar do
celular o que começou no editor. O que não foi medido é o caso simultâneo: o editor com a sessão
aberta e nós retomando a mesma.

Até o spike responder, a opção segura é **avisar e recusar** — uma conversa com dois donos
produz transcript intercalado, e o usuário não tem como saber qual lado escreveu o quê.

---

## F3 — Slash commands

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | A UI mostra todos os comandos da instalação (57 na medida) ou um subconjunto curado | quais são úteis remotamente — vários pressupõem terminal interativo | B-15 | — | 🔲 |

---

## F4 — Desfazer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | O que `rewindFiles()` faz com arquivo alterado **fora** da sessão depois do checkpoint | comportamento do SDK — **exige spike**; é a diferença entre desfazer e perder trabalho | B-18, B-21 | — | 🔲 |

### D-06 — desfazer sem destruir

O desfazer existe como rede de segurança de quem aprova de longe. Se ele sobrescrever alteração
que o usuário fez à mão no editor depois do checkpoint, ele deixa de ser rede e vira risco.

O spike responde e a resposta muda a UI: se sobrescreve, a confirmação precisa listar esses
arquivos em destaque — ou o rewind precisa recusá-los.

---

## F5 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Contra qual repositório descartável o `smoke-live` roda o `/init` | o `/init` **escreve** no projeto; não pode ser o nosso | B-25 | — | 🔲 |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md).
3. Rode `pnpm plan progress`: o contador sai daqui, no [progresso do plano](progress.md) e no
   [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
