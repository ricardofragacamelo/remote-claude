# F1 — Exposição

Plano: [19 — Distribuição](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-packaging.md).
**Entrega:** o sistema só é alcançável de onde alguém decidiu explicitamente que ele seria — e
nunca sem TLS fora do loopback.

> **Não comece com o R-01 em aberto**: como o usuário alcança o backend de fora — túnel, VPN ou
> porta com TLS. Ver [riscos](README.md#riscos-e-decisões-em-aberto).

---

## Por que esta fase é a mais séria do plano

Este backend executa `Bash` na máquina do usuário, com as credenciais dele. Uma porta aberta
sem querer aqui não é uma falha de configuração: é shell remoto para quem achar.

A postura, portanto, é a inversa da usual: **o default não expõe nada**, e o caminho para expor
é explícito, com TLS, e recusado quando incompleto.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-07 — Loopback por default 🔲

Sem configuração, o backend escuta apenas em `127.0.0.1`. Quem quer mais precisa dizer que
quer, e onde.

### B-08 — TLS fora do loopback 🔲

Exposto em qualquer interface que não seja loopback, exige TLS — certificado local confiável ou
o túnel escolhido no R-01. HTTP puro fora do loopback não é uma opção configurável.

Certificado inválido ou expirado → erro claro na subida, não conexão degradada.

### B-09 — Origem conhecida, na API e no socket 🔲

CORS estrito e origem verificada também no handshake do WebSocket
([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake)).
Cabeçalhos de segurança em toda resposta.

### B-10 — Revisão do caminho de exposição 🔲

Uma leitura dedicada do que fica alcançável, com o que cada porta permite fazer, registrada em
`docs/architecture/shared/` se criar regra nova — e como ADR se mudar uma decisão.

Não é cerimônia: é a última chance de alguém olhar para o conjunto antes de o produto ficar
alcançável pela rede.

O caminho revisado inclui o **encaminhamento por caminho**, registrado pelo
[plano 10 · B-27](../10-mobile-chat-layout/F5-connection-address.md) para esta fase: a infraestrutura
que publica o endereço externo ([D-04](decisions.md)) faz o que o servidor do web faz no dev e no e2e
([10 · D-16](../10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão)) — numa origem só,
`/api` (sem o prefixo, com o cookie de refresh de `/auth` movido para `/api/auth`), `/ws` (com
upgrade), `/realms` e `/resources` do provedor, e **nunca** o console admin. O provedor fica sem
hostname fixo, atrás dos `X-Forwarded-*` que essa infraestrutura manda, e a origem externa entra em
`OIDC_ADDITIONAL_ISSUERS`
([ADR-021](../../architecture/shared/00-decisions.md#adr-021--o-backend-aceita-uma-lista-explícita-de-issuers-do-mesmo-realm)).

### B-11 — Configuração insegura impede a subida 🔲

Escutar em `0.0.0.0` sem TLS, origem curinga, ou TLS com certificado ilegível: o processo
**não sobe**. É a mesma regra que já vale para toda configuração inválida neste projeto, e aqui
ela é a que evita o pior caso.

---

## Cenários cobertos

S-13…S-22.

---

## Critério de conclusão

```bash
pnpm verify
pnpm scan:security
```
