# Plano 06 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Empacotamento

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Quais sistemas operacionais entram no escopo inicial | onde as pessoas que vão usar isto trabalham | B-02 | — | 🔲 |
| D-02 | O web é servido pelo próprio backend, ou por um processo separado | se alguém vai querer servir o front de outro lugar | B-01 | — | 🔲 |
| D-03 | O Postgres da instalação é container Docker ou serviço nativo | se exigir Docker na máquina do usuário é aceitável | B-01, B-03 | — | 🔲 |

### D-01 — três mecanismos diferentes

systemd (`--user`), launchd e o agendador do Windows não se parecem. Suportar os três de uma vez
é três vezes o trabalho e três vezes a superfície de teste; é o [R-03](README.md#riscos-e-decisões-em-aberto).

O que não muda: a instalação é **por usuário**, porque o backend herda o login do Claude — um
serviço rodando como outro usuário não encontra `~/.claude/.credentials.json` (S-02).

### D-03 — quem carrega o banco

O desenvolvimento já exige Docker ([R-05 do bootstrap](../00-bootstrap/README.md#riscos-e-decisões-em-aberto)),
mas exigir Docker de quem só quer **usar** o produto é outra conversa: é um pré-requisito
pesado numa máquina de trabalho. Postgres nativo tira o peso e acrescenta um caminho de
instalação por sistema operacional.

---

## F1 — Exposição

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | **Como o backend é alcançado de fora**: túnel, VPN ou porta com TLS | onde o usuário estará quando aprovar algo pelo celular | B-08, e a F1 inteira | — | 🔲 |
| D-05 | De onde vem o certificado: `mkcert` local, Let's Encrypt, ou o do túnel | depende de D-04 | B-08 | — | 🔲 |

### D-04 — a decisão mais séria do plano

Quem alcança este backend executa comando arbitrário na máquina, com as credenciais do usuário.
Não é uma escolha de conveniência de rede.

- **Túnel** (o provedor publica um endereço e encaminha): funciona atrás de NAT, sem abrir porta
  — e coloca um terceiro no caminho.
- **VPN**: nada exposto na internet, e exige a VPN instalada nos dois lados.
- **Porta com TLS**: sem terceiro, e depende de IP alcançável, certificado e de o usuário
  entender o que abriu.

O default não muda em nenhuma hipótese: **loopback**, e sair dele é explícito, com TLS, ou o
processo não sobe (S-13, S-14).

---

## F2 — Atualização

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Atualizar o SDK é automático com portão verde, ou sempre manual | com que frequência o SDK quebra algo — o `smoke-live` do [plano 01](../01-live-session/F6-e2e.md) vai dizer | B-12 | — | 🔲 |
| D-07 | Onde o backup é escrito por default, e quanto tempo é guardado | espaço disponível na máquina do usuário | B-14 | — | 🔲 |

---

## F3 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que já está decidido)* | — | — | — | — |

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
