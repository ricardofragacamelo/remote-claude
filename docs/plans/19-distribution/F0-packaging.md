# F0 — Empacotamento

Plano: [19 — Distribuição](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 05](../05-hardening-operations/README.md) e dos planos 06 a 18 — a
distribuição é o último plano, e empacota o produto que eles entregam
([índice](../README.md#planos)) —, com o [28](../28-agent-neutral-core/README.md) entre eles: o que
é de um motor vem da descrição dele ([D-09](decisions.md#d-09--ajuste-às-diretivas-do-plano-28)).
**Entrega:** um comando instala o sistema numa máquina limpa, o sobe como serviço e o deixa
respondendo — e outro o remove sem levar os dados junto.

---

## A restrição que manda nesta fase

O backend **herda o login do Claude** (`~/.claude/.credentials.json`) e roda como o usuário dono
da máquina. Serviço instalado como root, ou como um usuário de sistema, não encontra essa
credencial — e o produto simplesmente não funciona
([04-claude-integration](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)).

Por isso a instalação é **por usuário**, e isso é o primeiro cenário a provar.

Essa herança é o **caso do Claude** de uma regra mais geral do
[plano 28](../28-agent-neutral-core/README.md): cada motor habilitado tem a sua credencial no lugar
dele (`~/.claude/` para o Claude, o login do GitHub ou o `~/.codex/` para outros —
[discovery 03 §6.9](../../discovery/03-multiplos-motores-de-agente.md#69-instalação-autenticação-e-diagnóstico)),
e o serviço por usuário precisa achar a de **cada um**. Quem sabe onde ela mora é a extensão do motor,
não o instalador.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — Artefato do backend e do web 🔲

Build do backend e do web, com o web servido pelo próprio backend na instalação local — uma
porta, uma origem, um serviço. Duas portas seriam duas superfícies para proteger na F1.

### B-02 — Serviço do SO, por usuário 🔲

Unidade de serviço do usuário (systemd `--user` no Linux, launchd no macOS), rodando como quem
instalou. Sobe no login, reinicia ao falhar, e para limpo — o shutdown ordeiro da
[F0 do plano 05](../05-hardening-operations/F0-limits.md) depende disso.

O escopo de sistemas suportados é **declarado**: o que não for suportado é dito, não fingido.

### B-03 — Migration na subida 🔲

Aplicada atrás do advisory lock que já existe desde o bootstrap. Duas instâncias subindo juntas
não aplicam a mesma migration duas vezes.

### B-04 — Configuração assistida, e que falha rápido 🔲

Allowlist de workspace, issuer OIDC, porta e locale. Valor ausente ou inválido **impede o
processo de subir**, dizendo qual variável e o que se esperava — nunca default silencioso.

Aqui isso é mais forte do que em desenvolvimento: allowlist mal configurada numa instalação
real é acesso ao disco inteiro.

### B-05 — `install.mjs`, com código de saída honesto 🔲

Pré-requisitos primeiro (reaproveitando o `doctor.mjs`), depois instalação, depois verificação
pós-instalação. Falhou em qualquer etapa: sai ≠ 0 dizendo **qual**.

Os pré-requisitos de agente são **por motor habilitado** (`ENGINES_ENABLED`): para cada um, o CLI
dele e o local da credencial, como a descrição do motor os declara (`describe()`: instalado, versão,
versão mínima, autenticado), e não uma lista com o Claude escrita no script. A verificação
pós-instalação pergunta o mesmo ao backend instalado, pelo `GET /engines`.

Entra na seção **Comandos** do [README.md](../../../README.md#comandos) e no
[catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) na mesma entrega.

### B-06 — Desinstalar 🔲

Remove o serviço, **mantém os dados** e diz onde eles ficaram. Desinstalador que apaga banco
sem avisar é o tipo de surpresa que ninguém perdoa; e rodar duas vezes é inofensivo.

---

## Cenários cobertos

S-01…S-12.

---

## Critério de conclusão

```bash
pnpm verify
pnpm dist:verify
```
