# LiveKit em servidor próprio (Hostinger VPS, São Paulo)

A sala de vídeo fala com um `livekit-server` — hoje o LiveKit Cloud, amanhã uma
VPS nossa. O app não sabe a diferença: o navegador recebe a URL e um JWT de
`sala-entrar`, e os três secrets do Supabase são o único ponto de troca.

Este guia é o caminho do zero até a primeira aula na VPS. Está escrito para a
Hostinger porque foi ela que escolhemos (data center em São Paulo, porta de
1 Gbps, franquia de 8–16 TB), mas fora a seção do painel serve para qualquer VPS.

## Por que os números são esses

Dimensionamento para o uso previsto — 10 salas 1:1 por 8 h/dia e uma turma de
40 por 2 h/semana. O LiveKit é SFU: cada pessoa envia um vídeo e recebe o de
todo mundo da sala, e o servidor paga a soma do que sai.

| Uso | Pico de saída | Tráfego/mês |
|---|---|---|
| 10 salas 1:1 (20 pessoas), 8 h/dia | ~30 Mbps | ~2,5 TB |
| 1 turma de 40, 2 h/semana | ~150–300 Mbps | ~0,6–1,2 TB |
| **Total** | **~330 Mbps** | **~3–4 TB** |

CPU e memória quase não importam (o SFU não transcodifica). O que decide o
plano é a **porta** (o pico da turma de 40 não passa numa porta de 200 Mbps) e
a **franquia**. Daí o KVM 2 (2 vCPU, 8 GB, 8 TB, 1 Gbps) já servir; o KVM 4 dá
folga para gravar aula no futuro.

O app já faz a parte dele: `adaptiveStream` e `dynacast` estão ligados no
`LiveKitRoom` (`SalaPage.tsx`), o que corta a banda da turma grande pela metade.

## 1. Antes de contratar

- [ ] Um **subdomínio** para o servidor, por exemplo `sala.seudominio.com.br`.
      WebRTC no navegador exige `wss://`, que exige TLS, que exige um nome.
- [ ] Acesso ao DNS desse domínio (para criar o registro A).
- [ ] O Supabase CLI logado no projeto (`supabase link` já feito).

## 2. Contratando na Hostinger

- Plano: **KVM 2** (ou KVM 4).
- Localização: **Brasil – São Paulo**. Isso é escolhido na criação do servidor,
  não no plano.
- Sistema: **Ubuntu 24.04 LTS**. Se o painel oferecer o template
  "Ubuntu com Docker", pegue-o e pule a instalação do Docker abaixo.
- Anote o IP público que aparecer no painel.

### Firewall do painel (hPanel → VPS → Firewall)

A Hostinger tem um firewall próprio, fora da máquina. Crie um grupo e libere:

| Porta | Protocolo | Para quê |
|---|---|---|
| 22 | TCP | SSH |
| 80 | TCP | Caddy emitir o certificado (Let's Encrypt) |
| 443 | TCP | Sinalização (`wss://`) e TURN sobre TLS |
| 7881 | TCP | ICE por TCP (rede que bloqueia UDP) |
| 3478 | UDP | TURN |
| 50000–60000 | UDP | Mídia (áudio e vídeo) |

Se o firewall do painel não estiver ativado, ele não bloqueia nada — mas
confira, porque "UDP bloqueado" é a causa nº 1 de "conecta e o vídeo não
aparece".

## 3. DNS

Crie um registro **A**: `sala` → IP da VPS. Espere propagar antes de subir o
Caddy (`nslookup sala.seudominio.com.br` tem que devolver o IP).

Para o TURN, crie também `turn` → mesmo IP. Pode ser um só nome, mas nomes
separados deixam o `generate` abaixo mais direto.

## 4. Na máquina

```bash
ssh root@IP_DA_VPS
```

### Docker (pule se o template já veio com ele)

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
```

### Firewall da máquina

Mesmas portas do painel. `ufw` já vem no Ubuntu:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 3478/udp
ufw allow 50000:60000/udp
ufw enable
```

### Gerar a configuração

O LiveKit tem um gerador oficial que monta `docker-compose`, `livekit.yaml`
(com API key e secret novos), Redis e Caddy com TLS automático:

```bash
mkdir -p /opt/livekit && cd /opt/livekit
docker run --rm -it -v $PWD:/output livekit/generate
```

Respostas:

- **Primary domain**: `sala.seudominio.com.br`
- **TURN**: sim → domínio `turn.seudominio.com.br`
- **Egress / Ingress**: não (gravação fica para depois)
- **Deploy target**: `docker-compose`

Ele grava tudo em `/opt/livekit/sala.seudominio.com.br/`. Guarde a **API key**
e o **API secret** que aparecem no final — são os que vão para o Supabase.

### Subir

```bash
cd /opt/livekit/sala.seudominio.com.br
docker compose up -d
docker compose logs -f livekit
```

O Caddy emite o certificado sozinho na primeira subida (precisa das portas 80
e 443 abertas e do DNS já apontando). Em um minuto o log do `livekit` mostra
`starting LiveKit server` sem erro.

## 5. Apontar o app

```bash
supabase secrets set \
  LIVEKIT_URL=wss://sala.seudominio.com.br \
  LIVEKIT_API_KEY=APIxxxxxxxx \
  LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxx
```

Nada no front muda. O próximo `sala-entrar` já emite token para o servidor
novo. Para voltar ao Cloud, é o mesmo comando com os valores antigos.

## 6. Verificar

Do seu computador, com o [`lk` CLI](https://docs.livekit.io/home/cli/):

```bash
lk room join --url wss://sala.seudominio.com.br --api-key APIxxx --api-secret xxx --identity teste --publish-demo
```

Ou rode `scripts/livekit-verificar.sh` (ver abaixo) — ele confere DNS, TLS, a
porta de sinalização e o TURN de uma vez.

Depois, o teste que importa: abra uma sala no app com **duas pessoas em redes
diferentes** (uma no 4G). Se conectar e o vídeo aparecer dos dois lados, o UDP
e o TURN estão certos.

## Operação

- **Atualizar**: `docker compose pull && docker compose up -d`.
- **Logs**: `docker compose logs -f livekit`.
- **Ver salas abertas**: `lk room list --url ... --api-key ... --api-secret ...`.
- **Tráfego**: o painel da Hostinger mostra o consumo do mês. Acima de ~6 TB,
  hora de olhar o KVM 4.
- **Reboot**: os containers têm `restart: unless-stopped`; sobem sozinhos.

## Se der errado

| Sintoma | Causa provável |
|---|---|
| `sala-entrar` responde erro | Secrets no Supabase com valor errado (URL sem `wss://`, key/secret trocados) |
| Conecta, mas sem vídeo/áudio | UDP 50000–60000 fechado — no painel OU no `ufw` |
| Funciona no Wi-Fi, não no 4G | TURN não sobe (porta 3478/UDP ou 443/TCP) — `docker compose logs livekit \| grep -i turn` |
| Caddy não emite certificado | DNS ainda não propagou, ou porta 80 fechada |
| Latência alta / vídeo travando | Confirmar que a VPS está em São Paulo, e que o pico não passou da porta (`vnstat` ou o gráfico do painel) |

## Gravação (futuro)

Precisa de outro container (`livekit/egress`) e de CPU de verdade — ele
transcodifica. Quando chegar a hora, é o KVM 4 no mínimo e uma seção nova aqui.
