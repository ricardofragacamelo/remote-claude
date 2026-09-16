# Plano 06 — Distribuição

**Objetivo:** instalar, expor com segurança e atualizar o sistema na máquina de quem vai usá-lo
— sem que isso dependa de alguém lembrar de uma sequência de comandos.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
pnpm dist:verify     # instala numa máquina limpa, sobe, faz o smoke, desinstala — sai com 0
```

O segundo comando nasce neste plano (B-17).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Até aqui o sistema roda **na máquina de quem o desenvolve**, subido por `pnpm dev`. Este plano
trata do que acontece quando ele passa a rodar na máquina de alguém que não vai ler o
repositório.

E há um fato que muda o desenho inteiro desta etapa: **quem alcança este backend executa
comando arbitrário na máquina, com as credenciais do usuário**
([04-claude-integration](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)).

Consequência direta: expor uma porta é uma decisão de segurança, não de conveniência. O default
é loopback, e sair disso exige TLS e uma escolha explícita — configuração insegura **impede o
processo de subir**, como já vale para toda configuração inválida neste projeto.

---

## Escopo

### Entra

| | |
|---|---|
| Artefato instalável, serviço do SO, assistente de configuração, desinstalação | F0 |
| Exposição: loopback por default, TLS obrigatório fora dele, origem conhecida | F1 |
| Atualização com o `smoke-live` como portão, backup e restauração | F2 |
| `pnpm dist:verify` — instalar, subir, smoke e desinstalar numa máquina limpa | F3 |

### Não entra

- **Publicação do app nas lojas.** Assinatura, perfis e revisão são um processo com conta,
  chave e prazo próprios; vira plano ou ADR quando houver a conta.
- **Hospedar o backend fora da máquina do usuário.** Contraria o produto: o Claude que ele
  opera é o que está instalado ali, com o login dali.
- **Instalador gráfico.** O público desta versão usa terminal; um instalador com janela é
  superfície nova para um ganho que ninguém pediu.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Empacotamento](F0-packaging.md) | artefato, serviço, configuração e desinstalação | B-01…B-06 | 🔲 |
| F1 | [Exposição](F1-exposure.md) | loopback, TLS, origem e recusa de configuração insegura | B-07…B-11 | 🔲 |
| F2 | [Atualização](F2-updates.md) | SDK com portão, migration, backup e restauração | B-12…B-15 | 🔲 |
| F3 | [E2E](F3-e2e.md) | o ciclo de instalação provado numa máquina limpa | B-16…B-19 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Instalar numa máquina limpa é um comando, não um roteiro | B-01, B-02, B-05 | [11-validation-protocol](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente) | S-01…S-03 |
| Configuração inválida impede a subida, dizendo o que falta | B-04 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-e-segredo) | S-04…S-06 |
| Migration aplicada na subida, uma vez só | B-03 | [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-07, S-08 |
| Desinstalar não leva os dados junto, e diz onde eles ficaram | B-06 | este plano | S-09, S-10 |
| Pré-requisito ausente reprova antes de instalar | B-05 | [catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) | S-11, S-12 |
| Loopback por default; expor exige TLS e decisão explícita | B-07, B-08, B-11 | [08-authentication](../../architecture/shared/08-authentication.md) | S-13…S-16, S-21 |
| Só origem conhecida fala com a API e com o socket | B-09 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) | S-17…S-20, S-22 |
| Atualizar o SDK tem portão, e o portão é o Claude real | B-12 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-23, S-24, S-27 |
| Atualização preserva dados; migration aplicada nunca é alterada | B-13 | [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-25, S-26 |
| Backup restaurável, e restauração coerente | B-14 | este plano | S-28…S-31 |
| Versão de tudo é visível na UI e no log | B-15 | [03-logging](../../architecture/shared/03-logging.md) | S-32 |
| O ciclo de instalação provado numa máquina limpa | B-16…B-19 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-33…S-38 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
scripts/
├── dist.mjs            empacota backend + web
├── install.mjs         serviço do SO, configuração assistida, verificação pós-instalação
├── uninstall.mjs       remove o serviço, preserva os dados e diz onde estão
├── backup.mjs          dump e restauração do Postgres
└── dist-verify.mjs     `pnpm dist:verify` — o ciclo inteiro numa máquina limpa

backend/src/infrastructure/
├── config/             recusa de exposição insegura no boot
└── http/               cabeçalhos, CORS e origem do socket

docs/architecture/shared/   documento de exposição e de atualização, se a F1 criar regra nova
e2e/scenarios/              o ciclo de instalação
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Como o usuário alcança o backend de fora de casa** — túnel, VPN ou porta com TLS | **decisão em aberto, bloqueia a F1.** Qualquer que seja, o default continua sendo loopback, e a escolha é explícita |
| R-02 | Rodar como serviço do SO precisa herdar o login do Claude (`~/.claude/.credentials.json`) | serviço rodando como outro usuário **não** encontra a credencial — é o primeiro cenário a provar (S-02) |
| R-03 | Sistema operacional: systemd, launchd e Windows têm três mecanismos diferentes | escopo inicial declarado no plano; o que não for suportado é dito, não fingido |
| R-04 | Atualização que roda migration e dá errado no meio | backup obrigatório antes (B-14), e migration aplicada nunca é editada (S-26) |
| R-05 | `dist:verify` precisa de uma máquina limpa de verdade | container descartável; o custo é assumido porque este é o único teste que prova o produto instalado |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. **Feche o R-01 e o R-03 antes da F1.**
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
