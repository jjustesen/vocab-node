#!/usr/bin/env bash
# Roda o job de repasse (supabase/functions/repasses-diario) uma vez, à mão.
#
# Enquanto o agendamento diário não está ligado, rode isto uma vez por mês:
#
#   bash supabase/repasse-manual.sh
#
# Ele faz o mesmo que o job faria: renova (ou encerra) os planos contratados
# pelo professor que venceram e transfere os repasses cujo período já
# terminou. Rodar duas vezes não transfere duas vezes.
#
# O segredo fica em supabase/.env.repasse (fora do git), o mesmo que está na
# secret CRON_SECRET das funções.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.repasse ]; then
  echo "Falta supabase/.env.repasse com CRON_SECRET=..." >&2
  exit 1
fi
CRON_SECRET=$(grep '^CRON_SECRET=' .env.repasse | cut -d= -f2-)

curl -sS -X POST "https://tizhbmhmhttciolbtoft.supabase.co/functions/v1/repasses-diario" \
  -H "x-cron-secret: ${CRON_SECRET}" \
  -H "x-region: sa-east-1" \
  -H "Content-Type: application/json" \
  -d '{}'
echo
