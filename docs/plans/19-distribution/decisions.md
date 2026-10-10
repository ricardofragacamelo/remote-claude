# Plano 19 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Empacotamento

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Quais sistemas operacionais entram no escopo inicial | onde as pessoas que vão usar isto trabalham | B-02 | 2026-09-26 · **Linux, macOS e Windows suportados, teste só em Linux** — decisão do usuário: macOS e Windows ficam sem verificação automatizada, risco declarado no R-03 | ✅ |
| D-02 | O web é servido pelo próprio backend, ou por um processo separado | se alguém vai querer servir o front de outro lugar | B-01 | — | 🔲 |
| D-03 | O Postgres da instalação é container Docker ou serviço nativo | se exigir Docker na máquina do usuário é aceitável | B-01, B-03 | — | 🔲 |
| D-08 | O binário do ripgrep (`@vscode/ripgrep`, 11 · D-01) é baixado na instalação ou empacotado no artefato | se a instalação do usuário tem rede; se o *postinstall* roda sob o `onlyBuiltDependencies` do artefato; o binário por sistema operacional da D-01 | B-01 | — | 🔲 |
| D-09 | Ajuste às diretivas do plano 28: pré-requisito, credencial, portão de atualização e versão por motor | — (as normas estão no [plano 28](../28-agent-neutral-core/README.md) e na [discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#9-planos-afetados)) | B-02, B-05, B-12, B-15 | 2026-10-10 · ajuste às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico), pedido do usuário: o `install.mjs` confere os pré-requisitos de cada motor habilitado (CLI e local da credencial, pela descrição do motor) em vez do Claude por nome (B-05); a herança de `~/.claude/.credentials.json` é o caso do Claude de uma credencial por motor (B-02, R-02); o portão de atualização do SDK é por motor, com o `smoke-live` daquele motor (B-12); a versão aparece por motor (B-15); o plano continua o último, com o 28 entre os pré-requisitos | ✅ |

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

### D-08 — o binário do ripgrep

Aberta em 2026-09-28 pela [D-01 do plano 11](../11-search/decisions.md#d-01--de-onde-vem-o-ripgrep):
a busca usa o `@vscode/ripgrep` com versão fixada, que baixa o binário da plataforma no
*postinstall*. No desenvolvimento, isso é uma entrada no `onlyBuiltDependencies`. Na instalação do
usuário, sobram duas saídas: o artefato leva o binário de cada sistema operacional, ou a instalação
precisa de rede. O `RC_RIPGREP_PATH` cobre quem já tem o `rg` instalado.

---

### D-09 — ajuste às diretivas do plano 28

O [plano 28](../28-agent-neutral-core/README.md) roda antes deste. O que ele muda aqui é a forma, não
a entrega: nenhum script de distribuição conhece o Claude por nome; o que um motor precisa
(binário, versão mínima, onde mora a credencial, como se loga) vem da descrição dele, e o que é só do
Claude — o `~/.claude/.credentials.json`, o `@anthropic-ai/claude-agent-sdk` — é o caso dele dessa
regra. A D-01 continua igual: a instalação é por usuário **porque** cada motor herda a credencial
do usuário dono.

---

## F1 — Exposição

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | **Como o backend é alcançado de fora**: túnel, VPN ou porta com TLS | onde o usuário estará quando aprovar algo pelo celular | B-08, e a F1 inteira | 2026-09-26 · **fora do produto: a exposição é da infraestrutura**, decisão do usuário — ela provê o endereço externo que web e celular alcançam; o produto aceita ser servido atrás dele (URL externa configurável) e o default continua loopback | ✅ |
| D-05 | De onde vem o certificado: `mkcert` local, Let's Encrypt, ou o do túnel | depende de D-04 | B-08 | 2026-09-26 · **da infraestrutura**, consequência da D-04: quem publica o endereço termina o TLS; o produto não emite nem gerencia certificado | ✅ |

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
