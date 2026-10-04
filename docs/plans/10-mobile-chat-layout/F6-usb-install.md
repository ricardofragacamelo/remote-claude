# F6 — O app instalado por USB, com o endereço da rede

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-connection-address.md) — a origem única, a tela de endereço e o login de cada
origem.
**Entrega:** `pnpm mobile:install` instala no celular ligado por USB um APK de debug que fala com a
stack do `pnpm dev` **sem o cabo**: o endereço interno é o IP desta máquina na rede local, e o externo
é a origem que o `pnpm dev:public` publica. O comando diz no console quais endereços usou, e de onde
veio cada um.

**Decisões que precisam estar fechadas para começar:** [D-20…D-23](decisions.md#f6--instalação-por-usb),
todas fechadas em 2026-10-04.

---

## Por quê

O `pnpm dev:mobile` roda o app pelo `adb reverse`: o interno é `http://localhost:<web>`, e o app só
alcança a máquina enquanto o cabo está ligado e o `flutter run` de pé. Para usar o app de verdade —
pela casa, pelo escritório —, ele precisa ficar instalado e alcançar a stack pela rede.

Pela rede local não há TLS, e a [D-14](decisions.md#f5--endereço-de-conexão) só aceitava `http://` para
o próprio celular. A [D-20](decisions.md#f6--instalação-por-usb) abre a exceção da rede privada, só no
build de debug.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-34 — A origem da rede privada no app ✅

- `checkOrigin` aceita `http://` para um IPv4 literal de rede privada (`10/8`, `172.16/12`,
  `192.168/16`) quando o build não é de produto (`dart.vm.product` falso — o debug). No release, a
  regra da D-14 fica inteira. Nome de host (`http://server.local`) e IP público continuam recusados:
  o que se aceita é um endereço que só existe dentro da rede.
- O `network_security_config.xml` de **debug** passa a liberar texto puro na plataforma
  (`base-config`): o Android não sabe dizer "uma faixa de IP", e o AppAuth busca o issuer pela rede
  da plataforma. Quem decide para onde o app fala em texto puro é o `checkOrigin`. O release continua
  sem o arquivo.
- O motivo da recusa (`connectionProblemPlainText`) diz que a rede local vale no build de
  desenvolvimento, em `en` e `pt-BR`.

### B-35 — A stack atende pela rede ✅

- `lanAddress` escolhe o IPv4 privado de uma interface física: pula `docker*`, `br-*`, `veth*`,
  `virbr*`, `vboxnet*`, `vmnet*`, `tun*`, `tap*`, `wg*`, `tailscale*`, `zt*`. `RC_LAN_ADDRESS`, no
  `.env`, escolhe outro — o caso de quem tem Wi-Fi e cabo ao mesmo tempo.
- O `pnpm dev` passa a aceitar o login pela rede: `withWebIssuer` soma
  `http://<IP da rede>:<web>/realms/<realm>` aos issuers aceitos
  ([ADR-021](../../architecture/shared/00-decisions.md)), uma vez.
- O servidor do web escuta em todas as interfaces no modo local (`host: true`), como o backend e o
  Keycloak já fazem. O modo público não muda.
- O `pnpm dev:public` grava a origem que o túnel abriu em `.run/public-origin` (ignorado pelo git),
  para o instalador saber qual é sem subir o túnel.
- O quadro de endereços do `pnpm dev` mostra o endereço da rede (`network`) do web e do backend e, no
  `pnpm dev:public`, os públicos: o web, a API, o health, o WebSocket e o issuer pela origem do túnel
  (`public …`). O console admin fica fora, porque não é encaminhado (20 · D-06).

### B-36 — `pnpm mobile:install` ✅

`scripts/install-mobile.mjs`:

1. lê o `.env` e resolve os dois endereços, com a origem de cada um
   ([D-22](decisions.md#f6--instalação-por-usb)), e **os imprime**: interno, externo, realm, aparelho;
2. recusa antes de qualquer build o que não pode dar certo — `.env` incompleto, nenhum endereço,
   externo que não é `https`, Flutter fora do PATH, nenhum aparelho USB autorizado, mais de um sem
   `--device`;
3. `flutter build apk --debug` com os defines, e `adb -s <serial> install -r` do APK;
4. avisa, sem falhar, quando a stack não responde pelo endereço interno — instalar não depende dela;
5. ao sair, para o servidor `adb` que ele mesmo subiu e os daemons do Gradle.

`--dry-run` só resolve e imprime os endereços. `--device <serial>` escolhe o aparelho.

### B-37 — Provas e documentação ✅

Unit e integração do script com `adb` e `flutter` de mentira, unit do Dart e do web, o teste dos
manifestos, e o README (comando e passo a passo), o `mobile/README.md`, o `mobile/03`, o `mobile/04` e
o `.env.example`. O e2e é a instalação num aparelho de verdade
([S-140](scenarios.md#f6--instalação-por-usb)): pede um celular no cabo, e fica com quem o tem.

---

## Cenários cobertos

S-121…S-140.

## Critério de conclusão

```bash
pnpm verify:full           # portões 1-11, sai com código 0
pnpm mobile:install        # com um celular no cabo: instala, e o app entra pelo interno sem o cabo
```
