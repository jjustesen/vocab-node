#!/usr/bin/env bash
# Checagem sintática das Edge Functions ANTES do deploy.
#
# `npm run build` (app/) não cobre nada em supabase/functions/ — é outro
# tsconfig, outro runtime (Deno), fora do include do Vite. Sem isto, um erro
# de sintaxe (ex.: crase dentro de outro template literal) só aparece quando
# o bundler remoto do `supabase functions deploy` já está no meio do upload —
# tarde demais para pegar antes de gastar o ciclo de deploy.
#
# Não é typecheck completo (não resolve `jsr:`/`npm:` nem tipos do Deno), só
# sintaxe — mas é exatamente a classe de erro que travou um deploy real em
# 27/07/2026 (ver commit "Redeploy edge functions após TTS + fix de sintaxe").
set -euo pipefail
cd "$(dirname "$0")/.."

falhou=0
for arquivo in $(find supabase/functions -name "*.ts"); do
  if ! npx --yes esbuild "$arquivo" --bundle=false --format=esm --outfile=/tmp/checar-edge-functions.js > /tmp/checar-edge-functions.err 2>&1; then
    echo "FALHOU: $arquivo"
    cat /tmp/checar-edge-functions.err
    falhou=1
  fi
done

if [ "$falhou" -eq 0 ]; then
  echo "OK — todas as Edge Functions passam na checagem de sintaxe."
else
  exit 1
fi
