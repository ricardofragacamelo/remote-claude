# F0 — Empacotamento

Plano: [06 — Distribuição](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 05](../05-hardening-operations/README.md).
**Entrega:** um comando instala o sistema numa máquina limpa, o sobe como serviço e o deixa
respondendo — e outro o remove sem levar os dados junto.

---

## A restrição que manda nesta fase

O backend **herda o login do Claude** (`~/.claude/.credentials.json`) e roda como o usuário dono
da máquina. Serviço instalado como root, ou como um usuário de sistema, não encontra essa
credencial — e o produto simplesmente não funciona
([04-claude-integration](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)).

Por isso a instalação é **por usuário**, e isso é o primeiro cenário a provar.

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
