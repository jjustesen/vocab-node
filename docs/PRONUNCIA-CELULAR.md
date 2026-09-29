# Pronúncia no celular — investigação de 29/09/2026

O que foi medido sobre a leitura em voz alta no celular, o que foi decidido,
e o que ficou de fora. **Nada daqui foi implementado** além do que já estava
em produção: o registro existe para a próxima pessoa não repetir o caminho.

## Como funciona hoje (e continua assim)

```
Computador: reconhecedor do navegador (grátis) + gravação em paralelo
  → navegador entendeu: nota na hora, áudio vai junto para o professor
  → navegador não entendeu: o áudio vai para tarefa-pronuncia, Gemini transcreve

Celular: só gravação
  → aluno toca "Terminei de ler" (ou teto de 30s)
  → áudio vai para tarefa-pronuncia, Gemini transcreve
```

Código: `app/src/features/tarefa/RespostaPronuncia.tsx` (aparelho),
`supabase/functions/tarefa-pronuncia` e `supabase/functions/_shared/ia/transcricao.ts`
(servidor). A frase-alvo **nunca** vai para o Gemini — ver o cabeçalho de
`transcricao.ts`.

**Decisão (29/09/2026): no celular, sempre gravar + Gemini.** O professor
sempre tem o áudio da leitura; o custo é uma chamada ao Gemini por leitura no
celular. Alternativas avaliadas e recusadas estão abaixo.

## O incidente do 401 — cuidado ao publicar

As funções chamadas pelo aluno **sem login** precisam ser publicadas com
`--no-verify-jwt` (lista no README). O projeto não tem `supabase/config.toml`,
então um `supabase functions deploy tarefa-pronuncia` sem a flag publica com
o padrão — **exigir JWT** — e a função passa a responder 401 para todo aluno:

- no celular a tela mostra "Ouvi você, mas não entendi as palavras";
- no computador a nota aparece, mas a resposta **não é salva** (o envio é em
  segundo plano e o erro fica escondido) — e o aluno pode não conseguir
  concluir a tarefa.

Foi isso que derrubou a pronúncia em 29/09, e não o código: desfazer as
mudanças não resolveu; republicar com a flag resolveu.

```bash
supabase functions deploy tarefa-pronuncia --no-verify-jwt
```

Proposta em aberto (não feita): um `supabase/config.toml` com
`verify_jwt = false` para as funções que o README publica assim, para o
deploy simples não quebrar de novo.

## O que foi medido

### Gemini não é o gargalo

Chamada idêntica à de `transcricao.ts`, feita de dentro do Supabase, com uma
voz lendo "I would like a cup of coffee, please.":

| Formato | Status | Tempo no Gemini | Transcrição |
|---|---|---|---|
| WAV 16 kHz | 200 | ~2s | exata |
| webm/Opus (gravado pelo motor do Chrome) | 200 | ~1,9s | exata |

A queixa original ("cerca de 1 minuto para o aprove") vem de antes do Gemini:
no celular não há parada automática, então a gravação vai até o toque em
"Terminei de ler" ou até o teto de 30s (`DURACAO_MAXIMA_MS`).

### Reconhecedor do navegador no Android (Samsung Fold 7, Chrome 154)

| Teste | Resultado |
|---|---|
| Reconhecedor + gravação em paralelo | reconhecedor recebe silêncio (`onaudiostart`, nunca `onsoundstart`); gravação ouve tudo |
| Reconhecedor com a mesma faixa da gravação (`recognition.start(faixa)`) | Chrome aceita o parâmetro, mas o reconhecedor continua ouvindo silêncio |
| Só o reconhecedor, sem gravação | funciona — mas sem áudio para o professor |

No Android o microfone é exclusivo: quem abre por último fica com ele. Não
há, hoje, como ter o reconhecimento grátis **e** o áudio gravado na mesma
leitura nesse aparelho.

## Alternativas avaliadas

- **Navegador primeiro, gravação só na 2ª tentativa** — grátis na maioria das
  leituras, mas o professor fica sem áudio quando o navegador acerta.
  Recusada: o áudio para o professor é prioridade.
- **Professor escolhe por atividade** ("guardar áudio das leituras") — viável,
  pede campo novo + migration. Não priorizada.
- **API de transcrição em tempo real** (Deepgram, AssemblyAI, OpenAI Realtime,
  Gemini Live) — áudio por WebSocket enquanto o aluno fala, resposta ~1–2s
  depois do fim. Exige token temporário gerado por Edge Function e a gravação
  como reserva para 4G instável. Custo por segundo transmitido. Não feita.
- **Parada automática no silêncio** (medir o volume e encerrar ~2–3s depois da
  fala) — é o que mais encurta a espera no celular. Foi publicada em 29/09 e
  revertida junto com o resto quando o 401 apareceu; a causa real era o
  deploy, não ela. Pontos de atenção se for retomada:
  - no iPhone o `AudioContext` precisa nascer dentro do toque, senão fica
    suspenso e o medidor lê silêncio;
  - medidor "mudo" (onda cravada em 128) não pode ser tratado como aluno
    calado — senão corta a leitura e pula o servidor;
  - não mudar junto o formato da gravação (bitrate/mono/redução de ruído):
    testar uma coisa por vez.

## Como testar no celular antes de publicar

Foi o que faltou em 29/09. Com cabo USB e depuração USB ligada no aparelho:

```powershell
# o adb do Android SDK (a pasta platform-tools antiga no PATH não existe mais)
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:5174 tcp:5174
```

- O servidor local precisa escutar em IPv4, senão o celular não conecta
  (o `adb reverse` entrega em 127.0.0.1): `npm run dev -- --host 127.0.0.1 --port 5174`.
- No celular: `http://localhost:5174/t/<token>` — `localhost` libera o
  microfone sem HTTPS. O backend é o Supabase de produção: respostas enviadas
  assim ficam gravadas de verdade.
- No computador: `chrome://inspect/#devices` → **inspect** na aba do celular →
  Network (`tarefa-pronuncia`) e Console.
