#!/usr/bin/env bash
# Confere, de fora, se um livekit-server próprio está de pé — DNS, TLS, a
# porta de sinalização e o TURN. Ver docs/LIVEKIT-SELF-HOST.md.
#
# Roda do SEU computador (não da VPS): o que interessa é o caminho que o
# navegador do aluno vai fazer. Não substitui o teste com duas pessoas em
# redes diferentes — este só pega o que dá para pegar sem abrir uma chamada.
#
#   scripts/livekit-verificar.sh sala.seudominio.com.br [turn.seudominio.com.br]
set -uo pipefail

dominio="${1:-}"
turn="${2:-$dominio}"
if [ -z "$dominio" ]; then
  echo "uso: $0 <dominio-do-livekit> [dominio-do-turn]"
  exit 2
fi

falhou=0
ok()    { echo "  OK    $1"; }
falha() { echo "  FALHA $1"; falhou=1; }

echo "DNS"
# IPv4 de propósito: as portas do firewall são pensadas para ele, e o painel
# da Hostinger mostra o v4. `getent` não existe no Git Bash do Windows, daí o
# `nslookup` de reserva. O texto dele muda com o idioma do sistema ("Name:" /
# "Nome:"), então não se lê rótulo nenhum: o primeiro bloco é o resolvedor,
# tudo depois da primeira linha em branco é a resposta — e dela sai o
# primeiro endereço com cara de v4.
ip=$(getent ahostsv4 "$dominio" 2>/dev/null | awk 'NR==1{print $1}' || true)
[ -z "$ip" ] && ip=$(nslookup "$dominio" 2>/dev/null | tr -d '\r' | awk 'f{print} /^$/{f=1}' \
  | grep -oE -m1 '\b[0-9]{1,3}(\.[0-9]{1,3}){3}\b' || true)
if [ -n "$ip" ]; then ok "$dominio -> $ip"; else falha "$dominio não resolve"; fi

echo "TLS + sinalização (443)"
# O livekit responde OK em / — é o health check mais simples que existe. Um
# certificado inválido ou o Caddy fora do ar derrubam o curl aqui.
if resposta=$(curl -fsS --max-time 10 "https://$dominio/" 2>&1); then
  ok "https://$dominio/ respondeu: ${resposta:0:40}"
else
  falha "https://$dominio/ — $resposta"
fi

echo "WebSocket (o que o navegador abre de verdade)"
# Sem token o servidor recusa com 401 — e é isso que queremos ver: prova que
# a rota /rtc chegou ao livekit, e não ao Caddy ou a um 404 qualquer.
codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGVzdGU=' \
  "https://$dominio/rtc" || true)
if [ "$codigo" = "401" ]; then ok "wss://$dominio/rtc chega ao livekit (401 sem token, como esperado)"
else falha "wss://$dominio/rtc devolveu HTTP $codigo (esperava 401)"; fi

echo "ICE por TCP (7881)"
if timeout 5 bash -c "</dev/tcp/$ip/7881" 2>/dev/null; then ok "$ip:7881 aberto"
else falha "$ip:7881 fechado — libere 7881/tcp no painel e no ufw"; fi

echo "TURN (3478/udp)"
# UDP não tem handshake; o máximo que dá para fazer daqui é um pedido STUN e
# esperar a resposta. `nc` é o que existe na maioria das máquinas.
if command -v nc >/dev/null 2>&1; then
  pedido=$'\x00\x01\x00\x00\x21\x12\xa4\x42abcdefghijkl'
  if printf '%s' "$pedido" | timeout 5 nc -u -w 3 "$turn" 3478 2>/dev/null | head -c 1 | grep -q .; then
    ok "$turn:3478/udp respondeu STUN"
  else
    falha "$turn:3478/udp sem resposta — libere 3478/udp; sem TURN, quem está no 4G não conecta"
  fi
else
  echo "  ?     nc não encontrado; pule ou teste o TURN com duas pessoas em redes diferentes"
fi

echo
if [ "$falhou" -eq 0 ]; then
  echo "OK — o servidor responde por fora. Agora: uma sala com duas pessoas, uma delas no 4G."
else
  echo "Tem coisa fechada. Ver a tabela 'Se der errado' em docs/LIVEKIT-SELF-HOST.md."
  exit 1
fi
